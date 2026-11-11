import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { and, DrizzleQueryError, eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, API_TOKEN_PATTERN } from '@/capture/api-contract';
import * as apiTokensModule from '@/server/auth/api-tokens';
import { signComputerCode, signPayload } from '@/server/auth/computer-code';
import type { TenantContext } from '@/server/auth/tenant-context';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members } from '@/server/db/schema/auth';
import { codeRedirect, parseAuthorizeRequest } from '@/server/oauth/authorize';
import { clientRef, readClientId } from '@/server/oauth/clients';
import { OAUTH_SCOPE, RESOURCE } from '@/server/oauth/metadata';
import { searchPassages } from '@/server/search/search';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { app } from './app';

afterEach(() => vi.restoreAllMocks());

const post = (body: unknown) => apiRequest(API_PATHS.oauthClients, { body });

// Espionne console.* : rien de ce que le client a envoyé ne doit y passer.
function spyConsole() {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  return () => spies.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args));
}

describe('POST /api/oauth/clients (L4)', () => {
  it.each([
    ['Claude', 'Claude', ['https://claude.ai/api/mcp/auth_callback'], 'claude.ai'],
    ['ChatGPT', 'ChatGPT', ['https://chatgpt.com/connector/oauth/abc123'], 'chatgpt.com'],
    ['Claude Code', 'Claude Code', ['http://localhost:3118/callback'], '127.0.0.1'],
    [
      'VS Code (bureau)',
      'Visual Studio Code',
      [
        'http://127.0.0.1/',
        'http://127.0.0.1:33418/',
        'https://vscode.dev/redirect',
        'https://insiders.vscode.dev/redirect',
      ],
      '127.0.0.1',
    ],
    [
      'Cursor',
      'Cursor',
      ['https://www.cursor.com/agents/mcp/oauth/callback', 'http://127.0.0.1:54321/oauth/callback'],
      'www.cursor.com',
    ],
  ])(
    'répond 201 à %s, sans jeton ni session, et le client_id se relit',
    async (_who, name, uris, host) => {
      const response = await post({
        client_name: name,
        redirect_uris: uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });

      expect(response.status).toBe(201);
      expect(response.headers.get('content-type')).toContain('application/json');
      const body = await response.json();
      expect(body).toEqual({
        client_id: expect.stringMatching(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/),
        client_id_issued_at: expect.any(Number),
        client_name: name,
        redirect_uris: uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      expect(Math.abs(body.client_id_issued_at - Date.now() / 1000)).toBeLessThan(5);
      expect(await readClientId(body.client_id)).toMatchObject({
        name,
        redirectUris: uris,
        host,
      });
    },
  );

  it('répond 201 avec « none » quand le client demande client_secret_basic', async () => {
    const response = await post({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'client_secret_basic',
    });
    expect(response.status).toBe(201);
    expect((await response.json()).token_endpoint_auth_method).toBe('none');
  });

  it('ne demande ni cookie ni en-tête Authorization, même avec un faux jeton ou un faux cookie', async () => {
    const response = await app.request(API_PATHS.oauthClients, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer leon_pas-un-vrai-jeton',
        cookie: 'better-auth.session_token=faux',
      },
      body: JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }),
    });
    expect(response.status).toBe(201);
  });

  it.each([
    'https://evil.example/cb',
    'https://claude.ai.evil.example/api/mcp/auth_callback',
    'https://claude.ai:8443/api/mcp/auth_callback',
    'http://claude.ai/api/mcp/auth_callback',
    'https://claude.ai/autre',
    'https://chatgpt.com/connector/oauth/a/b',
    'https://chatgpt.com/connector_platform_oauth_redirect?x=1',
    'http://user:pw@127.0.0.1:9/cb',
    'javascript:alert(1)',
    'https://claude.ai/api/mcp/auth_callback#frag',
  ])('répond 400 invalid_redirect_uri pour « %s »', async (uri) => {
    const response = await post({ client_name: 'Claude', redirect_uris: [uri] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_redirect_uri' });
  });

  it('répond 400 pour 6 adresses, pour une adresse de 513 caractères, ou sans adresse', async () => {
    const claude = 'https://claude.ai/api/mcp/auth_callback';
    const long = `http://localhost:1/${'a'.repeat(513 - 'http://localhost:1/'.length)}`;
    for (const redirect_uris of [Array(6).fill(claude), [long], [], undefined]) {
      const response = await post({ redirect_uris });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_redirect_uri' });
    }
  });

  it('répond 400 invalid_client_metadata pour des grant_types sans authorization_code ou des response_types autres que code', async () => {
    const redirect_uris = ['https://claude.ai/api/mcp/auth_callback'];
    for (const extra of [{ grant_types: ['refresh_token'] }, { response_types: ['token'] }]) {
      const response = await post({ redirect_uris, ...extra });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_client_metadata' });
    }
  });

  it('répond 400 pour un corps qui n’est pas un objet JSON', async () => {
    for (const body of ['pas du json', '[]', 'null', '42', '']) {
      const response = await app.request(API_PATHS.oauthClients, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_client_metadata' });
    }
  });

  describe('au plus 4 Ko d’entrée', () => {
    const body = (size: number) => {
      const base = { redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], pad: '' };
      const padding = size - JSON.stringify(base).length;
      return JSON.stringify({ ...base, pad: 'a'.repeat(padding) });
    };

    it('accepte 4 Ko pile', async () => {
      const text = body(4096);
      expect(text).toHaveLength(4096);
      const response = await app.request(API_PATHS.oauthClients, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: text,
      });
      expect(response.status).toBe(201);
    });

    it('refuse 4 Ko + 1 octet : 400, que la taille soit annoncée ou non', async () => {
      const text = body(4097);
      const declared = await app.request(API_PATHS.oauthClients, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(text.length) },
        body: text,
      });
      const streamed = await app.request(API_PATHS.oauthClients, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
          },
        }),
        // @ts-expect-error duplex est requis par Node pour un corps en flux
        duplex: 'half',
      });
      for (const response of [declared, streamed]) {
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_client_metadata' });
      }
    });
  });

  it('ne journalise rien, ni le nom ni les adresses ni le client_id', async () => {
    const logged = spyConsole();
    const ok = await post({
      client_name: 'Nom-secret',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    });
    await post({
      client_name: 'Nom-secret',
      redirect_uris: ['https://evil.example/adresse-secrete'],
    });
    await post('pas un objet');

    expect(ok.status).toBe(201);
    expect(logged()).toEqual([]);
  });

  it('ne répond qu’au POST', async () => {
    const response = await apiRequest(API_PATHS.oauthClients);
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// POST /api/oauth/jeton (L8). Le parcours est celui d'un assistant : il s'inscrit (route), l'utilisateur voit la page
// (parseAuthorizeRequest) et clique « Autoriser » (codeRedirect : une action Next ne se lance pas depuis un test),
// puis l'assistant échange le code contre les jetons.

const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const CHATGPT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const FORM = 'application/x-www-form-urlencoded';

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
const newVerifier = () => randomBytes(32).toString('base64url');

const exchange = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
  app.request(API_PATHS.oauthJeton, {
    method: 'POST',
    headers: { 'content-type': FORM, ...headers },
    body: new URLSearchParams(fields).toString(),
  });

async function team(...names: string[]): Promise<TenantContext[]> {
  return (await newTeam(names, tenantIds)).members;
}

// Un client CIMD (L10) : l'adresse de son document, que `fetch` rend sans le garder en mémoire (no-store). Chaque appel
// de `fetch` est un appel réseau que Leon aurait fait : les tests s'en servent pour montrer quand il n'en fait aucun.
const cimdUrl = () => `https://claude.ai/oauth/m06-${randomUUID()}.json`;
const serveDocument = (url: string) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ client_id: url, client_name: 'Claude Code', redirect_uris: [CLAUDE] }),
          { status: 200, headers: { 'cache-control': 'no-store' } },
        ),
    );

async function register(redirectUri = CLAUDE, name = 'Claude'): Promise<string> {
  const response = await post({ client_name: name, redirect_uris: [redirectUri] });
  return (await response.json()).client_id;
}

type Authorization = { clientId: string; verifier: string; code: string; redirectUri: string };

async function authorize(
  member: TenantContext,
  over: {
    clientId?: string;
    verifier?: string;
    challenge?: string;
    now?: number;
    redirectUri?: string;
  } = {},
): Promise<Authorization> {
  const clientId = over.clientId ?? (await register());
  const verifier = over.verifier ?? newVerifier();
  const request = await parseAuthorizeRequest({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: over.redirectUri ?? CLAUDE,
    state: 'etat-du-client',
    code_challenge: over.challenge ?? challengeOf(verifier),
    code_challenge_method: 'S256',
    scope: OAUTH_SCOPE,
    resource: RESOURCE,
  });
  if ('erreur' in request) throw new Error(`demande refusée : ${request.erreur}`);
  const code = new URL(codeRedirect(request, member, over.now)).searchParams.get('code');
  if (!code) throw new Error('code manquant');
  return { clientId, verifier, code, redirectUri: request.redirectUri };
}

const codeGrant = (granted: Authorization, over: Record<string, string> = {}) => ({
  grant_type: 'authorization_code',
  code: granted.code,
  redirect_uri: granted.redirectUri,
  client_id: granted.clientId,
  code_verifier: granted.verifier,
  ...over,
});

type Tokens = { access_token: string; refresh_token: string };

async function tokensFor(member: TenantContext, over?: Parameters<typeof authorize>[1]) {
  const granted = await authorize(member, over);
  const response = await exchange(codeGrant(granted));
  expect(response.status).toBe(200);
  return { granted, tokens: (await response.json()) as Tokens };
}

const rowsOf = (member: TenantContext) =>
  adminDb
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, member.userId), eq(apiTokens.tenantId, member.tenantId)));

async function expectError(response: Response, error: string) {
  expect(response.status).toBe(400);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(response.headers.get('cache-control')).toBe('no-store');
  // Jamais un mot de plus : ni error_description ni la vérification qui a échoué.
  expect(await response.json()).toEqual({ error });
}

// L'état de /api/mcp pour ce jeton : 401 s'il est refusé, 200 sinon (un `initialize` que le serveur accepte).
const mcpStatus = async (token: string) =>
  (
    await app.request(API_PATHS.mcp, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
  ).status;

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connect(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:3000${API_PATHS.mcp}`),
    {
      fetch: async (url, init) => app.request(url.toString(), init),
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  clients.push(client);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ type: string; text?: string }>;
    structuredContent?: { hits?: unknown[] };
  };
  return { ...result, text: result.content.map((block) => block.text ?? '').join('\n') };
}

describe('POST /api/oauth/jeton : authorization_code (L8)', () => {
  it('parcours complet : inscription, page, code, jeton, puis /api/mcp rend les quatre outils', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const granted = await authorize(paul);

    const response = await exchange(codeGrant(granted));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    const body = await response.json();
    expect(body).toEqual({
      access_token: expect.stringMatching(API_TOKEN_PATTERN),
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: expect.stringMatching(API_TOKEN_PATTERN),
      scope: 'leon',
    });
    expect(body.access_token).not.toBe(body.refresh_token);

    const [row, ...others] = await rowsOf(paul);
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      kind: 'assistant',
      name: 'Claude',
      clientName: 'Claude',
      clientHost: 'claude.ai',
      clientRef: (await readClientId(granted.clientId))?.ref,
      revokedAt: null,
    });
    expect(row?.tokenHash).toBe(apiTokensModule.hashApiToken(body.access_token));
    expect(row?.refreshHash).toBe(apiTokensModule.hashApiToken(body.refresh_token));
    expect(Math.abs((row?.expiresAt?.getTime() ?? 0) - (Date.now() + 3_600_000))).toBeLessThan(
      10_000,
    );

    const client = await connect(body.access_token);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'briefing',
      'fetch',
      'lessons',
      'remember',
      'search',
      'thread',
      'threads',
      'versions',
    ]);
    // F9 : un jeton d'assistant n'ouvre que /api/mcp.
    expect((await apiRequest(API_PATHS.me, { token: body.access_token })).status).toBe(401);
  });

  // L'hôte que Réglages montre est celui où le code est parti, pas celui de la première adresse que le client a inscrite.
  describe('client_host', () => {
    async function hostAfter(registered: string[], returned: string): Promise<string | null> {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const clientId = (
        await (await post({ client_name: 'Claude', redirect_uris: registered })).json()
      ).client_id;
      const granted = await authorize(paul, { clientId, redirectUri: returned });
      expect((await exchange(codeGrant(granted))).status).toBe(200);
      return (await rowsOf(paul))[0]?.clientHost ?? null;
    }

    it('est l’hôte de l’adresse de retour du code, pas celui de la première adresse inscrite', async () => {
      expect(await hostAfter([CLAUDE, CHATGPT], CHATGPT)).toBe('chatgpt.com');
    });

    it('est 127.0.0.1 pour un retour en bouclage, quel que soit le port ou l’écriture de l’adresse inscrite', async () => {
      expect(await hostAfter(['http://localhost:1111/cb'], 'http://localhost:5555/cb')).toBe(
        '127.0.0.1',
      );
      expect(
        await hostAfter([CLAUDE, 'http://127.0.0.1:1111/cb'], 'http://127.0.0.1:5555/cb'),
      ).toBe('127.0.0.1');
    });
  });

  it('accepte le vecteur de l’annexe B de la RFC 7636, un redirect_uri omis, un charset et une casse inhabituelle du type', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const granted = await authorize(paul, {
      verifier,
      challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    });
    const { redirect_uri: _omitted, ...withoutRedirect } = codeGrant(granted);

    const response = await exchange(withoutRedirect, {
      'content-type': 'Application/X-WWW-Form-Urlencoded; charset=UTF-8',
    });

    expect(response.status).toBe(200);
  });

  it('ne demande ni cookie ni en-tête Authorization : un faux jeton ou un faux cookie n’y change rien', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');

    const response = await exchange(codeGrant(await authorize(paul)), {
      authorization: 'Bearer leon_pas-un-vrai-jeton',
      cookie: 'better-auth.session_token=faux',
    });

    expect(response.status).toBe(200);
  });

  describe('invalid_grant : aucune ligne, et la même réponse quelle que soit la vérification qui échoue', () => {
    const refusals: Array<[string, (member: TenantContext) => Promise<Record<string, string>>]> = [
      [
        'code_verifier faux',
        async (m) => codeGrant(await authorize(m), { code_verifier: newVerifier() }),
      ],
      [
        'code_verifier trop court',
        async (m) => codeGrant(await authorize(m), { code_verifier: 'court' }),
      ],
      [
        'code_verifier avec un caractère interdit',
        async (m) => {
          const verifier = `${newVerifier()}+`;
          return codeGrant(await authorize(m, { verifier }));
        },
      ],
      [
        'redirect_uri différent',
        async (m) => codeGrant(await authorize(m), { redirect_uri: `${CLAUDE}/` }),
      ],
      [
        'client_id d’un autre client',
        async (m) => codeGrant(await authorize(m), { client_id: await register(CLAUDE, 'Autre') }),
      ],
      ['code expiré', async (m) => codeGrant(await authorize(m, { now: Date.now() - 200_000 }))],
      [
        'code modifié',
        async (m) => {
          const granted = await authorize(m);
          // Un caractère de la signature change, quel qu'il fût.
          const last = granted.code.slice(-1) === 'A' ? 'B' : 'A';
          return codeGrant(granted, { code: `${granted.code.slice(0, -1)}${last}` });
        },
      ],
      ['code qui n’en est pas un', async (m) => codeGrant(await authorize(m), { code: 'abc' })],
    ];

    it.each(refusals)('%s', async (_what, build) => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');

      await expectError(await exchange(await build(paul)), 'invalid_grant');

      expect(await rowsOf(paul)).toEqual([]);
    });

    it('un code de la CLI (autre but de signature) n’est pas un code d’autorisation', async () => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const granted = await authorize(paul);
      const code = signComputerCode({ e: 'a'.repeat(64), u: paul.userId, t: paul.tenantId });

      await expectError(await exchange(codeGrant(granted, { code })), 'invalid_grant');
      expect(await rowsOf(paul)).toEqual([]);
    });

    it('un membre retiré entre la page et l’échange', async () => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const granted = await authorize(paul);
      await adminDb
        .delete(members)
        .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));

      await expectError(await exchange(codeGrant(granted)), 'invalid_grant');

      expect(await rowsOf(paul)).toEqual([]);
    });
  });

  describe('le client n’est lu qu’après le code, son client_id, son adresse et son verifier', () => {
    it('un client_id inconnu, illisible ou d’un autre client : invalid_grant, sans aucune lecture', async () => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const granted = await authorize(paul);
      const fetched = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('réseau'));

      for (const client_id of [
        'pas-un-client',
        `${granted.clientId}x`,
        'https://claude.ai/oauth/inconnu.json',
        'https://evil.example/client.json',
      ]) {
        await expectError(await exchange(codeGrant(granted, { client_id })), 'invalid_grant');
      }

      expect(fetched).not.toHaveBeenCalled();
      expect(await rowsOf(paul)).toEqual([]);
    });

    it('un code faux, un client_id qui n’est pas celui du code, une adresse ou un verifier faux : le document n’est pas lu', async () => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const url = cimdUrl();
      const fetched = serveDocument(url);
      const forCimd = await authorize(paul, { clientId: url });
      const forOther = await authorize(paul);
      fetched.mockClear();

      for (const fields of [
        codeGrant(forCimd, { code: 'abc' }),
        codeGrant(forCimd, { code: forOther.code }), // un code signé, mais pour un autre client
        codeGrant(forOther, { client_id: url }),
        codeGrant(forCimd, { redirect_uri: `${CLAUDE}/` }),
        codeGrant(forCimd, { code_verifier: newVerifier() }),
      ]) {
        await expectError(await exchange(fields), 'invalid_grant');
      }
      expect(fetched).not.toHaveBeenCalled();
      expect(await rowsOf(paul)).toEqual([]);

      // Le même client avec un bon code : cette fois le document est lu, une fois, pour le nom et l’hôte.
      expect((await exchange(codeGrant(forCimd))).status).toBe(200);
      expect(fetched).toHaveBeenCalledTimes(1);
      expect(await rowsOf(paul)).toMatchObject([
        { clientName: 'Claude Code', clientHost: 'claude.ai' },
      ]);
    });

    it('invalid_client quand le code est bon mais que le document du client ne se lit plus ; ni adresse ni nom dans les journaux', async () => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const url = cimdUrl();
      const fetched = serveDocument(url);
      const granted = await authorize(paul, { clientId: url });
      fetched.mockRejectedValue(new Error('réseau coupé'));
      const logged = spyConsole();

      await expectError(await exchange(codeGrant(granted)), 'invalid_client');

      expect(fetched).toHaveBeenCalledTimes(2);
      expect(await rowsOf(paul)).toEqual([]);
      expect(logged().join('\n')).not.toContain(url);
    });

    it('invalid_client pour un client_id de plus de 4 Ko, sans rien lire', async () => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const granted = await authorize(paul);
      const fetched = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('réseau'));

      await expectError(
        await exchange(codeGrant(granted, { client_id: `https://claude.ai/${'a'.repeat(4096)}` })),
        'invalid_client',
      );

      expect(fetched).not.toHaveBeenCalled();
      expect(await rowsOf(paul)).toEqual([]);
    });
  });

  it('le même code deux fois : la seconde invalid_grant, et le jeton de la première ne marche plus', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const granted = await authorize(paul);
    const first = await exchange(codeGrant(granted));
    const { access_token, refresh_token } = (await first.json()) as Tokens;
    expect(await mcpStatus(access_token)).toBe(200);

    await expectError(await exchange(codeGrant(granted)), 'invalid_grant');

    expect(await mcpStatus(access_token)).toBe(401);
    expect(await rowsOf(paul)).toHaveLength(1);
    const renewal = await exchange({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: granted.clientId,
    });
    await expectError(renewal, 'invalid_grant');
  });

  it('un code servi deux fois à la fois n’en sert qu’un', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const granted = await authorize(paul);

    const responses = await Promise.all([
      exchange(codeGrant(granted)),
      exchange(codeGrant(granted)),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});

describe('POST /api/oauth/jeton : refresh_token (L8)', () => {
  it('rend de nouveaux jetons, et l’ancien accès comme l’ancien renouvellement ne valent plus', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const { granted, tokens } = await tokensFor(paul);
    const renew = (refresh_token: string, client_id = granted.clientId) =>
      exchange({ grant_type: 'refresh_token', refresh_token, client_id });

    const response = await renew(tokens.refresh_token);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const next = await response.json();
    expect(next).toEqual({
      access_token: expect.stringMatching(API_TOKEN_PATTERN),
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: expect.stringMatching(API_TOKEN_PATTERN),
      scope: 'leon',
    });
    expect(next.access_token).not.toBe(tokens.access_token);
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect(await mcpStatus(tokens.access_token)).toBe(401);
    expect(await mcpStatus(next.access_token)).toBe(200);
    await expectError(await renew(tokens.refresh_token), 'invalid_grant');
    expect((await renew(next.refresh_token)).status).toBe(200);
    expect(await rowsOf(paul)).toHaveLength(1);
  });

  // RFC 9700 §4.14.2 : dans les 30 s c'est le même client qui renouvelle deux fois ; au-delà, une copie volée.
  it('rejouer l’ancien renouvellement au-delà de 30 s révoque le branchement, y compris l’accès en cours', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const { granted, tokens } = await tokensFor(paul);
    const renew = (refresh_token: string) =>
      exchange({ grant_type: 'refresh_token', refresh_token, client_id: granted.clientId });
    const next = (await (await renew(tokens.refresh_token)).json()) as Tokens;

    await expectError(await renew(tokens.refresh_token), 'invalid_grant');
    expect(await mcpStatus(next.access_token)).toBe(200); // dans les 30 s : rien ne bouge
    await adminDb
      .update(apiTokens)
      .set({ refreshRotatedAt: new Date(Date.now() - 31_000) })
      .where(eq(apiTokens.userId, paul.userId));
    await expectError(await renew(tokens.refresh_token), 'invalid_grant');

    expect(await mcpStatus(next.access_token)).toBe(401);
    await expectError(await renew(next.refresh_token), 'invalid_grant');
  });

  it('invalid_grant pour un jeton inconnu, un jeton d’accès, un autre client ou un membre retiré', async () => {
    const [paul, marie] = await team('Paul', 'Marie');
    if (!paul || !marie) throw new Error('membre de test manquant');
    const { granted, tokens } = await tokensFor(paul);
    const other = await register(CHATGPT, 'Autre');
    const renew = (refresh_token: string, client_id = granted.clientId) =>
      exchange({ grant_type: 'refresh_token', refresh_token, client_id });

    await expectError(await renew(`leon_${'A'.repeat(43)}`), 'invalid_grant');
    await expectError(await renew('pas-un-jeton'), 'invalid_grant');
    await expectError(await renew(tokens.access_token), 'invalid_grant');
    await expectError(await renew(tokens.refresh_token, other), 'invalid_grant');
    // Rien de tout cela n'a changé les jetons : le bon client renouvelle encore.
    expect(await mcpStatus(tokens.access_token)).toBe(200);

    await adminDb
      .delete(members)
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));
    await expectError(await renew(tokens.refresh_token), 'invalid_grant');
  });

  it('un client_id illisible : invalid_client, comme de plus de 4 Ko ; une adresse de document inconnue : invalid_grant', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const { tokens } = await tokensFor(paul);
    const renew = (client_id: string) =>
      exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id });

    await expectError(await renew('pas-un-client'), 'invalid_client');
    // Une adresse que L11 sert encore, mais qui n'est pas celle de ce branchement : le jeton n'est pas à ce client.
    await expectError(await renew('https://claude.ai/oauth/inconnu.json'), 'invalid_grant');
    await expectError(await renew('a'.repeat(4097)), 'invalid_client');
    expect(await mcpStatus(tokens.access_token)).toBe(200);
  });

  describe('revérifie le client sur place, sans réseau : un client que L11 ne sert plus perd son renouvellement', () => {
    const signed = (r: string[]) => signPayload('oauth-client', { v: 1, n: 'Ancien', r, i: 1 });
    const falsified = () => {
      const id = signed([CLAUDE]);
      return `${id.slice(0, -1)}${id.endsWith('A') ? 'B' : 'A'}`;
    };

    // La ligne que l'échange du code aurait créée pour ce client_id, du temps où L11 le servait.
    async function grantFor(member: TenantContext, clientId: string): Promise<Tokens> {
      const granted = await apiTokensModule.createGrant(member, {
        grantId: randomBytes(16).toString('base64url'),
        clientRef: clientRef(clientId),
        clientName: 'Ancien client',
        clientHost: 'claude.ai',
        name: 'Ancien client',
      });
      if (!granted) throw new Error('ligne non créée');
      return { access_token: granted.accessToken, refresh_token: granted.refreshToken };
    }

    it.each([
      ['une adresse de retour retirée de L11', () => signed(['https://evil.example/cb'])],
      ['une adresse sur deux retirée de L11', () => signed([CLAUDE, 'https://claude.ai/autre'])],
      ['un client_id signé falsifié', falsified],
      ['un document sur un hôte hors de L11', () => 'https://evil.example/client.json'],
      ['un document dont l’adresse n’a plus la forme attendue', () => 'https://claude.ai/'],
    ])('%s : invalid_client, la ligne est inchangée', async (_what, build) => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const clientId = build();
      const tokens = await grantFor(paul, clientId);
      const before = await rowsOf(paul);
      const fetched = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('réseau'));

      await expectError(
        await exchange({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        }),
        'invalid_client',
      );

      expect(await rowsOf(paul)).toEqual(before);
      expect(fetched).not.toHaveBeenCalled();
      expect(await mcpStatus(tokens.access_token)).toBe(200);
    });

    it('le même client que L11 sert encore renouvelle, sans aucune lecture', async () => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const clientId = signed([CLAUDE]);
      const tokens = await grantFor(paul, clientId);
      const fetched = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('réseau'));

      const response = await exchange({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      });

      expect(response.status).toBe(200);
      expect(fetched).not.toHaveBeenCalled();
    });
  });

  it('ne lit pas le client : le document CIMD est injoignable et le renouvellement réussit quand même', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const url = cimdUrl();
    const fetched = serveDocument(url);
    const { tokens } = await tokensFor(paul, { clientId: url }); // l'échange du code lit le document
    expect(fetched).toHaveBeenCalled();
    fetched.mockClear();
    fetched.mockRejectedValue(new Error('réseau coupé'));

    const response = await exchange({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: url,
    });

    expect(response.status).toBe(200);
    expect(await mcpStatus(((await response.json()) as Tokens).access_token)).toBe(200);
    expect(fetched).not.toHaveBeenCalled();
  });
});

describe('POST /api/oauth/jeton : la forme de la requête', () => {
  it.each([
    'password',
    'client_credentials',
    'implicit',
    'urn:ietf:params:oauth:grant-type:device_code',
    '',
  ])('grant_type « %s » : unsupported_grant_type', async (grant_type) => {
    await expectError(
      await exchange({ grant_type, username: 'paul', password: 'secret', client_id: 'x' }),
      'unsupported_grant_type',
    );
  });

  it('invalid_request : grant_type absent, ou paramètre obligatoire absent ou en double', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const granted = await authorize(paul);
    const { code: _code, ...withoutCode } = codeGrant(granted);
    const { code_verifier: _verifier, ...withoutVerifier } = codeGrant(granted);
    const { client_id: _client, ...withoutClient } = codeGrant(granted);
    const { grant_type: _type, ...withoutType } = codeGrant(granted);
    const doubled = (name: string) =>
      app.request(API_PATHS.oauthJeton, {
        method: 'POST',
        headers: { 'content-type': FORM },
        body: `${new URLSearchParams(codeGrant(granted))}&${name}=${encodeURIComponent(codeGrant(granted)[name as 'code'])}`,
      });

    for (const fields of [withoutCode, withoutVerifier, withoutClient, withoutType, {}]) {
      await expectError(await exchange(fields), 'invalid_request');
    }
    await expectError(
      await exchange({ grant_type: 'refresh_token', client_id: granted.clientId }),
      'invalid_request',
    );
    await expectError(
      await exchange({ grant_type: 'refresh_token', refresh_token: 'leon_x' }),
      'invalid_request',
    );
    for (const name of ['grant_type', 'code', 'client_id', 'code_verifier', 'redirect_uri']) {
      await expectError(await doubled(name), 'invalid_request');
    }
    // Aucun de ces refus n'a consommé le code.
    expect((await exchange(codeGrant(granted))).status).toBe(200);
  });

  it('invalid_target pour une ressource autre que celle de Leon, pour les deux grant_type ; la bonne passe', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const granted = await authorize(paul);

    await expectError(
      await exchange(codeGrant(granted, { resource: 'https://autre.example/api/mcp' })),
      'invalid_target',
    );
    await expectError(
      await exchange({
        grant_type: 'refresh_token',
        refresh_token: `leon_${'A'.repeat(43)}`,
        client_id: granted.clientId,
        resource: `${RESOURCE}/`,
      }),
      'invalid_target',
    );
    expect((await exchange(codeGrant(granted, { resource: RESOURCE }))).status).toBe(200);
  });

  it('refuse le JSON, le multipart, le texte et l’absence de type : 400 invalid_request, code intact', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const granted = await authorize(paul);
    const fields = codeGrant(granted);
    const send = (headers: Record<string, string>, body: string) =>
      app.request(API_PATHS.oauthJeton, { method: 'POST', headers, body });

    await expectError(
      await send({ 'content-type': 'application/json' }, JSON.stringify(fields)),
      'invalid_request',
    );
    await expectError(
      await send(
        { 'content-type': 'multipart/form-data; boundary=x' },
        '--x\r\ncontent-disposition: form-data; name="grant_type"\r\n\r\nauthorization_code\r\n--x--',
      ),
      'invalid_request',
    );
    await expectError(
      await send({ 'content-type': 'text/plain' }, new URLSearchParams(fields).toString()),
      'invalid_request',
    );
    await expectError(await send({}, new URLSearchParams(fields).toString()), 'invalid_request');
    expect((await exchange(fields)).status).toBe(200);
  });

  describe('au plus 8 Ko d’entrée', () => {
    const padded = (fields: Record<string, string>, size: number) => {
      const base = `${new URLSearchParams(fields)}&pad=`;
      return base + 'a'.repeat(size - base.length);
    };

    it('accepte 8 Ko pile', async () => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const body = padded(codeGrant(await authorize(paul)), 8192);
      expect(body).toHaveLength(8192);

      const response = await app.request(API_PATHS.oauthJeton, {
        method: 'POST',
        headers: { 'content-type': FORM },
        body,
      });

      expect(response.status).toBe(200);
    });

    it('refuse 8 Ko + 1 octet : 400, que la taille soit annoncée ou non, code intact', async () => {
      const [paul] = await team('Paul');
      if (!paul) throw new Error('membre de test manquant');
      const granted = await authorize(paul);
      const text = padded(codeGrant(granted), 8193);
      const declared = await app.request(API_PATHS.oauthJeton, {
        method: 'POST',
        headers: { 'content-type': FORM, 'content-length': String(text.length) },
        body: text,
      });
      const streamed = await app.request(API_PATHS.oauthJeton, {
        method: 'POST',
        headers: { 'content-type': FORM },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
          },
        }),
        // @ts-expect-error duplex est requis par Node pour un corps en flux
        duplex: 'half',
      });

      await expectError(declared, 'invalid_request');
      await expectError(streamed, 'invalid_request');
      expect((await exchange(codeGrant(granted))).status).toBe(200);
    });
  });

  it('ne répond qu’au POST', async () => {
    expect((await apiRequest(API_PATHS.oauthJeton)).status).toBe(404);
  });

  it('Cache-Control: no-store aussi sur une erreur inattendue (500), sans rien journaliser du corps', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const granted = await authorize(paul);
    const logged = spyConsole();
    vi.spyOn(apiTokensModule, 'createGrant').mockRejectedValue(
      new DrizzleQueryError('insert into api_tokens … $1', [granted.code], new Error('x')),
    );

    const response = await exchange(codeGrant(granted));

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Internal error' });
    expect(logged().length).toBeGreaterThan(0);
    expect(logged().join('')).not.toContain(granted.code);
  });
});

describe('POST /api/oauth/jeton : ce qu’un assistant voit', () => {
  it('avec un jeton obtenu par le parcours, un membre ne trouve la source privée d’un autre ni par search ni par fetch', async () => {
    const [paul, marie] = await team('Paul', 'Marie');
    if (!paul || !marie) throw new Error('membre de test manquant');
    const { sourceId } = await seedIndexed(paul, {
      kind: 'claude_code',
      title: 'Conversation de Paul',
      turns: [{ text: 'le mot de passe du coffre est ouistitigris' }],
    });
    const asPaul = await connect((await tokensFor(paul)).tokens.access_token);
    const asMarie = await connect((await tokensFor(marie)).tokens.access_token);

    const own = await call(asPaul, 'search', { query: 'ouistitigris' });
    const theirs = await call(asMarie, 'search', { query: 'ouistitigris' });
    const fetched = await call(asMarie, 'fetch', { sourceId });

    expect(own.structuredContent?.hits).toHaveLength(1);
    // Exactement ce que rend la recherche pour le contexte de session de Marie.
    expect((await searchPassages(marie, { query: 'ouistitigris' })).hits).toEqual([]);
    expect(theirs.structuredContent?.hits).toEqual([]);
    expect(JSON.stringify(theirs)).not.toContain('coffre');
    expect(fetched.isError).toBe(true);
    expect(fetched.text).toContain('not found');
    expect(fetched.text).not.toContain('coffre');
  });
});

describe('POST /api/oauth/jeton : journaux', () => {
  it('ne journalise ni jeton, ni code, ni code_verifier, ni client_id, succès comme refus', async () => {
    const [paul] = await team('Paul');
    if (!paul) throw new Error('membre de test manquant');
    const logged = spyConsole();
    const { granted, tokens } = await tokensFor(paul);
    const again = await authorize(paul);
    await exchange(codeGrant(again, { code_verifier: newVerifier() }));
    await exchange(codeGrant(granted)); // code déjà servi
    await exchange({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: granted.clientId,
    });
    await exchange({ grant_type: 'password', client_id: granted.clientId });
    await exchange({}, { 'content-type': 'application/json' });

    const secrets = [
      granted.code,
      granted.verifier,
      granted.clientId,
      again.code,
      tokens.access_token,
      tokens.refresh_token,
    ];
    const output = logged().join('\n');
    for (const secret of secrets) expect(output).not.toContain(secret);
    expect(logged()).toEqual([]);
  });
});

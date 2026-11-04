import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { signComputerCode, signPayload } from '@/server/auth/computer-code';
import {
  clientRef,
  clientStillAllowed,
  readClientId,
  redirectAllowed,
  registerClient,
} from './clients';

const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const CHATGPT = 'https://chatgpt.com/connector/oauth/abc123';
const CLAUDE_CODE = 'http://localhost:3118/callback';
const CURSOR_WEB = 'https://www.cursor.com/agents/mcp/oauth/callback';
const CURSOR_DESKTOP = 'http://127.0.0.1:54321/oauth/callback';

const register = (redirect_uris: string[], extra: Record<string, unknown> = {}) =>
  registerClient({ redirect_uris, ...extra });

// L'inscription réussie, ou l'échec du test : la réponse 201 de L4.
function registered(result: ReturnType<typeof registerClient>) {
  if ('error' in result) throw new Error(`inscription refusée : ${result.error}`);
  return result.client;
}

describe('registerClient : les clients de L11', () => {
  it.each([
    ['Claude', [CLAUDE], 'claude.ai'],
    ['ChatGPT', [CHATGPT], 'chatgpt.com'],
    [
      'ChatGPT (adresse fixe)',
      ['https://chatgpt.com/connector_platform_oauth_redirect'],
      'chatgpt.com',
    ],
    ['Claude Code', [CLAUDE_CODE], '127.0.0.1'],
    // celles que le document CIMD de Claude Code annonce : le bouclage sans port (RFC 8252 §7.3)
    [
      'Claude Code (document CIMD)',
      ['http://localhost/callback', 'http://127.0.0.1/callback'],
      '127.0.0.1',
    ],
    ['Codex', ['http://127.0.0.1:1455/auth/callback'], '127.0.0.1'],
    ['Cursor (ses deux adresses)', [CURSOR_WEB, CURSOR_DESKTOP], 'www.cursor.com'],
    ['VS Code (web)', ['https://vscode.dev/redirect'], 'vscode.dev'],
    ['VS Code (web, Insiders)', ['https://insiders.vscode.dev/redirect'], 'insiders.vscode.dev'],
    // ce que VS Code bureau inscrit, ensemble : une seule adresse refusée ferait échouer l'inscription entière
    [
      'VS Code (bureau)',
      [
        'http://127.0.0.1/',
        'http://127.0.0.1:33418/',
        'https://vscode.dev/redirect',
        'https://insiders.vscode.dev/redirect',
      ],
      '127.0.0.1',
    ],
    ['Antigravity', ['https://antigravity.google/oauth-callback'], 'antigravity.google'],
  ])('inscrit %s, et readClientId relit ce qui a été inscrit', async (_name, uris, host) => {
    const client = registered(register(uris, { client_name: 'Un client' }));

    expect(client).toMatchObject({
      client_name: 'Un client',
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
    expect(Math.abs(client.client_id_issued_at - Date.now() / 1000)).toBeLessThan(5);
    expect(await readClientId(client.client_id)).toEqual({
      name: 'Un client',
      redirectUris: uris,
      host,
      ref: createHash('sha256').update(client.client_id).digest('hex'),
    });
  });

  it('prend l’hôte de la première adresse, 127.0.0.1 pour le bouclage (localhost compris)', async () => {
    const first = registered(register([CURSOR_DESKTOP, CURSOR_WEB]));
    const second = registered(register([CLAUDE_CODE, CLAUDE]));
    expect((await readClientId(first.client_id))?.host).toBe('127.0.0.1');
    expect((await readClientId(second.client_id))?.host).toBe('127.0.0.1');
  });

  it('accepte un identifiant ChatGPT de 1 à 128 caractères [A-Za-z0-9_-]', () => {
    for (const id of ['a', 'Ab_-9', 'x'.repeat(128)]) {
      expect(register([`https://chatgpt.com/connector/oauth/${id}`])).not.toHaveProperty('error');
    }
  });

  it('écrit le client_id comme L5 : une charge signée pour « oauth-client », lisible sans base', () => {
    const { client_id } = registered(register([CLAUDE], { client_name: 'Claude' }));
    const [body = '', signature = '', ...rest] = client_id.split('.');
    expect(rest).toEqual([]);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    expect(payload).toEqual({ v: 1, n: 'Claude', r: [CLAUDE], i: expect.any(Number) });
    expect(payload).not.toHaveProperty('x'); // sans expiration
  });
});

describe('registerClient : les refus', () => {
  it.each([
    'https://evil.example/cb',
    'https://claude.ai.evil.example/api/mcp/auth_callback',
    'https://evil.example/https://claude.ai/api/mcp/auth_callback',
    'https://claude.ai:8443/api/mcp/auth_callback',
    'https://claude.ai:443/api/mcp/auth_callback',
    'http://claude.ai/api/mcp/auth_callback',
    'HTTPS://CLAUDE.AI/api/mcp/auth_callback',
    'https://claude.ai/API/mcp/auth_callback',
    'https://claude.ai/api/mcp/auth_callback/',
    'https://claude.ai/api/mcp/auth_callback?x=1',
    'https://claude.ai/api/mcp/auth_callback#frag',
    'https://claude.ai/api/mcp/auth_callback#',
    'https://claude.ai/api/mcp/../mcp/auth_callback',
    'https://claude.ai/api/mcp/auth_callback\t',
    'https://user@claude.ai/api/mcp/auth_callback',
    // un autre chemin d'un hôte connu : jamais de code vers une redirection ouverte
    'https://claude.ai/autre',
    'https://chatgpt.com/connector/oauth/a/b',
    'https://chatgpt.com/connector/oauth/',
    'https://chatgpt.com/connector/oauth/a%2Fb',
    `https://chatgpt.com/connector/oauth/${'x'.repeat(129)}`,
    'https://chatgpt.com/connector/oauth/abc?next=https://evil.example',
    'https://chatgpt.com/connector_platform_oauth_redirect?x=1',
    'https://insiders.vscode.dev/autre',
    'https://insiders.vscode.dev/redirect/',
    'https://insiders.vscode.dev:8443/redirect',
    'https://sub.insiders.vscode.dev/redirect',
    'https://vscode.dev/redirect?x=1',
    // le bouclage : http seulement, hôte exact, un chemin, ni identifiant ni fragment ; le port est facultatif
    'http://user:pw@127.0.0.1:9/cb',
    'http://127.0.0.1:9/cb#x',
    'http://127.0.0.1:9\\@evil.example/cb',
    'https://127.0.0.1:9/cb',
    'http://127.0.0.1:80/cb', // le port par défaut ne s'écrit pas : la forme canonique l'omet
    'http://127.0.0.1',
    'http://127.0.0.1:9',
    'http://localhost.evil.example:9/cb',
    'http://127.0.0.1.evil.example:9/cb',
    'http://127.1:9/cb',
    'http://[::1]:9/cb',
    'http://0.0.0.0:9/cb',
    'http://LOCALHOST:9/cb',
    // aucun autre schéma
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'cursor://anysphere.cursor-mcp/oauth/callback',
    'file:///etc/passwd',
    '//claude.ai/api/mcp/auth_callback',
    'claude.ai/api/mcp/auth_callback',
    '',
  ])('refuse « %s » : invalid_redirect_uri', (uri) => {
    expect(register([uri])).toEqual({ error: 'invalid_redirect_uri' });
  });

  it('refuse l’inscription entière dès qu’une adresse est refusée', () => {
    expect(register([CLAUDE, 'https://evil.example/cb'])).toEqual({
      error: 'invalid_redirect_uri',
    });
  });

  it('refuse 0 adresse, 6 adresses, une adresse de 513 caractères, ou autre chose qu’une liste de textes', () => {
    const long = `http://localhost:1/${'a'.repeat(513 - 'http://localhost:1/'.length)}`;
    expect(long).toHaveLength(513);
    for (const redirect_uris of [
      [],
      [CLAUDE, CLAUDE, CLAUDE, CLAUDE, CLAUDE, CLAUDE],
      [long],
      CLAUDE,
      [1],
      [null],
      undefined,
    ]) {
      expect(registerClient({ redirect_uris })).toEqual({ error: 'invalid_redirect_uri' });
    }
    expect(register([CLAUDE, CLAUDE, CLAUDE, CLAUDE, CLAUDE])).not.toHaveProperty('error');
    const fits = `http://localhost:1/${'a'.repeat(512 - 'http://localhost:1/'.length)}`;
    expect(register([fits])).not.toHaveProperty('error');
  });

  it('refuse grant_types sans authorization_code, et response_types autre que code', () => {
    for (const extra of [
      { grant_types: ['refresh_token'] },
      { grant_types: [] },
      { grant_types: ['implicit'] },
      { grant_types: 'authorization_code' },
      { response_types: ['token'] },
      { response_types: ['code', 'token'] },
      { response_types: [] },
      { response_types: 'code' },
    ]) {
      expect(register([CLAUDE], extra)).toEqual({ error: 'invalid_client_metadata' });
    }
  });

  it('refuse un corps qui n’est pas un objet', () => {
    for (const body of [null, 'texte', 42, [CLAUDE], undefined]) {
      expect(registerClient(body)).toEqual({ error: 'invalid_client_metadata' });
    }
  });

  it('accepte et ignore les autres champs de RFC 7591', () => {
    const client = registered(
      register([CLAUDE], {
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        application_type: 'web',
        scope: 'openid profile',
        client_uri: 'https://evil.example',
        logo_uri: 'https://evil.example/logo.png',
        contacts: ['x@example.com'],
        software_id: 'abc',
        jwks_uri: 'https://evil.example/jwks',
      }),
    );
    expect(Object.keys(client).sort()).toEqual([
      'client_id',
      'client_id_issued_at',
      'client_name',
      'grant_types',
      'redirect_uris',
      'response_types',
      'token_endpoint_auth_method',
    ]);
  });

  it.each(['client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none', 7])(
    'répond « none » quand le client demande token_endpoint_auth_method = %s (F4)',
    (method) => {
      const client = registered(register([CLAUDE], { token_endpoint_auth_method: method }));
      expect(client.token_endpoint_auth_method).toBe('none');
    },
  );
});

describe('registerClient : le nom du client', () => {
  const nameOf = (client_name?: unknown) =>
    registered(register([CLAUDE], client_name === undefined ? {} : { client_name })).client_name;

  it('retire les caractères de contrôle', () => {
    expect(nameOf('Cl\u0000au\u0007de\nCode\t\u007f\u009b')).toBe('ClaudeCode');
  });

  it('retire aussi les caractères de mise en forme, dont les inversions de sens d’écriture', () => {
    expect(nameOf('‮edualC​')).toBe('edualC');
  });

  it('coupe à 80 caractères, sans couper un caractère en deux', () => {
    expect(nameOf('a'.repeat(100))).toBe('a'.repeat(80));
    expect(nameOf('😀'.repeat(100))).toBe('😀'.repeat(80));
    expect(nameOf('a'.repeat(80))).toBe('a'.repeat(80));
  });

  it.each([
    ['absent', undefined],
    ['vide', ''],
    ['des espaces', '   '],
    ['que des caractères de contrôle', '\u0000\n\t'],
    ['un nombre', 42],
    ['un objet', { n: 'x' }],
    ['null', null],
  ])('vaut « MCP client » quand il est %s', (_case, value) => {
    expect(nameOf(value)).toBe('MCP client');
  });

  it('garde le nom nettoyé dans le client_id', async () => {
    const { client_id } = registered(register([CLAUDE], { client_name: '  Claude\n ' }));
    expect((await readClientId(client_id))?.name).toBe('Claude');
  });
});

describe('readClientId : un client_id inscrit (L5)', () => {
  const clientId = () => registered(register([CLAUDE], { client_name: 'Claude' })).client_id;

  it('rend null dès qu’un caractère change, n’importe où', async () => {
    const id = clientId();
    for (let i = 0; i < id.length; i++) {
      if (id[i] === '.') continue;
      const swapped = id[i] === 'A' ? 'B' : 'A';
      expect(await readClientId(id.slice(0, i) + swapped + id.slice(i + 1))).toBeNull();
    }
  });

  it('rend null pour une valeur tronquée, allongée, vide ou qui n’a pas la forme d’un client_id', async () => {
    const id = clientId();
    for (const value of [
      '',
      'abc',
      'a.b',
      'a.b.c',
      id.slice(0, -1),
      `${id}A`,
      `${id}.x`,
      '.',
      id.replace('.', ''),
    ]) {
      expect(await readClientId(value)).toBeNull();
    }
  });

  it('rend null pour une valeur signée pour un autre but (code d’ordinateur, code d’autorisation)', async () => {
    const claims = { v: 1, n: 'Claude', r: [CLAUDE], i: 1 };
    expect(await readClientId(signPayload('oauth-code', claims))).toBeNull();
    expect(await readClientId(signPayload('ordinateur', claims))).toBeNull();
    expect(await readClientId(signComputerCode({ e: 'a'.repeat(64), u: 'u', t: 't' }))).toBeNull();
    expect(await readClientId(signPayload('oauth-client', claims))).not.toBeNull();
  });

  it('rend null pour une valeur signée par un autre secret', async () => {
    const claims = { v: 1, n: 'Claude', r: [CLAUDE], i: 1 };
    const foreign = signPayload('oauth-client', claims, {
      secret: 'un-autre-secret-un-autre-secret-0002',
    });
    expect(await readClientId(foreign)).toBeNull();
  });

  it.each([
    ['une autre version', { v: 2, n: 'Claude', r: [CLAUDE], i: 1 }],
    ['sans nom', { v: 1, r: [CLAUDE], i: 1 }],
    ['sans adresse', { v: 1, n: 'Claude', r: [], i: 1 }],
    ['un champ de plus', { v: 1, n: 'Claude', r: [CLAUDE], i: 1, x: 99999999999 }],
    [
      'une adresse de plus de 512 caractères',
      { v: 1, n: 'Claude', r: [`http://localhost:1/${'a'.repeat(600)}`], i: 1 },
    ],
    ['6 adresses', { v: 1, n: 'Claude', r: Array(6).fill(CLAUDE), i: 1 }],
    // L11 est la seule liste : une adresse qui n'y est plus (ou n'y a jamais été) ne vaut plus, même signée
    [
      'une adresse que L11 ne permet pas',
      { v: 1, n: 'Claude', r: ['https://evil.example/cb'], i: 1 },
    ],
  ])('rend null pour une charge signée mais %s', async (_case, claims) => {
    expect(await readClientId(signPayload('oauth-client', claims))).toBeNull();
  });

  it('ne journalise rien : ni le client_id, ni le nom, ni les adresses', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const id = clientId();
    await readClientId(id);
    await readClientId(`${id}x`);
    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe('clientRef : l’empreinte d’un client_id', () => {
  it('est le SHA-256 hexadécimal du client_id, celui que readClientId rend en ref, pour un client inscrit comme pour un document', async () => {
    const id = registered(register([CLAUDE])).client_id;
    const document = 'https://claude.ai/oauth/claude-code-client-metadata';
    const fetch = async () =>
      Response.json({ client_id: document, client_name: 'Claude Code', redirect_uris: [CLAUDE] });

    expect(clientRef(id)).toBe(createHash('sha256').update(id).digest('hex'));
    expect((await readClientId(id))?.ref).toBe(clientRef(id));
    expect((await readClientId(document, { fetch, cache: new Map() }))?.ref).toBe(
      clientRef(document),
    );
  });
});

// Le jugement local de readClientId, sans réseau : au renouvellement, il retire leurs jetons aux clients que L11 ne sert plus.
describe('clientStillAllowed : un client_id que Leon sert encore, sans rien lire', () => {
  const clientId = () => registered(register([CLAUDE], { client_name: 'Claude' })).client_id;

  it.each([
    ['un client inscrit', () => clientId()],
    ['un document de Claude Code', () => 'https://claude.ai/oauth/claude-code-client-metadata'],
    ['un document de ChatGPT', () => 'https://chatgpt.com/oauth/client.json'],
  ])('accepte %s', (_what, build) => {
    expect(clientStillAllowed(build())).toBe(true);
  });

  it.each([
    [
      'un client_id falsifié',
      () => {
        const id = clientId(); // un seul appel : le client_id porte l'heure, deux appels peuvent différer
        return `${id.slice(0, -1)}${id.endsWith('A') ? 'B' : 'A'}`;
      },
    ],
    ['une valeur qui n’a pas la forme d’un client_id', () => 'abc'],
    ['une valeur vide', () => ''],
    [
      'un client signé par un autre secret',
      () =>
        signPayload(
          'oauth-client',
          { v: 1, n: 'Claude', r: [CLAUDE], i: 1 },
          { secret: 'un-autre-secret-un-autre-secret-0002' },
        ),
    ],
    [
      'un client signé pour un autre but',
      () => signPayload('oauth-code', { v: 1, n: 'Claude', r: [CLAUDE], i: 1 }),
    ],
    [
      'un client signé dont l’adresse de retour n’est plus dans L11',
      () =>
        signPayload('oauth-client', { v: 1, n: 'Ancien', r: ['https://evil.example/cb'], i: 1 }),
    ],
    [
      'un client signé dont une seule adresse sur deux n’est plus dans L11',
      () =>
        signPayload('oauth-client', {
          v: 1,
          n: 'Ancien',
          r: [CLAUDE, 'https://claude.ai/autre'],
          i: 1,
        }),
    ],
    ['un document hors des hôtes de L11', () => 'https://evil.example/client.json'],
    [
      'un document dont l’hôte ressemble à celui d’un client',
      () => 'https://claude.ai.evil.example/client.json',
    ],
    ['un document sans chemin', () => 'https://claude.ai/'],
    ['un document avec une requête', () => 'https://claude.ai/client.json?x=1'],
    ['un document sur un autre port', () => 'https://claude.ai:8443/client.json'],
    ['un document en http', () => 'http://claude.ai/client.json'],
    ['un document de plus de 512 caractères', () => `https://claude.ai/${'a'.repeat(512)}`],
  ])('refuse %s', (_what, build) => {
    expect(clientStillAllowed(build())).toBe(false);
  });

  it('ne lit aucun document et ne journalise rien', () => {
    const fetched = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('réseau'));
    const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );

    clientStillAllowed('https://claude.ai/oauth/claude-code-client-metadata');
    clientStillAllowed('https://evil.example/client.json');
    clientStillAllowed(clientId());

    expect(fetched).not.toHaveBeenCalled();
    expect(logged.flatMap((spy) => spy.mock.calls)).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe('redirectAllowed (L6, RFC 8252 §7.3)', () => {
  it('accepte l’une des adresses du client, caractère par caractère', () => {
    expect(redirectAllowed([CLAUDE], CLAUDE)).toBe(true);
    expect(redirectAllowed([CURSOR_WEB, CURSOR_DESKTOP], CURSOR_WEB)).toBe(true);
    expect(redirectAllowed([CHATGPT], CHATGPT)).toBe(true);
  });

  it.each([
    'https://claude.ai/api/mcp/auth_callback/',
    'https://claude.ai/api/mcp/auth_callback?x=1',
    'https://claude.ai/api/mcp/auth_callback#x',
    'https://claude.ai:443/api/mcp/auth_callback',
    'https://CLAUDE.ai/api/mcp/auth_callback',
    'http://claude.ai/api/mcp/auth_callback',
    'https://evil.example/cb',
    'https://claude.ai/autre',
    'https://claude.ai.evil.example/api/mcp/auth_callback',
    ' https://claude.ai/api/mcp/auth_callback',
    '',
  ])('refuse « %s » pour un client inscrit avec l’adresse de Claude', (uri) => {
    expect(redirectAllowed([CLAUDE], uri)).toBe(false);
  });

  it('refuse tout quand le client n’a aucune adresse', () => {
    expect(redirectAllowed([], CLAUDE)).toBe(false);
  });

  it('ne généralise pas : une adresse que L11 permet, mais que ce client n’a pas inscrite, est refusée', () => {
    expect(redirectAllowed([CLAUDE, CHATGPT], 'https://chatgpt.com/connector/oauth/autre')).toBe(
      false,
    );
    expect(redirectAllowed([CHATGPT], CLAUDE)).toBe(false);
  });

  describe('le bouclage : seul le port peut différer', () => {
    it.each([
      ['http://localhost:3118/callback', 'http://localhost:51234/callback'],
      ['http://127.0.0.1:1455/auth/callback', 'http://127.0.0.1:1/auth/callback'],
      ['http://127.0.0.1:1455/auth/callback', 'http://127.0.0.1:65535/auth/callback'],
      ['http://localhost:3118/callback?a=b', 'http://localhost:4000/callback?a=b'],
      ['http://localhost:3118/callback', 'http://localhost:3118/callback'],
      // sans port à l'inscription (le document CIMD de Claude Code, VS Code bureau), n'importe quel port à la demande
      ['http://localhost/callback', 'http://localhost:51234/callback'],
      ['http://127.0.0.1/callback', 'http://127.0.0.1:51234/callback'],
      ['http://127.0.0.1/', 'http://127.0.0.1:33418/'],
      ['http://localhost:3118/callback', 'http://localhost/callback'],
    ])('%s accepte %s', (registered, requested) => {
      expect(redirectAllowed([registered], requested)).toBe(true);
    });

    it.each([
      'http://localhost:51234/autre',
      'http://localhost:51234/callback/',
      'http://localhost:51234/callback?a=b',
      'http://localhost:51234/Callback',
      'http://127.0.0.1:51234/callback', // l'autre nom de l'hôte
      'https://localhost:51234/callback',
      'http://localhost:51234',
      'http://localhost:80/callback',
      'http://localhost:51234/callback#x',
      'http://user:pw@localhost:51234/callback',
      'http://localhost.evil.example:51234/callback',
      'http://evil.example:51234/callback',
      'http://localhost:51234/callback\t',
      'http://localhost:51234\\@evil.example/callback',
      'http://LOCALHOST:51234/callback',
    ])('refuse « %s » pour un client inscrit avec http://localhost:3118/callback', (requested) => {
      expect(redirectAllowed(['http://localhost:3118/callback'], requested)).toBe(false);
    });

    it('garde le chemin et l’hôte quand l’inscription n’a pas de port', () => {
      for (const requested of [
        'http://localhost:51234/autre',
        'http://127.0.0.1:51234/callback', // l'autre nom de l'hôte
        'https://localhost:51234/callback',
        'http://localhost:51234/callback#x',
        'http://user:pw@localhost:51234/callback',
      ]) {
        expect(redirectAllowed(['http://localhost/callback'], requested)).toBe(false);
      }
    });

    it('ne donne aucune latitude de port à une adresse qui n’est pas du bouclage', () => {
      expect(redirectAllowed([CLAUDE], 'https://claude.ai:8443/api/mcp/auth_callback')).toBe(false);
      expect(
        redirectAllowed(['https://vscode.dev/redirect'], 'https://vscode.dev:444/redirect'),
      ).toBe(false);
    });

    it('ne prend pas pour du bouclage une adresse inscrite qui n’en est pas une', () => {
      expect(redirectAllowed(['https://evil.example:1/cb'], 'https://evil.example:2/cb')).toBe(
        false,
      );
    });
  });
});

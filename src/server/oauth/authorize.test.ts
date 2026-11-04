import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { signPayload } from '@/server/auth/computer-code';
import {
  codeRedirect,
  errorRedirect,
  oauthAuthorizePath,
  oauthReturnPath,
  parseAuthorizeRequest,
  readAuthorizationCode,
} from './authorize';
import { registerClient } from './clients';

// L6 et L7 du plan « MCP distant », recopiés tels quels. BETTER_AUTH_URL vaut http://localhost:3000 dans les tests.
const ISSUER = 'http://localhost:3000';
const RESOURCE = 'http://localhost:3000/api/mcp';
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const CHATGPT = 'https://chatgpt.com/connector/oauth/abc123';
const LOOPBACK = 'http://127.0.0.1:1111/cb';
const CHALLENGE = createHash('sha256').update('un-code-verifier-de-test').digest('base64url');
const NOW = 1_800_000_000_000;
const CTX = { userId: 'u1', tenantId: 't1', principals: ['u1', 't1'] };

function register(uris: string[], name = 'Claude'): string {
  const result = registerClient({ redirect_uris: uris, client_name: name });
  if ('error' in result) throw new Error(`inscription refusée : ${result.error}`);
  return result.client.client_id;
}
const CLIENT_ID = register([CLAUDE]);

const params = (over: Record<string, unknown> = {}) => ({
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: CLAUDE,
  state: 'etat-du-client',
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
  scope: 'leon',
  resource: RESOURCE,
  ...over,
});

// La demande validée, ou l'échec du test.
async function validated(over: Record<string, unknown> = {}) {
  const request = await parseAuthorizeRequest(params(over));
  if ('erreur' in request) throw new Error(`demande refusée : ${request.erreur}`);
  return request;
}

describe('parseAuthorizeRequest : la demande valide', () => {
  it('rend le client lu, l’adresse de retour, l’état et l’empreinte PKCE', async () => {
    const request = await parseAuthorizeRequest(params());

    expect(request).toMatchObject({
      clientId: CLIENT_ID,
      redirectUri: CLAUDE,
      state: 'etat-du-client',
      codeChallenge: CHALLENGE,
      host: 'claude.ai',
      loopback: false,
      client: { name: 'Claude', redirectUris: [CLAUDE], host: 'claude.ai' },
    });
  });

  it.each([
    ['sans état', { state: undefined }],
    ['sans périmètre : il vaut « leon »', { scope: undefined }],
    ['avec un périmètre vide : il vaut « leon »', { scope: '' }],
    ['sans ressource', { resource: undefined }],
    ['avec un état de 512 caractères', { state: 'a'.repeat(512) }],
  ])('accepte une demande %s', async (_name, over) => {
    expect('erreur' in (await parseAuthorizeRequest(params(over)))).toBe(false);
  });

  it('sans état, la demande n’en porte pas', async () => {
    expect((await validated({ state: undefined })).state).toBeUndefined();
  });

  it('lit un client_id qui est l’adresse d’un document (CIMD), par le fetch donné', async () => {
    const url = 'https://chatgpt.com/oauth/client.json';
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({ client_id: url, client_name: 'ChatGPT', redirect_uris: [CHATGPT] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const request = await parseAuthorizeRequest(params({ client_id: url, redirect_uri: CHATGPT }), {
      fetch,
      cache: new Map(),
    });

    expect(request).toMatchObject({ client: { name: 'ChatGPT' }, host: 'chatgpt.com' });
  });
});

describe('parseAuthorizeRequest : le client_id et redirect_uri, sans jamais rediriger (L6 point 1)', () => {
  it.each([
    ['absent', { client_id: undefined }],
    ['vide', { client_id: '' }],
    ['répété', { client_id: [CLIENT_ID, CLIENT_ID] }],
    ['un fichier de formulaire', { client_id: new File([], 'x') }],
    ['inconnu', { client_id: 'abc' }],
    ['mal signé', { client_id: `${CLIENT_ID.slice(0, -2)}AA` }],
    ['de plus de 4 Ko', { client_id: `${CLIENT_ID}${'a'.repeat(4096)}` }],
    ['signé pour un autre but', { client_id: signPayload('oauth-code', { v: 1 }) }],
  ])('un client_id %s : erreur « client »', async (_name, over) => {
    expect(await parseAuthorizeRequest(params(over))).toEqual({ erreur: 'client' });
  });

  it('borne le client_id à 4 Ko : un client_id signé mais plus long est refusé, la plus grande inscription passe', async () => {
    const long = signPayload('oauth-client', { v: 1, n: 'x'.repeat(5000), r: [CLAUDE], i: 1 });
    const uris = Array.from(
      { length: 5 },
      (_, i) => `http://127.0.0.1:1111/${'a'.repeat(489)}${i}`,
    );
    const biggest = register(uris, '😀'.repeat(80));

    expect(long.length).toBeGreaterThan(4096);
    expect(await parseAuthorizeRequest(params({ client_id: long }))).toEqual({ erreur: 'client' });
    expect(biggest.length).toBeLessThanOrEqual(4096);
    expect(
      'erreur' in
        (await parseAuthorizeRequest(params({ client_id: biggest, redirect_uri: uris[4] }))),
    ).toBe(false);
  });

  it('une erreur de client passe avant celles de OAuth : rien ne redirige', async () => {
    expect(
      await parseAuthorizeRequest(
        params({ client_id: 'abc', response_type: 'token', code_challenge: undefined }),
      ),
    ).toEqual({ erreur: 'client' });
  });

  it.each([
    ['absente, avec deux adresses inscrites', { client_id: register([CLAUDE, LOOPBACK]) }, {}],
    ['vide', {}, { redirect_uri: '' }],
    ['répétée', {}, { redirect_uri: [CLAUDE, CLAUDE] }],
    ['d’un autre hôte', {}, { redirect_uri: 'https://evil.example/api/mcp/auth_callback' }],
    ['du bon hôte, d’un autre chemin', {}, { redirect_uri: 'https://claude.ai/other' }],
    ['avec une requête en plus', {}, { redirect_uri: `${CLAUDE}?x=1` }],
    ['sans « s » à http', {}, { redirect_uri: CLAUDE.replace('https', 'http') }],
    ['qui n’est pas une adresse', {}, { redirect_uri: 'javascript:alert(1)' }],
    ['de plus de 512 caractères', {}, { redirect_uri: `${CLAUDE}/${'a'.repeat(512)}` }],
  ])('une adresse de retour %s : erreur « retour »', async (_name, ids, over) => {
    expect(
      await parseAuthorizeRequest({ ...params({ redirect_uri: undefined }), ...ids, ...over }),
    ).toEqual({ erreur: 'retour' });
  });

  it('une erreur de retour passe avant celles de OAuth : rien ne redirige', async () => {
    expect(
      await parseAuthorizeRequest(
        params({ redirect_uri: 'https://evil.example/cb', response_type: 'token' }),
      ),
    ).toEqual({ erreur: 'retour' });
  });

  it('sans redirect_uri, une inscription à une seule adresse la fournit (L6)', async () => {
    const request = await validated({ redirect_uri: undefined });

    expect(request.redirectUri).toBe(CLAUDE);
  });

  it('juge les formes avant de lire un document sur le réseau', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const cimd = 'https://chatgpt.com/oauth/client.json';
    for (const over of [
      { client_id: `https://chatgpt.com/${'a'.repeat(4096)}` },
      { client_id: cimd, redirect_uri: ['a', 'b'] },
      { client_id: cimd, redirect_uri: `https://chatgpt.com/${'a'.repeat(512)}` },
    ]) {
      await parseAuthorizeRequest(params(over), { fetch, cache: new Map() });
    }

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('parseAuthorizeRequest : le bouclage (RFC 8252 §7.3)', () => {
  const loopbackClient = register([LOOPBACK, 'http://localhost/cb']);
  const ask = (redirect_uri: string) =>
    parseAuthorizeRequest(params({ client_id: loopbackClient, redirect_uri }));

  it('accepte un autre port, et le dit : « une application de cet ordinateur »', async () => {
    expect(await ask('http://127.0.0.1:54321/cb')).toMatchObject({
      redirectUri: 'http://127.0.0.1:54321/cb',
      host: '127.0.0.1',
      loopback: true,
    });
    expect(await ask('http://localhost:7/cb')).toMatchObject({ host: 'localhost', loopback: true });
  });

  it.each([
    ['un autre hôte', 'http://evil.example:1111/cb'],
    ['une machine du réseau', 'http://192.168.0.5:1111/cb'],
    ['un autre chemin', 'http://127.0.0.1:2222/autre'],
    ['https', 'https://127.0.0.1:1111/cb'],
    ['un identifiant dans l’adresse', 'http://127.0.0.1:1111@evil.example/cb'],
  ])('refuse %s', async (_name, uri) => {
    expect(await ask(uri)).toEqual({ erreur: 'retour' });
  });

  it('un client non bouclé ne vaut jamais comme bouclage', async () => {
    expect(
      await parseAuthorizeRequest(params({ redirect_uri: 'http://127.0.0.1:1111/cb' })),
    ).toEqual({ erreur: 'retour' });
  });
});

describe('parseAuthorizeRequest : les erreurs de OAuth, renvoyées à redirect_uri (L6 point 2)', () => {
  const target = { redirectUri: CLAUDE, state: 'etat-du-client' };

  it.each([
    [
      'un response_type autre que « code »',
      { response_type: 'token' },
      'unsupported_response_type',
    ],
    ['un response_type vide', { response_type: '' }, 'unsupported_response_type'],
    ['un response_type absent', { response_type: undefined }, 'invalid_request'],
    ['un code_challenge absent', { code_challenge: undefined }, 'invalid_request'],
    [
      'un code_challenge de 42 caractères',
      { code_challenge: CHALLENGE.slice(1) },
      'invalid_request',
    ],
    ['un code_challenge de 44 caractères', { code_challenge: `${CHALLENGE}A` }, 'invalid_request'],
    [
      'un code_challenge hors base64url',
      { code_challenge: `${CHALLENGE.slice(1)}+` },
      'invalid_request',
    ],
    ['un code_challenge_method « plain »', { code_challenge_method: 'plain' }, 'invalid_request'],
    ['un code_challenge_method « s256 »', { code_challenge_method: 's256' }, 'invalid_request'],
    ['un code_challenge_method absent', { code_challenge_method: undefined }, 'invalid_request'],
    ['un périmètre inconnu', { scope: 'openid' }, 'invalid_scope'],
    ['« leon » avec autre chose', { scope: 'leon offline_access' }, 'invalid_scope'],
    ['un périmètre en majuscules', { scope: 'LEON' }, 'invalid_scope'],
    ['une ressource étrangère', { resource: 'https://evil.example/api/mcp' }, 'invalid_target'],
    ['la ressource avec une barre de plus', { resource: `${RESOURCE}/` }, 'invalid_target'],
    ['une ressource vide', { resource: '' }, 'invalid_target'],
  ])('%s : l’erreur et l’état sont renvoyés à redirect_uri', async (_name, over, erreur) => {
    expect(await parseAuthorizeRequest(params(over))).toEqual({ erreur, retour: target });
  });

  it('un état de 513 caractères : invalid_request, et il n’est pas renvoyé', async () => {
    expect(await parseAuthorizeRequest(params({ state: 'a'.repeat(513) }))).toEqual({
      erreur: 'invalid_request',
      retour: { redirectUri: CLAUDE },
    });
  });

  it('un paramètre répété n’est pas une valeur : response_type=code&response_type=code', async () => {
    expect(await parseAuthorizeRequest(params({ response_type: ['code', 'code'] }))).toEqual({
      erreur: 'unsupported_response_type',
      retour: target,
    });
  });

  it('sans état, l’erreur n’en porte pas', async () => {
    expect(await parseAuthorizeRequest(params({ state: undefined, scope: 'x' }))).toEqual({
      erreur: 'invalid_scope',
      retour: { redirectUri: CLAUDE },
    });
  });

  it('renvoie à l’adresse du bouclage demandée, port compris', async () => {
    const client_id = register([LOOPBACK]);

    expect(
      await parseAuthorizeRequest(
        params({ client_id, redirect_uri: 'http://127.0.0.1:2222/cb', scope: 'x' }),
      ),
    ).toEqual({
      erreur: 'invalid_scope',
      retour: { redirectUri: 'http://127.0.0.1:2222/cb', state: 'etat-du-client' },
    });
  });
});

describe('oauthAuthorizePath : le chemin rebâti depuis la demande validée', () => {
  it('écrit les huit paramètres, dans l’ordre, encodés', async () => {
    const request = await validated();

    expect(oauthAuthorizePath(request)).toBe(
      `/oauth/autoriser?${new URLSearchParams([
        ['response_type', 'code'],
        ['client_id', CLIENT_ID],
        ['redirect_uri', CLAUDE],
        ['state', 'etat-du-client'],
        ['code_challenge', CHALLENGE],
        ['code_challenge_method', 'S256'],
        ['scope', 'leon'],
        ['resource', RESOURCE],
      ])}`,
    );
  });

  it('ajoute ce que la demande laissait implicite (adresse, périmètre, ressource) et omet l’état absent', async () => {
    const path = oauthAuthorizePath(
      await validated({
        redirect_uri: undefined,
        scope: undefined,
        resource: undefined,
        state: undefined,
      }),
    );
    const query = new URL(path, ISSUER).searchParams;

    expect(query.get('redirect_uri')).toBe(CLAUDE);
    expect(query.get('scope')).toBe('leon');
    expect(query.get('resource')).toBe(RESOURCE);
    expect(query.has('state')).toBe(false);
  });

  it('se relit : la page valide ce que le chemin rebâti porte', async () => {
    const request = await validated({ state: 'a b&c=d/é' });
    const query = new URL(oauthAuthorizePath(request), ISSUER).searchParams;

    expect(await parseAuthorizeRequest(Object.fromEntries(query))).toEqual(request);
  });
});

describe('oauthReturnPath : la forme seulement, pour le retour après la connexion', () => {
  const query = (over: Record<string, unknown> = {}) => params(over);

  it('rebâtit le chemin à partir des huit paramètres connus, sans lire le client', async () => {
    const request = await validated();

    expect(oauthReturnPath(query())).toBe(oauthAuthorizePath(request));
  });

  it('laisse tomber tout autre paramètre', async () => {
    const request = await validated();

    expect(
      oauthReturnPath(query({ retour: 'https://evil.example', suite: '/reglages', port: '4242' })),
    ).toBe(oauthAuthorizePath(request));
  });

  it('garde un client_id inconnu : la page seule juge le client et l’adresse de retour', () => {
    expect(oauthReturnPath(query({ client_id: 'inconnu' }))).toContain('client_id=inconnu');
  });

  it.each([
    ['sans client_id', { client_id: undefined }],
    ['un client_id vide', { client_id: '' }],
    ['un client_id de plus de 4 Ko', { client_id: 'a'.repeat(4097) }],
    ['un paramètre répété', { state: ['a', 'b'] }],
    ['un état de plus de 512 caractères', { state: 'a'.repeat(513) }],
    ['une adresse de retour de plus de 512 caractères', { redirect_uri: 'a'.repeat(513) }],
    ['un paramètre qui n’est pas une chaîne', { scope: 42 }],
  ])('refuse %s', (_name, over) => {
    expect(oauthReturnPath(query(over))).toBeNull();
  });

  it('accepte un client_id de 4 Ko', () => {
    expect(oauthReturnPath(query({ client_id: 'a'.repeat(4096) }))).not.toBeNull();
  });
});

describe('codeRedirect : « Autoriser » (L6 point 5, L7)', () => {
  const urlOf = async (over: Record<string, unknown> = {}, now = NOW) =>
    new URL(codeRedirect(await validated(over), CTX, now));

  it('renvoie vers redirect_uri avec code, state et iss, dans cet ordre', async () => {
    const url = await urlOf();

    expect(url.origin + url.pathname).toBe(CLAUDE);
    expect([...url.searchParams.keys()]).toEqual(['code', 'state', 'iss']);
    expect(url.searchParams.get('state')).toBe('etat-du-client');
    expect(url.searchParams.get('iss')).toBe(ISSUER);
  });

  it('signe la charge de L7 : le client, l’adresse, l’empreinte PKCE reçue, l’utilisateur et l’espace', async () => {
    const request = await validated();
    const url = new URL(codeRedirect(request, CTX, NOW));

    const code = readAuthorizationCode(url.searchParams.get('code') ?? '', { now: NOW });

    expect(code).toEqual({
      v: 1,
      j: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
      c: createHash('sha256').update(CLIENT_ID).digest('hex'),
      r: CLAUDE,
      p: CHALLENGE,
      u: 'u1',
      t: 't1',
      x: NOW / 1000 + 120,
    });
    expect(code?.c).toBe(request.client.ref);
  });

  it('chaque code a son identifiant (grant_id) : l’usage unique tient à son unicité', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const url = await urlOf();
      ids.add(readAuthorizationCode(url.searchParams.get('code') ?? '', { now: NOW })?.j ?? '');
    }

    expect(ids.size).toBe(20);
  });

  it('vaut deux minutes', async () => {
    const code = (await urlOf()).searchParams.get('code') ?? '';

    expect(readAuthorizationCode(code, { now: NOW + 119_000 })).not.toBeNull();
    expect(readAuthorizationCode(code, { now: NOW + 120_000 })).not.toBeNull();
    expect(readAuthorizationCode(code, { now: NOW + 121_000 })).toBeNull();
  });

  it('sans état, ne renvoie pas de state', async () => {
    const url = await urlOf({ state: undefined });

    expect([...url.searchParams.keys()]).toEqual(['code', 'iss']);
  });

  it('ajoute aux paramètres que redirect_uri porte déjà, et encode l’état', async () => {
    const client_id = register(['http://127.0.0.1:1111/cb?x=1']);
    const state = 'a b&c=d/é#f';
    const request = await validated({
      client_id,
      redirect_uri: 'http://127.0.0.1:2222/cb?x=1',
      state,
    });

    const url = new URL(codeRedirect(request, CTX, NOW));

    expect([...url.searchParams.keys()]).toEqual(['x', 'code', 'state', 'iss']);
    expect(url.searchParams.get('x')).toBe('1');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.hash).toBe('');
  });

  it('renvoie au bouclage demandé, au port demandé', async () => {
    const client_id = register([LOOPBACK]);
    const url = await urlOf({ client_id, redirect_uri: 'http://127.0.0.1:2222/cb' });

    expect(url.origin + url.pathname).toBe('http://127.0.0.1:2222/cb');
  });
});

describe('readAuthorizationCode : ce que M06 vérifie', () => {
  const code = async () => {
    const url = new URL(codeRedirect(await validated(), CTX, NOW));
    return url.searchParams.get('code') ?? '';
  };
  const claims = {
    v: 1,
    j: 'AAAAAAAAAAAAAAAAAAAAAA',
    c: 'a1'.repeat(32),
    r: CLAUDE,
    p: CHALLENGE,
    u: 'u1',
    t: 't1',
    x: NOW / 1000 + 60,
  };

  it('lit un code qu’on vient de signer', async () => {
    expect(readAuthorizationCode(await code(), { now: NOW })).toMatchObject({ u: 'u1', t: 't1' });
  });

  it('refuse un code sans expiration : verifyPayload l’accepte, le schéma ne l’accepte pas', () => {
    const { x: _x, ...withoutExpiry } = claims;

    expect(readAuthorizationCode(signPayload('oauth-code', claims), { now: NOW })).not.toBeNull();
    expect(
      readAuthorizationCode(signPayload('oauth-code', withoutExpiry), { now: NOW }),
    ).toBeNull();
  });

  it.each([
    ['une expiration qui n’est pas un entier', { x: 1.5 }],
    ['une version inconnue', { v: 2 }],
    ['un champ de plus', { z: 1 }],
    ['une empreinte de client qui n’est pas du SHA-256 hexadécimal', { c: 'abc' }],
    ['une empreinte PKCE de la mauvaise taille', { p: 'abc' }],
    ['un identifiant de la mauvaise taille', { j: 'abc' }],
    ['un utilisateur vide', { u: '' }],
    ['un espace vide', { t: '' }],
    ['une adresse de retour absente', { r: undefined }],
  ])('refuse %s', (_name, over) => {
    expect(
      readAuthorizationCode(signPayload('oauth-code', { ...claims, ...over }), { now: NOW }),
    ).toBeNull();
  });

  it('refuse un code signé pour un autre but, falsifié ou tronqué', async () => {
    const good = await code();

    expect(readAuthorizationCode(signPayload('ordinateur', claims), { now: NOW })).toBeNull();
    expect(readAuthorizationCode(signPayload('oauth-client', claims), { now: NOW })).toBeNull();
    expect(readAuthorizationCode(`${good}A`, { now: NOW })).toBeNull();
    expect(readAuthorizationCode(good.slice(0, -2), { now: NOW })).toBeNull();
    expect(readAuthorizationCode('', { now: NOW })).toBeNull();
  });
});

describe('errorRedirect : « Refuser » et les erreurs de L6 point 2', () => {
  it('renvoie vers redirect_uri avec error, state et iss, dans cet ordre', () => {
    const url = new URL(
      errorRedirect({ redirectUri: CLAUDE, state: 'etat-du-client' }, 'access_denied'),
    );

    expect(url.origin + url.pathname).toBe(CLAUDE);
    expect([...url.searchParams.entries()]).toEqual([
      ['error', 'access_denied'],
      ['state', 'etat-du-client'],
      ['iss', ISSUER],
    ]);
  });

  it('sans état, ne renvoie pas de state ; ne porte jamais de code', () => {
    const url = new URL(errorRedirect({ redirectUri: CLAUDE }, 'invalid_scope'));

    expect([...url.searchParams.keys()]).toEqual(['error', 'iss']);
  });

  it('ajoute aux paramètres que redirect_uri porte déjà', () => {
    const url = new URL(
      errorRedirect({ redirectUri: 'http://127.0.0.1:2222/cb?x=1', state: 's' }, 'access_denied'),
    );

    expect([...url.searchParams.keys()]).toEqual(['x', 'error', 'state', 'iss']);
  });
});

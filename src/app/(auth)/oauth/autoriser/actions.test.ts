import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserContext } from '@/server/auth/session';
import {
  oauthAuthorizePath,
  parseAuthorizeRequest,
  readAuthorizationCode,
} from '@/server/oauth/authorize';
import { registerClient } from '@/server/oauth/clients';
import { authorizeOAuthAction } from './actions';

vi.mock('@/server/auth/session', () => ({ getUserContext: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const CTX = { userId: 'u1', tenantId: 't1', principals: ['u1', 't1'] };
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const CHALLENGE = createHash('sha256').update('un-code-verifier-de-test').digest('base64url');
const ISSUER = 'http://localhost:3000';

function register(uris: string[]): string {
  const result = registerClient({ redirect_uris: uris, client_name: 'Claude' });
  if ('error' in result) throw new Error(result.error);
  return result.client.client_id;
}
const CLIENT_ID = register([CLAUDE]);

const FIELDS = {
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: CLAUDE,
  state: 'etat-du-client',
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
  scope: 'leon',
  resource: `${ISSUER}/api/mcp`,
};

const form = (fields: Record<string, string | undefined>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) data.set(key, value);
  return data;
};

// L'adresse vers laquelle l'action renvoie le navigateur (le mock de redirect la glisse dans l'erreur).
const target = async (fields: Record<string, string | undefined>) => {
  const error = await authorizeOAuthAction(form(fields)).then(
    () => new Error('pas de redirection'),
    (caught: Error) => caught,
  );
  expect(error.message).toMatch(/^NEXT_REDIRECT /);
  return error.message.slice('NEXT_REDIRECT '.length);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserContext).mockResolvedValue(CTX);
});

describe('« Autoriser »', () => {
  it('renvoie vers redirect_uri avec un code qui porte l’empreinte PKCE reçue, l’état et iss', async () => {
    const url = new URL(await target({ ...FIELDS, decision: 'allow' }));

    expect(url.origin + url.pathname).toBe(CLAUDE);
    expect([...url.searchParams.keys()]).toEqual(['code', 'state', 'iss']);
    expect(url.searchParams.get('state')).toBe('etat-du-client');
    expect(url.searchParams.get('iss')).toBe(ISSUER);
    expect(readAuthorizationCode(url.searchParams.get('code') ?? '')).toMatchObject({
      v: 1,
      c: createHash('sha256').update(CLIENT_ID).digest('hex'),
      r: CLAUDE,
      p: CHALLENGE,
      u: 'u1',
      t: 't1',
    });
  });

  it('relit la session et l’espace : le formulaire ne dit pas qui autorise', async () => {
    vi.mocked(getUserContext).mockResolvedValue({ ...CTX, userId: 'u2', tenantId: 't2' });

    const url = new URL(
      await target({ ...FIELDS, decision: 'allow', u: 'pirate', t: 'autre-espace', userId: 'x' }),
    );

    expect(readAuthorizationCode(url.searchParams.get('code') ?? '')).toMatchObject({
      u: 'u2',
      t: 't2',
    });
    expect(getUserContext).toHaveBeenCalledTimes(1);
  });

  it('sans session ni espace, ne signe rien et rend la main à la page, qui choisit', async () => {
    vi.mocked(getUserContext).mockResolvedValue(null);
    const request = await parseAuthorizeRequest(FIELDS);
    if ('erreur' in request) throw new Error('demande refusée');

    expect(await target({ ...FIELDS, decision: 'allow' })).toBe(oauthAuthorizePath(request));
  });

  it('un bouclage : renvoie au port demandé, qui peut différer de l’inscription', async () => {
    const client_id = register(['http://127.0.0.1:1111/cb']);

    const url = new URL(
      await target({
        ...FIELDS,
        client_id,
        redirect_uri: 'http://127.0.0.1:54321/cb',
        decision: 'allow',
      }),
    );

    expect(url.origin + url.pathname).toBe('http://127.0.0.1:54321/cb');
    expect(url.searchParams.has('code')).toBe(true);
  });
});

describe('« Refuser »', () => {
  it('renvoie vers redirect_uri avec access_denied, l’état et iss, sans signer ni lire la session', async () => {
    const url = new URL(await target({ ...FIELDS, decision: 'deny' }));

    expect(url.origin + url.pathname).toBe(CLAUDE);
    expect([...url.searchParams.entries()]).toEqual([
      ['error', 'access_denied'],
      ['state', 'etat-du-client'],
      ['iss', ISSUER],
    ]);
    expect(getUserContext).not.toHaveBeenCalled();
  });

  it('vaut aussi pour une décision absente ou inconnue : seul « allow » signe', async () => {
    for (const decision of [undefined, '', 'ALLOW', 'allow ', 'oui']) {
      const url = new URL(await target({ ...FIELDS, decision }));

      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(url.searchParams.has('code')).toBe(false);
    }
    expect(getUserContext).not.toHaveBeenCalled();
  });
});

describe('le formulaire ne vaut rien : tout est revalidé', () => {
  const ASSISTANT = '/oauth/autoriser';

  it.each([
    ['un client_id falsifié', { client_id: `${CLIENT_ID.slice(0, -2)}AA` }],
    ['un client_id absent', { client_id: undefined }],
    ['un client_id inconnu', { client_id: 'abc' }],
    ['une adresse de retour étrangère', { redirect_uri: 'https://evil.example/cb' }],
    [
      'une adresse de retour du bon hôte, d’un autre chemin',
      { redirect_uri: 'https://claude.ai/x' },
    ],
    ['une adresse de retour de bouclage non inscrite', { redirect_uri: 'http://127.0.0.1:4/cb' }],
  ])(
    '%s : rien n’est signé ni suivi, le navigateur retourne sur la page, qui l’explique',
    async (_name, over) => {
      for (const decision of ['allow', 'deny']) {
        expect(await target({ ...FIELDS, ...over, decision })).toBe(ASSISTANT);
      }
      expect(getUserContext).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['un response_type autre que code', { response_type: 'token' }, 'unsupported_response_type'],
    ['un code_challenge absent', { code_challenge: undefined }, 'invalid_request'],
    ['une méthode autre que S256', { code_challenge_method: 'plain' }, 'invalid_request'],
    ['un périmètre inconnu', { scope: 'openid' }, 'invalid_scope'],
    ['une ressource étrangère', { resource: 'https://evil.example/api/mcp' }, 'invalid_target'],
  ])(
    '%s : l’erreur et l’état repartent vers l’adresse de retour vérifiée, sans code',
    async (_name, over, error) => {
      for (const decision of ['allow', 'deny']) {
        const url = new URL(await target({ ...FIELDS, ...over, decision }));

        expect(url.origin + url.pathname).toBe(CLAUDE);
        expect([...url.searchParams.entries()]).toEqual([
          ['error', error],
          ['state', 'etat-du-client'],
          ['iss', ISSUER],
        ]);
      }
      expect(getUserContext).not.toHaveBeenCalled();
    },
  );

  it('ne lit que les huit paramètres : un champ en plus ne change ni l’adresse ni le code', async () => {
    const url = new URL(
      await target({ ...FIELDS, decision: 'allow', redirect_to: 'https://evil.example', iss: 'x' }),
    );

    expect(url.origin + url.pathname).toBe(CLAUDE);
    expect(url.searchParams.get('iss')).toBe(ISSUER);
    expect(url.searchParams.has('redirect_to')).toBe(false);
  });
});

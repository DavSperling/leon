import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createTranslator } from 'next-intl';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/verre/ui/button';
import { nb } from '@/lib/verre/nb';
import { getSession, getUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { parseAuthorizeRequest } from '@/server/oauth/authorize';
import { registerClient } from '@/server/oauth/clients';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import { authorizeOAuthAction } from './actions';
import AuthorizePage, { generateMetadata } from './page';

vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), getUserContext: vi.fn() }));
vi.mock('@/server/auth/viewer', () => ({ getViewerProfile: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const CTX = { userId: 'u1', tenantId: 't1', principals: ['u1', 't1'] };
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const LOOPBACK = 'http://127.0.0.1:1111/cb';
const CHALLENGE = createHash('sha256').update('un-code-verifier-de-test').digest('base64url');
const ISSUER = 'http://localhost:3000';
const RESOURCE = `${ISSUER}/api/mcp`;

function register(uris: string[], name = 'Claude'): string {
  const result = registerClient({ redirect_uris: uris, client_name: name });
  if ('error' in result) throw new Error(result.error);
  return result.client.client_id;
}
const CLIENT_ID = register([CLAUDE]);

const PARAMS = {
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: CLAUDE,
  state: 'etat-du-client',
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
  scope: 'leon',
  resource: RESOURCE,
};

type Params = Record<string, string | string[] | undefined>;
const render = async (params: Params = PARAMS) =>
  (await AuthorizePage({ searchParams: Promise.resolve(params) })) as ReactElement;

// Tous les éléments d'un rendu, sans exécuter les composants : leurs enfants sont dans leurs props.
const elements = (node: ReactNode): ReactElement<Record<string, unknown>>[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
};
const texts = (node: ReactNode): string[] => {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return texts(node.props.children);
};
const textOf = (node: ReactNode) => texts(node).join(' ');

const redirectsTo = async (params: Params, path: string) => {
  await expect(render(params)).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenLastCalledWith(path);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(getUserContext).mockResolvedValue(CTX);
  vi.mocked(getViewerProfile).mockResolvedValue({ organizationName: 'Acme' } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe('client_id ou adresse de retour qui ne valent rien (L6 point 1)', () => {
  it.each([
    ['un client_id inconnu', { client_id: 'abc' }, 'invalidClient'],
    ['un client_id mal signé', { client_id: `${CLIENT_ID.slice(0, -2)}AA` }, 'invalidClient'],
    ['un client_id absent', { client_id: undefined }, 'invalidClient'],
    ['un client_id répété', { client_id: [CLIENT_ID, CLIENT_ID] }, 'invalidClient'],
    [
      'une adresse de retour étrangère',
      { redirect_uri: 'https://evil.example/cb' },
      'invalidReturn',
    ],
    [
      'une adresse du bon hôte, d’un autre chemin',
      { redirect_uri: 'https://claude.ai/x' },
      'invalidReturn',
    ],
    ['une adresse de bouclage non inscrite', { redirect_uri: LOOPBACK }, 'invalidReturn'],
    ['une adresse répétée', { redirect_uri: [CLAUDE, CLAUDE] }, 'invalidReturn'],
  ])(
    '%s : la page le dit, sans bouton, sans formulaire et sans rediriger',
    async (_name, over, key) => {
      const page = await render({ ...PARAMS, ...over });

      expect(elements(page).some((el) => el.type === 'form' || el.type === Button)).toBe(false);
      const text = textOf(page);
      expect(text).toContain(fr.oauth.authorize.invalidTitle);
      expect(text).toContain(nb(fr.oauth.authorize[key as 'invalidClient' | 'invalidReturn']));
      expect(redirect).not.toHaveBeenCalled();
      // ni session, ni espace : rien à montrer ni à protéger tant que le lien ne vaut rien
      expect(getSession).not.toHaveBeenCalled();
    },
  );

  it('une erreur de client ou de retour passe avant celles de OAuth : rien ne redirige', async () => {
    await render({ ...PARAMS, client_id: 'abc', response_type: 'token' });
    await render({ ...PARAMS, redirect_uri: 'https://evil.example/cb', scope: 'x' });

    expect(redirect).not.toHaveBeenCalled();
  });

  it('sans aucun paramètre, de même', async () => {
    const page = await render({});

    expect(elements(page).some((el) => el.type === 'form')).toBe(false);
    expect(textOf(page)).toContain(fr.oauth.authorize.invalidTitle);
  });

  it('ne recopie aucune valeur reçue dans la page', async () => {
    const page = await render({
      ...PARAMS,
      client_id: 'evil-client',
      redirect_uri: 'https://evil.example/cb',
      state: 'evil-state',
    });

    expect(JSON.stringify(textOf(page))).not.toMatch(/evil/);
  });
});

describe('les erreurs de OAuth repartent vers l’adresse de retour vérifiée (L6 point 2)', () => {
  it.each([
    ['un response_type autre que code', { response_type: 'token' }, 'unsupported_response_type'],
    ['un code_challenge absent', { code_challenge: undefined }, 'invalid_request'],
    ['une méthode autre que S256', { code_challenge_method: 'plain' }, 'invalid_request'],
    ['un périmètre inconnu', { scope: 'openid' }, 'invalid_scope'],
    ['une ressource étrangère', { resource: 'https://evil.example/api/mcp' }, 'invalid_target'],
  ])('%s : error, state et iss, avant toute connexion', async (_name, over, error) => {
    vi.mocked(getSession).mockResolvedValue(null);

    await redirectsTo(
      { ...PARAMS, ...over },
      `${CLAUDE}?error=${error}&state=etat-du-client&iss=${encodeURIComponent(ISSUER)}`,
    );

    expect(getSession).not.toHaveBeenCalled();
  });
});

describe('sans session ou sans espace', () => {
  it('renvoie vers /connexion avec la demande validée, qui y reviendra', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await redirectsTo(PARAMS, `/connexion?${new URLSearchParams(PARAMS)}`);

    expect(getUserContext).not.toHaveBeenCalled();
  });

  it('le chemin de retour est rebâti : un paramètre en trop ne le suit pas, l’implicite est écrit', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await redirectsTo(
      {
        ...PARAMS,
        redirect_uri: undefined,
        scope: '',
        retour: 'https://evil.example',
        suite: '/x',
      },
      `/connexion?${new URLSearchParams(PARAMS)}`,
    );
  });

  it('une session sans espace va à l’onboarding', async () => {
    vi.mocked(getUserContext).mockResolvedValue(null);

    await redirectsTo(PARAMS, '/bienvenue');

    expect(getViewerProfile).not.toHaveBeenCalled();
  });
});

// Un client_id en https:// est un document que Leon irait lire chez le client : jamais pour quelqu'un qui n'a pas de session.
describe('un client_id CIMD (https://) et la session', () => {
  let count = 0;
  const cimd = () => {
    const url = `https://chatgpt.com/oauth/page-${count++}.json`;
    const redirect_uri = 'https://chatgpt.com/connector/oauth/abc123';
    const fetched = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ client_id: url, client_name: 'ChatGPT', redirect_uris: [redirect_uri] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetched);
    return { url, redirect_uri, fetched, params: { ...PARAMS, client_id: url, redirect_uri } };
  };

  it('sans session : renvoie vers /connexion avec la demande rebâtie, sans lire le document', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const { fetched, params } = cimd();

    await redirectsTo(
      { ...params, scope: '', retour: 'https://evil.example' },
      `/connexion?${new URLSearchParams({ ...params, scope: '' })}`,
    );

    expect(fetched).not.toHaveBeenCalled();
    expect(getUserContext).not.toHaveBeenCalled();
  });

  it('sans session, même une demande qui serait refusée ensuite n’en lit pas : rien ne part vers le client', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const { fetched, params } = cimd();

    await redirectsTo(
      { ...params, response_type: 'token', redirect_uri: 'https://evil.example/cb' },
      `/connexion?${new URLSearchParams({ ...params, response_type: 'token', redirect_uri: 'https://evil.example/cb' })}`,
    );

    expect(fetched).not.toHaveBeenCalled();
  });

  it('sans session et sans demande qu’on puisse rebâtir : la page le dit, sans rien lire ni rediriger', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const { fetched, params } = cimd();

    const page = await render({ ...params, state: ['a', 'b'] });

    expect(textOf(page)).toContain(fr.oauth.authorize.invalidTitle);
    expect(fetched).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('avec une session : inchangé, le document est lu et la page se montre', async () => {
    const { fetched, params } = cimd();

    const page = await render(params);

    expect(fetched).toHaveBeenCalledOnce();
    expect(textOf(page)).toContain(nb('Autoriser ChatGPT à lire votre mémoire Leon'));
    expect(redirect).not.toHaveBeenCalled();
  });

  it('un client_id signé garde l’ordre d’avant : jugé sur place, puis la session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const { fetched } = cimd();

    await redirectsTo(PARAMS, `/connexion?${new URLSearchParams(PARAMS)}`);

    expect(fetched).not.toHaveBeenCalled(); // rien à lire : la signature suffit
  });
});

describe('page d’autorisation (L6 point 4)', () => {
  it('pose la question avec le nom du client et celui de l’espace, puis « Autoriser » et « Refuser »', async () => {
    const page = await render();

    expect(redirect).not.toHaveBeenCalled();
    expect(getViewerProfile).toHaveBeenCalledWith(CTX);
    const text = textOf(page);
    expect(text).toContain(nb('Autoriser Claude à lire votre mémoire Leon dans l’espace Acme ?'));
    const buttons = elements(page).filter((el) => el.type === Button);
    expect(buttons.map((el) => [el.props.name, el.props.value, textOf(el)])).toEqual([
      ['decision', 'allow', 'Autoriser'],
      ['decision', 'deny', 'Refuser'],
    ]);
    expect(buttons.map((el) => el.props.type)).toEqual(['submit', 'submit']);
  });

  it('dit l’hôte de retour, en évidence', async () => {
    const page = await render();

    const host = elements(page).find((el) => textOf(el) === 'Vous serez renvoyé vers claude.ai');
    expect(host).toBeDefined();
    expect(String(host?.props.className)).toMatch(/font-semibold/);
  });

  it('pour un retour en bouclage, dit « une application de cet ordinateur » à la place de l’hôte', async () => {
    const client_id = register([LOOPBACK]);

    const text = textOf(
      await render({ ...PARAMS, client_id, redirect_uri: 'http://127.0.0.1:54321/cb' }),
    );

    expect(text).toContain('Vous serez renvoyé vers une application de cet ordinateur');
    expect(text).not.toContain('127.0.0.1');
    expect(text).not.toContain('Vous serez renvoyé vers 127');
  });

  it('montre l’hôte de l’adresse demandée, pas celui de la première adresse inscrite', async () => {
    const client_id = register([CLAUDE, 'https://chatgpt.com/connector_platform_oauth_redirect']);

    const text = textOf(
      await render({
        ...PARAMS,
        client_id,
        redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      }),
    );

    expect(text).toContain('Vous serez renvoyé vers chatgpt.com');
    expect(text).not.toContain('claude.ai');
  });

  it('dit ce que l’assistant pourra faire, et l’avertissement', async () => {
    const text = textOf(await render());

    expect(text).toContain(nb(fr.oauth.authorize.can));
    for (const key of ['canSearch', 'canRead', 'canBriefing', 'canRemember'] as const) {
      expect(text).toContain(fr.oauth.authorize[key]);
    }
    expect(text).toContain(
      'Si vous n’êtes pas en train de brancher un assistant vous-même, refusez.',
    );
  });

  it('un nom inscrit à la main est dit « déclaré » ; celui d’un document CIMD ne l’est pas', async () => {
    expect(textOf(await render())).toContain(nb(fr.oauth.authorize.declaredName));

    const url = 'https://chatgpt.com/oauth/client.json';
    const redirect_uri = 'https://chatgpt.com/connector/oauth/abc123';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              client_id: url,
              client_name: 'ChatGPT',
              redirect_uris: [redirect_uri],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    );
    const cimd = textOf(await render({ ...PARAMS, client_id: url, redirect_uri }));

    expect(cimd).toContain(nb('Autoriser ChatGPT à lire votre mémoire Leon dans l’espace Acme ?'));
    expect(cimd).not.toContain(fr.oauth.authorize.declaredName);
  });

  it('un nom de client est du texte : jamais interprété', async () => {
    const client_id = register([CLAUDE], '<b>Claude</b> {space}');

    const page = await render({ ...PARAMS, client_id });

    expect(textOf(page)).toContain(nb('Autoriser <b>Claude</b> {space} à lire'));
  });

  it('envoie la demande validée à l’action serveur, huit champs cachés et l’espace affiché, rien d’autre', async () => {
    const page = await render({ ...PARAMS, retour: 'https://evil.example', scope: '' });

    const forms = elements(page).filter((el) => el.type === 'form');
    expect(forms).toHaveLength(1);
    expect(forms[0]?.props.action).toBe(authorizeOAuthAction);
    const hidden = elements(forms[0]).filter((el) => el.type === 'input');
    expect(hidden.map((el) => [el.props.type, el.props.name, el.props.value])).toEqual([
      ...Object.entries(PARAMS).map(([name, value]) => ['hidden', name, value]),
      // l'espace que la page a nommé : l'action vérifie que c'est encore celui de la session
      ['hidden', 'space', CTX.tenantId],
    ]);
    // et l'action relit exactement ce que la page a écrit
    const sent = Object.fromEntries(hidden.map((el) => [el.props.name as string, el.props.value]));
    expect('erreur' in (await parseAuthorizeRequest(sent))).toBe(false);
  });

  it('n’est pas indexée et ne sort pas en référent : l’adresse porte l’état et l’empreinte', async () => {
    expect(await generateMetadata()).toEqual({
      title: fr.oauth.authorize.title,
      referrer: 'same-origin', // pas 'no-referrer' : un formulaire natif partirait avec « Origin: null », que Next refuse
      robots: { index: false, follow: false },
    });
  });
});

describe('textes', () => {
  it.each([
    ['fr', fr, 'Autoriser Claude à lire votre mémoire Leon dans l’espace Acme ?'],
    ['en', en, 'Authorize Claude to read your Leon memory in the Acme workspace?'],
  ] as const)(
    'la question se lit en %s, avec le client et l’espace',
    (locale, messages, expected) => {
      const t = createTranslator({ locale, messages, namespace: 'oauth.authorize' });

      expect(t('question', { client: 'Claude', space: 'Acme' })).toBe(expected);
    },
  );

  it.each([
    [
      'fr',
      fr,
      'Vous serez renvoyé vers claude.ai',
      'Vous serez renvoyé vers une application de cet ordinateur',
    ],
    [
      'en',
      en,
      'You will be sent to claude.ai',
      'You will be sent to an application on this computer',
    ],
  ] as const)(
    'l’hôte de retour et le bouclage se lisent en %s',
    (locale, messages, host, local) => {
      const t = createTranslator({ locale, messages, namespace: 'oauth.authorize' });

      expect(t('returnTo', { host: 'claude.ai' })).toBe(host);
      expect(t('returnToLocal')).toBe(local);
    },
  );

  it('l’anglais a tous les textes de la page, les mêmes clés que le français', () => {
    expect(Object.keys(en.oauth.authorize).sort()).toEqual(Object.keys(fr.oauth.authorize).sort());
    expect(en.oauth.authorize).toMatchObject({
      warning: 'If you aren’t connecting an assistant yourself, refuse.',
      allow: 'Authorize',
      deny: 'Refuse',
    });
  });
});

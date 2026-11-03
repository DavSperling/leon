import { redirect } from 'next/navigation';
import { createTranslator } from 'next-intl';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/verre/ui/button';
import { nb } from '@/lib/verre/nb';
import { getSession, getUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import { authorizeComputerAction } from './actions';
import AuthorizePage, { generateMetadata } from './page';

vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), getUserContext: vi.fn() }));
vi.mock('@/server/auth/viewer', () => ({ getViewerProfile: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const CTX = { userId: 'u1', tenantId: 't1', principals: ['u1', 't1'] };
const ETAT = 'AbCdEfGhIjKlMnOpQrStUv';
const EMPREINTE = 'a1'.repeat(32);
const PARAMS = { port: '4242', etat: ETAT, empreinte: EMPREINTE };

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

const redirectsTo = async (params: Params | undefined, path: string) => {
  await expect(render(params)).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenLastCalledWith(path);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(getUserContext).mockResolvedValue(CTX);
  vi.mocked(getViewerProfile).mockResolvedValue({ organizationName: 'Acme' } as never);
});

describe('paramètres invalides (K3)', () => {
  it.each([
    ['un port sous 1024', { port: '80' }],
    ['un port au-dessus de 65535', { port: '70000' }],
    ['un port qui cache une machine', { port: '1234@evil.example' }],
    ['une empreinte de 63 caractères', { empreinte: 'a'.repeat(63) }],
    ['un etat trop court', { etat: 'court' }],
    ['un port répété', { port: ['4242', '4243'] }],
    ['un paramètre absent', { empreinte: undefined }],
  ])('%s : la page le dit, sans bouton ni formulaire', async (_name, over) => {
    const page = await render({ ...PARAMS, ...over });

    const all = elements(page);
    expect(all.some((el) => el.type === 'form' || el.type === Button)).toBe(false);
    const text = textOf(page);
    expect(text).toContain(fr.computer.authorize.invalidTitle);
    expect(text).toContain(nb(fr.computer.authorize.invalidText));
    // ni session, ni espace : rien à montrer ni à protéger tant que le lien ne vaut rien
    expect(getSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sans aucun paramètre, de même', async () => {
    const page = await render({});

    expect(elements(page).some((el) => el.type === 'form')).toBe(false);
    expect(textOf(page)).toContain(fr.computer.authorize.invalidTitle);
  });

  it('ne recopie aucune valeur reçue dans la page', async () => {
    const page = await render({ ...PARAMS, port: '1234@evil.example', etat: 'x', empreinte: 'y' });

    expect(JSON.stringify(textOf(page))).not.toMatch(/evil|1234/);
  });
});

describe('sans session ou sans espace', () => {
  it('renvoie vers /connexion avec les trois paramètres, qui y reviendront', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await redirectsTo(PARAMS, `/connexion?port=4242&etat=${ETAT}&empreinte=${EMPREINTE}`);

    expect(getUserContext).not.toHaveBeenCalled();
  });

  it('le chemin de retour est rebâti : un paramètre en trop ne le suit pas', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await redirectsTo(
      { ...PARAMS, retour: 'https://evil.example', suite: '/reglages' },
      `/connexion?port=4242&etat=${ETAT}&empreinte=${EMPREINTE}`,
    );
  });

  it('une session sans espace va à l’onboarding', async () => {
    vi.mocked(getUserContext).mockResolvedValue(null);

    await redirectsTo(PARAMS, '/bienvenue');

    expect(getViewerProfile).not.toHaveBeenCalled();
  });
});

describe('page d’autorisation', () => {
  it('pose la question avec le nom de l’espace, l’avertissement, puis « Autoriser » et « Annuler »', async () => {
    const page = await render();

    expect(redirect).not.toHaveBeenCalled();
    expect(getViewerProfile).toHaveBeenCalledWith(CTX);
    const text = textOf(page);
    expect(text).toContain(
      nb('Autoriser cet ordinateur à envoyer vos sessions de code à Leon, dans l’espace Acme ?'),
    );
    expect(text).toContain(
      'Si vous ne venez pas de lancer la commande vous-même dans un terminal, annulez.',
    );
    const buttons = elements(page).filter((el) => el.type === Button);
    expect(buttons.map((el) => [el.props.name, el.props.value, textOf(el)])).toEqual([
      ['decision', 'allow', 'Autoriser'],
      ['decision', 'cancel', 'Annuler'],
    ]);
    expect(buttons.map((el) => el.props.type)).toEqual(['submit', 'submit']);
  });

  it('envoie les trois paramètres validés à l’action serveur, rien d’autre', async () => {
    const page = await render({ ...PARAMS, retour: 'https://evil.example' });

    const forms = elements(page).filter((el) => el.type === 'form');
    expect(forms).toHaveLength(1);
    expect(forms[0]?.props.action).toBe(authorizeComputerAction);
    const hidden = elements(forms[0]).filter((el) => el.type === 'input');
    expect(hidden.map((el) => [el.props.type, el.props.name, el.props.value])).toEqual([
      ['hidden', 'port', 4242],
      ['hidden', 'etat', ETAT],
      ['hidden', 'empreinte', EMPREINTE],
    ]);
  });

  it('n’est ni indexée ni citée en référent : l’adresse porte l’etat et l’empreinte', async () => {
    expect(await generateMetadata()).toEqual({
      title: fr.computer.authorize.title,
      referrer: 'no-referrer',
      robots: { index: false, follow: false },
    });
  });
});

describe('textes', () => {
  it.each([
    [
      'fr',
      fr,
      'Autoriser cet ordinateur à envoyer vos sessions de code à Leon, dans l’espace Acme ?',
    ],
    [
      'en',
      en,
      'Authorize this computer to send your coding sessions to Leon, in the Acme workspace?',
    ],
  ] as const)('la question se lit en %s, avec l’espace', (locale, messages, expected) => {
    const t = createTranslator({ locale, messages, namespace: 'computer.authorize' });

    expect(t('question', { space: 'Acme' })).toBe(expected);
  });

  it('l’anglais a les autres textes de la page', () => {
    expect(en.computer.authorize).toMatchObject({
      warning: 'If you didn’t just run the command yourself in a terminal, cancel.',
      allow: 'Authorize',
      cancel: 'Cancel',
    });
  });
});

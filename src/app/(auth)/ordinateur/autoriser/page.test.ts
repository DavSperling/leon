import { redirect } from 'next/navigation';
import { createTranslator } from 'next-intl';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LECTURE_LINES, RAPPEL_LINES } from '@/cli/install-hooks';
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
      'Si vous n’avez pas lancé la commande vous-même, ni demandé à Claude Code de la lancer, annulez.',
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

  it('n’est pas indexée et ne sort pas en référent : l’adresse porte l’etat et l’empreinte', async () => {
    expect(await generateMetadata()).toEqual({
      title: fr.computer.authorize.title,
      referrer: 'same-origin', // pas 'no-referrer' : un formulaire natif partirait avec « Origin: null », que Next refuse
      robots: { index: false, follow: false },
    });
  });
});

// Les cases que `leon setup` demande (T64, C16) : natives et cochées par défaut, pour partir avant l'hydratation ou sans
// JavaScript (une case qui ne part pas deviendrait un refus gardé).
describe('les cases de la page', () => {
  const ASKED = { ...PARAMS, usages: 'lecture' };
  const inputs = (node: ReactNode) => elements(node).filter((el) => el.type === 'input');
  const boxes = (node: ReactNode) => inputs(node).filter((el) => el.props.type === 'checkbox');

  it('montre la case demandée, native et cochée, avec son texte, avant « Autoriser »', async () => {
    const page = await render(ASKED);

    const [form] = elements(page).filter((el) => el.type === 'form');
    const shown = boxes(form);
    expect(shown.map((el) => [el.props.name, el.props.value, el.props.defaultChecked])).toEqual([
      ['usage', 'lecture', true],
    ]);
    expect(shown[0]?.props.checked).toBeUndefined(); // non contrôlée : rien n'attend React
    expect(
      inputs(form)
        .filter((el) => el.props.type === 'hidden')
        .map((el) => [el.props.name, el.props.value]),
    ).toEqual([
      ['port', 4242],
      ['etat', ETAT],
      ['empreinte', EMPREINTE],
      ['usages', 'lecture'],
    ]);
    const all = elements(form);
    expect(all.indexOf(shown[0] as never)).toBeLessThan(all.findIndex((el) => el.type === Button));
    const text = textOf(page);
    const { usages } = fr.computer.authorize;
    expect(text).toContain(nb(usages.title));
    expect(text).toContain(nb(usages.hint));
    expect(text).toContain(nb(usages.lecture.title));
    expect(text).toContain('Leon place dans le contexte de l’agent');
  });

  // T49 : la case `rappel`, cochée quand elle est demandée, après celle de `lecture`.
  it('montre aussi la case rappel, cochée, avec son texte', async () => {
    const page = await render({ ...PARAMS, usages: 'lecture,rappel' });

    expect(boxes(page).map((el) => [el.props.value, el.props.defaultChecked])).toEqual([
      ['lecture', true],
      ['rappel', true],
    ]);
    expect(textOf(page)).toContain(nb(fr.computer.authorize.usages.rappel.title));
  });

  it('la case est nommée par son titre et décrite par son texte', async () => {
    const page = await render(ASKED);

    const [box] = boxes(page);
    const label = elements(page).find((el) => el.type === 'label');
    expect(label?.props.htmlFor).toBe(box?.props.id);
    const described = elements(page).find((el) => el.props.id === box?.props['aria-describedby']);
    expect(described?.type).toBe('ul');
  });

  it.each([
    ['sans paramètre usages', PARAMS],
    ['avec une valeur que la page ne montre pas encore', { ...PARAMS, usages: 'noter' }],
    ['avec une valeur inconnue', { ...PARAMS, usages: 'tout' }],
  ])('%s : ni case ni champ caché', async (_name, params) => {
    const page = await render(params);

    expect(boxes(page)).toEqual([]);
    expect(inputs(page).map((el) => el.props.name)).toEqual(['port', 'etat', 'empreinte']);
    expect(textOf(page)).not.toContain(nb(fr.computer.authorize.usages.title));
  });

  it('sans session, renvoie vers /connexion avec les quatre paramètres', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await redirectsTo(
      { ...ASKED, usages: 'lecture,inconnu' },
      `/connexion?port=4242&etat=${ETAT}&empreinte=${EMPREINTE}&usages=lecture`,
    );
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

  // Contrat avec les installateurs : chaque case dit, en anglais, mot pour mot, ce que dit le terminal (LECTURE_LINES,
  // RAPPEL_LINES).
  it.each([
    ['lecture', LECTURE_LINES],
    ['rappel', RAPPEL_LINES],
  ] as const)(
    'le texte anglais de la case %s est celui des installateurs, mot pour mot',
    (usage, lines) => {
      const t = createTranslator({
        locale: 'en',
        messages: en,
        namespace: `computer.authorize.usages.${usage}`,
      });
      const code = (chunks: string) => `\`${chunks}\``;

      expect([
        t('title'),
        ...(['p1', 'p2', 'p3'] as const).map((key) => `  - ${t.markup(key, { code })}`),
      ]).toEqual(lines);
    },
  );

  it.each(['lecture', 'rappel'] as const)(
    '%s : le français a le même nombre de lignes et les mêmes commandes',
    (usage) => {
      const lines = (messages: typeof fr | typeof en) =>
        Object.values(messages.computer.authorize.usages[usage]).join('\n');

      expect(Object.keys(fr.computer.authorize.usages[usage])).toEqual(
        Object.keys(en.computer.authorize.usages[usage]),
      );
      expect(lines(fr).match(/<code>[^<]+<\/code>/g)).toEqual(
        lines(en).match(/<code>[^<]+<\/code>/g),
      );
    },
  );

  it('l’anglais a les autres textes de la page', () => {
    expect(en.computer.authorize).toMatchObject({
      warning: 'If you didn’t run the command yourself, or ask Claude Code to run it, cancel.',
      allow: 'Authorize',
      cancel: 'Cancel',
    });
  });
});

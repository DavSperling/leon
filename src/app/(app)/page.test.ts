import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Greeting, HomeAsk } from '@/components/verre/recherche/home';
import { ReplyDrafts } from '@/components/verre/recherche/reply-drafts';
import { logError } from '@/server/log';
import {
  type HomeBrouillon,
  type HomeDemande,
  type HomeRelance,
  type HomeSansReponse,
  readHomeBrouillons,
  readHomeSansReponse,
} from '@/server/portrait/screen';
import HomePage from './page';

// L'Accueil lit beaucoup de choses ; seule la ligne de l'agent « Brouillons de réponse » se teste ici : à sa place sous
// le bonjour, avec ce que l'Accueil a lu et le prénom du bonjour, et jamais au prix du reste. Les actions importent
// Better Auth : l'Accueil n'est jamais dessiné, seulement bâti. Ce que la ligne reçoit se décide dans readHomeBrouillons
// (screen.db.test.ts) ; qu'elle ne se montre pas sans rien qui attend, dans recherche/reply-drafts.test.ts.
vi.mock('@/app/(app)/actions', () => ({}));
vi.mock('@/app/(app)/discussions/actions', () => ({}));
vi.mock('@/app/(app)/settings/actions', () => ({}));
vi.mock('@/server/auth/session', () => ({
  requireUserContext: vi.fn(async () => ({ userId: 'u1', tenantId: 't1', principals: ['u1'] })),
}));
vi.mock('@/server/auth/onboarding', () => ({ readOnboardingMember: vi.fn(async () => null) }));
vi.mock('@/server/auth/viewer', () => ({
  getViewerProfile: vi.fn(async () => ({ userName: 'Julie Martin' })),
}));
vi.mock('@/server/briefing/about', () => ({ ABOUT_MAX_CHARS: 500 }));
vi.mock('@/server/briefing/about-suggestion', () => ({
  readAboutSuggestion: vi.fn(async () => null),
}));
vi.mock('@/server/briefing/briefings', () => ({ refreshShownBriefing: vi.fn() }));
vi.mock('@/server/briefing/queue', () => ({ enqueueAgendaRefresh: vi.fn() }));
vi.mock('@/server/discussion/citation-sources', () => ({ homeBriefings: vi.fn(async () => []) }));
vi.mock('@/server/agenda/agenda', () => ({
  agendaIsStale: vi.fn(() => false),
  readWeek: vi.fn(async () => null),
}));
vi.mock('@/components/discussion/ask-suggestions', () => ({ askSuggestions: vi.fn() }));
vi.mock('@/components/search/run-search', () => ({ runSearch: vi.fn() }));
vi.mock('@/server/env', () => ({ env: {} }));
vi.mock('@/server/llm/get-llm', () => ({ getLlm: vi.fn(() => null) }));
vi.mock('@/server/log', () => ({ logError: vi.fn() }));
vi.mock('@/server/portrait/screen', () => ({
  readHomeBrouillons: vi.fn(),
  readHomeSansReponse: vi.fn(async () => []),
}));

const DEMANDE: HomeDemande = {
  id: '00000001-1111-4111-8111-111111111111',
  from: 'Léa Roy',
  receivedAt: new Date('2026-11-10T09:00:00Z'),
  questions: ['Acceptez-vous le rendez-vous de mardi ?'],
  choix: [['Oui', 'Non, proposer jeudi']],
  repondue: false,
  relance: false,
  source: { title: 'Devis 2027', url: null, kind: 'gmail' },
};
const RELANCE: HomeRelance = {
  relance: true,
  from: 'Inès Garnier',
  others: 0,
  receivedAt: new Date('2026-11-11T09:00:00Z'),
  mail: { sourceId: '00000003-1111-4111-8111-111111111111', message: 'message:18c2f0a' },
  source: { title: 'Partenariat', url: null, kind: 'gmail' },
};
const PRET: HomeBrouillon = {
  id: '00000002-1111-4111-8111-111111111111',
  from: 'Léa Roy',
  receivedAt: new Date('2026-11-09T09:00:00Z'),
  texte: 'Bonjour Léa,\n\nC’est entendu.',
  depose: true,
  others: 0,
  relance: false,
  source: { title: 'Contrat', url: null, kind: 'gmail' },
};

// Les éléments de l'Accueil, dans l'ordre où il les rend (fragments compris), et ceux que la pile reçoit à placer :
// au-dessus d'elle (`lead`), puis à droite (`side`).
function flat(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(flat);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    node,
    ...flat(node.props.children as ReactNode),
    ...flat(node.props.lead as ReactNode),
    ...flat(node.props.side as ReactNode),
  ];
}
// `/` sans recherche : la page rend l'Accueil, un composant asynchrone, bâti ici à la main.
async function home() {
  const page = (await HomePage({ searchParams: Promise.resolve({}) })) as ReactElement<object>;
  const Home = page.type as (props: object) => Promise<ReactNode>;
  const elements = flat(await Home(page.props));
  return { elements, types: elements.map((element) => element.type) };
}

beforeEach(() => vi.mocked(logError).mockClear());

describe('l’Accueil : la ligne de l’agent « Brouillons de réponse »', () => {
  // Ce que la ligne reçoit de l'Accueil.
  const received = (elements: ReactElement<Record<string, unknown>>[]) => {
    const props = elements.find((element) => element.type === ReplyDrafts)?.props;
    return (
      props && { name: props.name, demandes: props.demandes, prets: props.prets, max: props.max }
    );
  };

  it('la pile porte l’Accueil : le bonjour puis le champ au-dessus d’elle, avec ce que l’Accueil a lu, son prénom, et la borne d’une réponse', async () => {
    vi.mocked(readHomeBrouillons).mockResolvedValue({ demandes: [DEMANDE], prets: [] });

    const { elements, types } = await home();

    expect(types.indexOf(ReplyDrafts)).toBeGreaterThanOrEqual(0);
    expect(types.indexOf(Greeting)).toBeGreaterThan(types.indexOf(ReplyDrafts));
    expect(types.indexOf(HomeAsk)).toBeGreaterThan(types.indexOf(Greeting));
    expect(received(elements)).toEqual({
      name: 'Julie',
      demandes: [DEMANDE],
      prets: [],
      max: 1000,
    });
    expect(readHomeBrouillons).toHaveBeenCalledWith({
      userId: 'u1',
      tenantId: 't1',
      principals: ['u1'],
    });
  });

  it('les demandes où Leon écrit, sa relance à décider et les brouillons prêts lui arrivent tous, tels que lus', async () => {
    const repondue = { ...DEMANDE, repondue: true };
    vi.mocked(readHomeBrouillons).mockResolvedValue({
      demandes: [RELANCE, repondue],
      prets: [PRET],
    });

    const { elements } = await home();

    expect(received(elements)).toEqual({
      name: 'Julie',
      demandes: [RELANCE, repondue],
      prets: [PRET],
      max: 1000,
    });
  });

  it('sans rien qui attend, elle reste montée, sans rien à montrer : son panneau ouvert ne disparaît pas avec le dernier mail', async () => {
    vi.mocked(readHomeBrouillons).mockResolvedValue({ demandes: [], prets: [] });

    const { elements, types } = await home();

    expect(received(elements)).toMatchObject({ demandes: [], prets: [] });
    expect(types).toContain(HomeAsk);
  });

  it('ses mails jugés sans réponse à donner lui arrivent à part, tels que lus ; leur lecture en panne n’emporte pas la pile', async () => {
    const merci: HomeSansReponse = {
      id: '00000901-1111-4111-8111-111111111111',
      from: 'Sophie Garnier',
      receivedAt: new Date('2026-11-21T09:00:00Z'),
      relance: false,
      source: { title: 'Merci pour la visite', url: null, kind: 'gmail' },
    };
    vi.mocked(readHomeBrouillons).mockResolvedValue({ demandes: [DEMANDE], prets: [] });
    vi.mocked(readHomeSansReponse).mockResolvedValueOnce([merci]);
    const sansReponse = (elements: ReactElement<Record<string, unknown>>[]) =>
      elements.find((element) => element.type === ReplyDrafts)?.props.sansReponse;

    expect(sansReponse((await home()).elements)).toEqual([merci]);
    expect(readHomeSansReponse).toHaveBeenCalledWith({
      userId: 'u1',
      tenantId: 't1',
      principals: ['u1'],
    });

    vi.mocked(readHomeSansReponse).mockRejectedValueOnce(new Error('base injoignable'));
    const { elements } = await home();
    expect(sansReponse(elements)).toEqual([]);
    expect(received(elements)).toMatchObject({ demandes: [DEMANDE] });
    expect(vi.mocked(logError).mock.calls.map((call) => call[0])).toEqual(['accueil.sans-reponse']);
  });

  it('la lecture échoue : l’Accueil tient, la ligne n’a rien à montrer, et la panne est notée', async () => {
    vi.mocked(readHomeBrouillons).mockRejectedValue(new Error('base injoignable'));

    const { elements, types } = await home();

    expect(received(elements)).toMatchObject({ demandes: [], prets: [] });
    expect(types).toContain(Greeting);
    expect(types).toContain(HomeAsk);
    expect(vi.mocked(logError).mock.calls.map((call) => call[0])).toEqual(['accueil.brouillons']);
  });
});

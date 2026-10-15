import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEW_CONFIG } from '@/lib/tasks/view-config';
import { viewContextOf } from '@/lib/tasks/view-context';
import { requireUserContext } from '@/server/auth/session';
import { getTeamDefaultConfig, getView, listViews } from '@/server/tasks/views';
import { seedTasksScenario } from '@/test/tasks-scenario';
import {
  createViewAction,
  deleteViewAction,
  setTeamDefaultAction,
  updateViewAction,
} from './view-actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const BOARD = { ...DEFAULT_VIEW_CONFIG, layout: 'board', groupBy: 'priority' } as const;
const NOT_FOUND = { ok: false, error: 'Vue introuvable.' };
const PROJECT_ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
// Une liste de projet, de Mes tâches et de recherche à la fois : tout ce qui est du contexte.
const SCOPED = {
  ...BOARD,
  filters: {
    ...BOARD.filters,
    projectId: PROJECT_ID,
    assignee: 'me',
    creator: 'me',
    q: 'x',
    priority: 'high',
  },
} as const;

const NO_CONTEXT = { projectId: null, assignee: null, creator: null, q: '' };

// Les actions des vues, de bout en bout : zod, puis la base sous les droits du lecteur. Paul crée.
async function setup() {
  const scenario = await seedTasksScenario();
  vi.mocked(requireUserContext).mockResolvedValue(scenario.paul);
  const create = async (name: string, team: boolean) => {
    const result = await createViewAction({ name, config: BOARD, team });
    if (!result.ok) throw new Error(result.error);
    return result.id;
  };
  return { ...scenario, create };
}

beforeEach(() => vi.clearAllMocks());

describe('seul l’auteur modifie ou supprime sa vue', () => {
  it('l’auteur renomme, enregistre les réglages et supprime sa vue d’équipe', async () => {
    const { paul, create } = await setup();
    const id = await create('Sprint', true);

    await expect(updateViewAction(id, { name: 'Sprint 12' })).resolves.toEqual({ ok: true });
    await expect(updateViewAction(id, { config: DEFAULT_VIEW_CONFIG })).resolves.toEqual({
      ok: true,
    });
    expect(await getView(paul, id)).toMatchObject({
      name: 'Sprint 12',
      config: DEFAULT_VIEW_CONFIG,
      team: true,
    });

    await expect(deleteViewAction(id)).resolves.toEqual({ ok: true });
    expect(await getView(paul, id)).toBeNull();
  });

  it('un collègue voit la vue d’équipe mais ne la modifie ni ne la supprime', async () => {
    const { paul, marie, create } = await setup();
    const id = await create('Sprint', true);
    vi.mocked(requireUserContext).mockResolvedValue(marie);

    expect(await getView(marie, id)).toMatchObject({ name: 'Sprint' });
    await expect(updateViewAction(id, { name: 'Piraté' })).resolves.toEqual(NOT_FOUND);
    await expect(updateViewAction(id, { config: DEFAULT_VIEW_CONFIG })).resolves.toEqual(NOT_FOUND);
    await expect(deleteViewAction(id)).resolves.toEqual(NOT_FOUND);

    expect(await getView(paul, id)).toMatchObject({ name: 'Sprint', config: BOARD });
  });

  it('une vue personnelle est introuvable pour un collègue, comme pour un autre cabinet', async () => {
    const { paul, marie, zoe, create } = await setup();
    const id = await create('Mes urgences', false);

    for (const other of [marie, zoe]) {
      vi.mocked(requireUserContext).mockResolvedValue(other);
      await expect(deleteViewAction(id)).resolves.toEqual(NOT_FOUND);
      await expect(updateViewAction(id, { name: 'Autre' })).resolves.toEqual(NOT_FOUND);
    }

    expect(await listViews(paul)).toHaveLength(1);
  });

  it('une vue d’équipe est introuvable pour un autre cabinet', async () => {
    const { paul, zoe, create } = await setup();
    const id = await create('Sprint', true);
    vi.mocked(requireUserContext).mockResolvedValue(zoe);

    await expect(deleteViewAction(id)).resolves.toEqual(NOT_FOUND);
    await expect(setTeamDefaultAction(id)).resolves.toEqual({
      ok: false,
      error: 'Vue d’équipe introuvable.',
    });

    expect(await getView(paul, id)).not.toBeNull();
  });
});

describe('le défaut de l’équipe', () => {
  it('une vue d’équipe créée par défaut remplace celui de Leon, puis le précédent', async () => {
    const { paul } = await setup();

    await createViewAction({ name: 'Premier', config: BOARD, team: true, makeDefault: true });
    expect(await getTeamDefaultConfig(paul)).toEqual(BOARD);

    const second = { ...DEFAULT_VIEW_CONFIG, groupBy: 'assignee' } as const;
    await expect(
      createViewAction({ name: 'Second', config: second, team: true, makeDefault: true }),
    ).resolves.toMatchObject({ ok: true });

    expect(await getTeamDefaultConfig(paul)).toEqual(second);
    expect((await listViews(paul)).filter((view) => view.isTeamDefault)).toHaveLength(1);
  });

  it('le défaut créé depuis une liste filtrée ne garde ni projet, ni Mes tâches, ni recherche', async () => {
    const { paul, marie } = await setup();

    await createViewAction({ name: 'Défaut', config: SCOPED, team: true, makeDefault: true });

    const base = await getTeamDefaultConfig(marie);
    expect(viewContextOf(base)).toBe('all');
    expect(base).toEqual({ ...SCOPED, filters: { ...SCOPED.filters, ...NO_CONTEXT } });
    const [view] = await listViews(paul);
    expect(view?.config.filters).toMatchObject(NO_CONTEXT);
  });

  it('une vue d’équipe qui a un contexte peut devenir le défaut : le contexte n’est pas imposé aux autres listes', async () => {
    const { paul, marie } = await setup();
    const result = await createViewAction({ name: 'Sprint', config: SCOPED, team: true });
    if (!result.ok) throw new Error(result.error);
    vi.mocked(requireUserContext).mockResolvedValue(marie);

    await expect(setTeamDefaultAction(result.id)).resolves.toEqual({ ok: true });

    expect(await getTeamDefaultConfig(marie)).toEqual({
      ...SCOPED,
      filters: { ...SCOPED.filters, ...NO_CONTEXT },
    });
    expect(viewContextOf((await getView(paul, result.id))?.config ?? BOARD)).toBe(
      `project:${PROJECT_ID}`,
    );
  });

  it('tout membre choisit une vue d’équipe, jamais une vue personnelle', async () => {
    const { marie, create } = await setup();
    const team = await create('Sprint', true);
    const personal = await create('Mes urgences', false);
    vi.mocked(requireUserContext).mockResolvedValue(marie);

    await expect(setTeamDefaultAction(team)).resolves.toEqual({ ok: true });
    expect(await getTeamDefaultConfig(marie)).toEqual(BOARD);
    await expect(setTeamDefaultAction(personal)).resolves.toEqual({
      ok: false,
      error: 'Vue d’équipe introuvable.',
    });
  });

  it('supprimer la vue qui est le défaut rend celui de Leon', async () => {
    const { paul } = await setup();
    const result = await createViewAction({
      name: 'Défaut',
      config: BOARD,
      team: true,
      makeDefault: true,
    });
    if (!result.ok) throw new Error(result.error);

    await deleteViewAction(result.id);

    expect(await getTeamDefaultConfig(paul)).toEqual(DEFAULT_VIEW_CONFIG);
  });

  it('refuse un défaut d’équipe sur une vue personnelle, sans la créer', async () => {
    const { paul } = await setup();

    await expect(
      createViewAction({ name: 'Vue', config: BOARD, team: false, makeDefault: true }),
    ).resolves.toEqual({ ok: false, error: 'Saisie invalide.' });

    expect(await listViews(paul)).toEqual([]);
  });
});

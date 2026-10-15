import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_CONFIG, type ViewConfig } from '@/lib/tasks/view-config';
import { seedTasksScenario } from '@/test/tasks-scenario';
import {
  createView,
  deleteView,
  getTeamDefaultConfig,
  getView,
  listViews,
  setTeamDefault,
  updateView,
} from './views';

const BOARD: ViewConfig = {
  ...DEFAULT_VIEW_CONFIG,
  layout: 'board',
  groupBy: 'priority',
  filters: { ...DEFAULT_VIEW_CONFIG.filters, assignee: 'me', statuses: [] },
};

describe('createView, listViews, getView', () => {
  it('une vue personnelle n’est visible que de son auteur', async () => {
    const { paul, marie } = await seedTasksScenario();

    const view = await createView(paul, { name: 'Mes urgences', config: BOARD, team: false });

    expect(view).toEqual({
      id: expect.any(String),
      name: 'Mes urgences',
      config: BOARD,
      ownerId: paul.userId,
      team: false,
      isTeamDefault: false,
    });
    expect(await listViews(paul)).toEqual([view]);
    expect(await getView(paul, view.id)).toEqual(view);
    expect(await listViews(marie)).toEqual([]);
    expect(await getView(marie, view.id)).toBeNull();
  });

  it('une vue d’équipe est visible de toute l’organisation, et d’elle seule', async () => {
    const { paul, marie, zoe } = await seedTasksScenario();

    const view = await createView(paul, { name: 'Sprint', config: BOARD, team: true });

    expect(view).toMatchObject({ team: true, ownerId: paul.userId });
    expect(await getView(marie, view.id)).toEqual(view);
    expect((await listViews(marie)).map((v) => v.id)).toEqual([view.id]);
    expect(await listViews(zoe)).toEqual([]);
    expect(await getView(zoe, view.id)).toBeNull();
  });

  it('range les vues dans l’ordre de création', async () => {
    const { paul } = await seedTasksScenario();

    const first = await createView(paul, { name: 'Une', config: BOARD, team: false });
    const second = await createView(paul, { name: 'Deux', config: BOARD, team: true });

    expect((await listViews(paul)).map((view) => view.id)).toEqual([first.id, second.id]);
  });
});

describe('updateView, deleteView : seul l’auteur', () => {
  it('l’auteur renomme sa vue et change ses réglages', async () => {
    const { paul } = await seedTasksScenario();
    const view = await createView(paul, { name: 'Avant', config: BOARD, team: true });

    await updateView(paul, view.id, { name: 'Après', config: DEFAULT_VIEW_CONFIG });

    expect(await getView(paul, view.id)).toMatchObject({
      name: 'Après',
      config: DEFAULT_VIEW_CONFIG,
    });
  });

  it('un patch partiel ne touche que ce qu’il nomme', async () => {
    const { paul } = await seedTasksScenario();
    const view = await createView(paul, { name: 'Nom', config: BOARD, team: false });

    await updateView(paul, view.id, { name: 'Autre nom' });

    expect(await getView(paul, view.id)).toMatchObject({ name: 'Autre nom', config: BOARD });
  });

  it('un autre membre ne modifie pas une vue d’équipe', async () => {
    const { paul, marie } = await seedTasksScenario();
    const view = await createView(paul, { name: 'À Paul', config: BOARD, team: true });

    await expect(updateView(marie, view.id, { name: 'Piratée' })).rejects.toMatchObject({
      code: 'not_found',
      message: 'Vue introuvable.',
    });
    expect(await getView(paul, view.id)).toMatchObject({ name: 'À Paul' });
  });

  it('un autre membre ne supprime pas une vue d’équipe, l’auteur oui', async () => {
    const { paul, marie } = await seedTasksScenario();
    const view = await createView(paul, { name: 'À Paul', config: BOARD, team: true });

    await expect(deleteView(marie, view.id)).rejects.toMatchObject({ code: 'not_found' });
    expect(await getView(marie, view.id)).not.toBeNull();

    await deleteView(paul, view.id);
    expect(await getView(marie, view.id)).toBeNull();
  });

  it('une autre organisation ne voit, ne modifie ni ne supprime rien', async () => {
    const { paul, zoe } = await seedTasksScenario();
    const view = await createView(paul, { name: 'À Paul', config: BOARD, team: true });

    await expect(updateView(zoe, view.id, { name: 'Piratée' })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(deleteView(zoe, view.id)).rejects.toMatchObject({ code: 'not_found' });
    expect(await getView(paul, view.id)).toMatchObject({ name: 'À Paul' });
  });
});

describe('setTeamDefault, getTeamDefaultConfig', () => {
  it('sans défaut d’équipe, c’est le défaut de Leon', async () => {
    const { paul } = await seedTasksScenario();

    expect(await getTeamDefaultConfig(paul)).toEqual(DEFAULT_VIEW_CONFIG);
  });

  it('change de défaut sans erreur d’unicité, et n’en laisse qu’un', async () => {
    const { paul, marie } = await seedTasksScenario();
    const first = await createView(paul, { name: 'Première', config: BOARD, team: true });
    const second = await createView(paul, {
      name: 'Seconde',
      config: DEFAULT_VIEW_CONFIG,
      team: true,
    });

    await setTeamDefault(paul, first.id);
    expect(await getTeamDefaultConfig(marie)).toEqual(BOARD);

    await setTeamDefault(marie, second.id);
    const defaults = (await listViews(paul)).filter((view) => view.isTeamDefault);
    expect(defaults.map((view) => view.id)).toEqual([second.id]);
    expect(await getTeamDefaultConfig(paul)).toEqual(DEFAULT_VIEW_CONFIG);
  });

  it('accepte de reposer le défaut actuel et de n’en laisser aucun', async () => {
    const { paul } = await seedTasksScenario();
    const view = await createView(paul, { name: 'Équipe', config: BOARD, team: true });

    await setTeamDefault(paul, view.id);
    await setTeamDefault(paul, view.id);
    expect(await getTeamDefaultConfig(paul)).toEqual(BOARD);

    await setTeamDefault(paul, null);
    expect((await listViews(paul)).some((v) => v.isTeamDefault)).toBe(false);
    expect(await getTeamDefaultConfig(paul)).toEqual(DEFAULT_VIEW_CONFIG);
  });

  it('refuse une vue personnelle ou invisible et garde l’ancien défaut', async () => {
    const { paul, marie, zoe } = await seedTasksScenario();
    const shared = await createView(paul, { name: 'Équipe', config: BOARD, team: true });
    const personal = await createView(paul, { name: 'Perso', config: BOARD, team: false });
    await setTeamDefault(paul, shared.id);

    await expect(setTeamDefault(paul, personal.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(setTeamDefault(marie, personal.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(setTeamDefault(zoe, shared.id)).rejects.toMatchObject({ code: 'not_found' });

    expect(await getTeamDefaultConfig(paul)).toEqual(BOARD);
  });

  it('tranche deux changements simultanés : un seul défaut, l’autre reçoit un conflit', async () => {
    const { paul, marie } = await seedTasksScenario();
    const first = await createView(paul, { name: 'Première', config: BOARD, team: true });
    const second = await createView(paul, { name: 'Seconde', config: BOARD, team: true });

    const results = await Promise.allSettled([
      setTeamDefault(paul, first.id),
      setTeamDefault(marie, second.id),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'conflict' });
    }
    expect((await listViews(paul)).filter((view) => view.isTeamDefault)).toHaveLength(1);
  });

  it('le défaut d’une organisation n’est pas celui d’une autre', async () => {
    const { paul, zoe } = await seedTasksScenario();
    const view = await createView(paul, { name: 'Équipe', config: BOARD, team: true });
    await setTeamDefault(paul, view.id);

    expect(await getTeamDefaultConfig(zoe)).toEqual(DEFAULT_VIEW_CONFIG);
  });
});

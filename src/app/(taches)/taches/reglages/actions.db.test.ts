import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEW_CONFIG } from '@/lib/tasks/view-config';
import { requireUserContext } from '@/server/auth/session';
import { listLabels } from '@/server/tasks/labels';
import { listProjects } from '@/server/tasks/projects';
import { listStatuses } from '@/server/tasks/statuses';
import { listTasks } from '@/server/tasks/task-list';
import { createTask, getTaskByRef } from '@/server/tasks/tasks';
import { getView } from '@/server/tasks/views';
import { readTask, seedTasksScenario } from '@/test/tasks-scenario';
import { createLabelAction } from '../actions';
import { createViewAction } from '../view-actions';
import {
  createProjectAction,
  createStatusAction,
  deleteLabelAction,
  deleteStatusAction,
  moveStatusAction,
  updateLabelAction,
  updateProjectAction,
  updateStatusAction,
} from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const LAST_OF_CATEGORY = { ok: false, error: 'Chaque catégorie garde au moins un statut.' };
const ALL_TASKS = {
  ...DEFAULT_VIEW_CONFIG,
  filters: { ...DEFAULT_VIEW_CONFIG.filters, statuses: [] },
};

// Les réglages, de bout en bout : zod, puis la base sous les droits du lecteur. Paul règle.
async function setup() {
  const scenario = await seedTasksScenario();
  const { paul, projectId } = scenario;
  vi.mocked(requireUserContext).mockResolvedValue(paul);
  const make = async (title: string, statusId?: string) =>
    (await createTask(paul, { title, projectId, statusId }, { kind: 'user', userId: paul.userId }))
      .id;
  const statusLabels = async () =>
    (await listStatuses(paul, projectId)).map((status) => status.label);
  return { ...scenario, make, statusLabels };
}

beforeEach(() => vi.clearAllMocks());

describe('projets', () => {
  it('changer la clé d’un projet change les identifiants affichés, pas les numéros', async () => {
    const { paul, projectId, make } = await setup();
    await make('Première');

    await expect(updateProjectAction(projectId, { key: 'new' })).resolves.toEqual({ ok: true });
    await make('Seconde');

    const { rows } = await listTasks(paul, ALL_TASKS, new Date());
    expect(rows.map((row) => row.ref).sort()).toEqual(['NEW-1', 'NEW-2']);
    expect(await getTaskByRef(paul, 'NEW-1')).toMatchObject({ ref: 'NEW-1', title: 'Première' });
    expect(await getTaskByRef(paul, 'ATE-1')).toBeNull();
  });

  it('renomme le projet sans toucher à sa clé', async () => {
    const { paul, projectId } = await setup();

    await updateProjectAction(projectId, { name: 'Atelier Sud' });

    expect(await listProjects(paul)).toEqual([{ id: projectId, key: 'ATE', name: 'Atelier Sud' }]);
  });

  it('crée un projet avec ses statuts ; refuse une clé déjà prise', async () => {
    const { paul, projectId } = await setup();

    await expect(createProjectAction({ name: 'Opérations', key: 'ops' })).resolves.toEqual({
      ok: true,
    });
    await expect(createProjectAction({ name: 'Rénov’Ouest' })).resolves.toEqual({ ok: true });

    const projects = await listProjects(paul);
    expect(projects.map((project) => project.key)).toEqual(['ATE', 'OPS', 'REN']);
    const ops = projects.find((project) => project.key === 'OPS');
    expect(await listStatuses(paul, ops?.id)).toHaveLength(7);
    const taken = { ok: false, error: 'Un projet porte déjà cette clé.' };
    await expect(createProjectAction({ name: 'Autre', key: 'OPS' })).resolves.toEqual(taken);
    await expect(updateProjectAction(projectId, { key: 'OPS' })).resolves.toEqual(taken);
  });

  it('un autre cabinet ne règle pas le projet', async () => {
    const { paul, zoe, projectId } = await setup();
    vi.mocked(requireUserContext).mockResolvedValue(zoe);

    await expect(updateProjectAction(projectId, { key: 'ZZZ' })).resolves.toEqual({
      ok: false,
      error: 'Projet introuvable.',
    });

    expect((await listProjects(paul))[0]?.key).toBe('ATE');
  });
});

describe('statuts', () => {
  it('le dernier statut d’une catégorie est protégé : ni suppression ni changement de catégorie', async () => {
    const { status, statusLabels } = await setup();

    await expect(deleteStatusAction(status.Backlog, status['À faire'])).resolves.toEqual(
      LAST_OF_CATEGORY,
    );
    await expect(updateStatusAction(status.Terminé, { category: 'todo' })).resolves.toEqual(
      LAST_OF_CATEGORY,
    );

    expect(await statusLabels()).toContain('Backlog');
    expect(await statusLabels()).toContain('Terminé');
  });

  it('une catégorie qui a un second statut laisse partir le premier', async () => {
    const { paul, status, statusLabels } = await setup();

    await expect(updateStatusAction(status['En revue'], { category: 'todo' })).resolves.toEqual({
      ok: true,
    });

    const revue = (await listStatuses(paul)).find((s) => s.id === status['En revue']);
    expect(revue?.category).toBe('todo');
    expect(await statusLabels()).toHaveLength(7);
  });

  it('supprimer un statut déplace ses tâches vers le statut de repli', async () => {
    const { status, make, statusLabels } = await setup();
    const id = await make('En attente de relecture', status['En revue']);

    await expect(deleteStatusAction(status['En revue'], status['En cours'])).resolves.toEqual({
      ok: true,
    });

    expect((await readTask(id)).statusId).toBe(status['En cours']);
    expect(await statusLabels()).not.toContain('En revue');
  });

  it('refuse un statut de repli d’un autre projet ou le statut lui-même', async () => {
    const { paul, status } = await setup();
    await createProjectAction({ name: 'Opérations', key: 'OPS' });
    const ops = (await listProjects(paul)).find((project) => project.key === 'OPS');
    const opsStatus = (await listStatuses(paul, ops?.id))[0];
    if (!ops || !opsStatus) throw new Error('projet Opérations non créé');

    const invalid = { ok: false, error: 'Choisissez un autre statut du même projet.' };
    await expect(deleteStatusAction(status['En revue'], opsStatus.id)).resolves.toEqual(invalid);
    await expect(deleteStatusAction(status['En revue'], status['En revue'])).resolves.toEqual(
      invalid,
    );
  });

  it('crée, renomme, recolore et range un statut dans sa catégorie', async () => {
    const { paul, projectId, status, statusLabels } = await setup();

    await createStatusAction({
      projectId,
      label: 'En test',
      color: '#0891b2',
      category: 'started',
    });
    await updateStatusAction(status['En revue'], { label: 'Relecture', color: '#16a34a' });
    await moveStatusAction(status['En revue'], 'up');

    expect(await statusLabels()).toEqual([
      'Backlog',
      'À faire',
      'Relecture',
      'En cours',
      'En test',
      'Terminé',
      'Annulé',
      'Doublon',
    ]);
    const relecture = (await listStatuses(paul, projectId)).find((s) => s.label === 'Relecture');
    expect(relecture?.color).toBe('#16a34a');
  });

  it('un autre cabinet ne règle pas les statuts', async () => {
    const { zoe, status, statusLabels } = await setup();
    const before = await statusLabels();
    vi.mocked(requireUserContext).mockResolvedValue(zoe);

    const missing = { ok: false, error: 'Statut introuvable.' };
    await expect(updateStatusAction(status['En cours'], { label: 'Piraté' })).resolves.toEqual(
      missing,
    );
    await expect(moveStatusAction(status['En cours'], 'down')).resolves.toEqual(missing);
    await expect(deleteStatusAction(status['En cours'], status['À faire'])).resolves.toEqual(
      missing,
    );

    expect(await statusLabels()).toEqual(before);
  });
});

describe('étiquettes', () => {
  it('renomme, recolore et supprime une étiquette, qui quitte les tâches', async () => {
    const { paul, label, projectId } = await setup();
    const task = await createTask(
      paul,
      { title: 'Étiquetée', projectId, labelIds: [label.Bug] },
      { kind: 'user', userId: paul.userId },
    );

    await expect(
      updateLabelAction(label.Bug, { name: 'Défaut', color: '#db2777' }),
    ).resolves.toEqual({ ok: true });
    expect((await getTaskByRef(paul, task.ref))?.labels).toEqual([
      { id: label.Bug, name: 'Défaut', color: '#db2777' },
    ]);

    await expect(deleteLabelAction(label.Bug)).resolves.toEqual({ ok: true });
    expect((await getTaskByRef(paul, task.ref))?.labels).toEqual([]);
    expect((await listLabels(paul)).map((l) => l.name)).not.toContain('Défaut');
  });

  it('supprimer une étiquette laisse la vue qui la filtre : le filtre reste, sans résultat', async () => {
    const { paul, label, projectId } = await setup();
    await createTask(
      paul,
      { title: 'Étiquetée', projectId, labelIds: [label.Bug] },
      { kind: 'user', userId: paul.userId },
    );
    const config = { ...ALL_TASKS, filters: { ...ALL_TASKS.filters, labelId: label.Bug } };
    const created = await createViewAction({ name: 'Bugs', config, team: false });
    if (!created.ok) throw new Error(created.error);
    expect((await listTasks(paul, config, new Date())).rows).toHaveLength(1);

    await deleteLabelAction(label.Bug);

    const view = await getView(paul, created.id);
    expect(view?.config.filters.labelId).toBe(label.Bug);
    expect((await listTasks(paul, view?.config ?? config, new Date())).rows).toEqual([]);
  });

  it('crée une étiquette (action des sélecteurs) ; refuse un nom déjà pris, sans tenir compte de la casse', async () => {
    const { paul, label } = await setup();

    await expect(createLabelAction({ name: 'Dette', color: '#ca8a04' })).resolves.toMatchObject({
      ok: true,
    });

    const taken = { ok: false, error: 'Une étiquette porte déjà ce nom.' };
    await expect(createLabelAction({ name: 'dette', color: '#ca8a04' })).resolves.toEqual(taken);
    await expect(updateLabelAction(label.Bug, { name: 'DETTE' })).resolves.toEqual(taken);
    expect((await listLabels(paul)).map((l) => l.name)).toContain('Bug');
  });

  it('un autre cabinet ne règle pas les étiquettes', async () => {
    const { paul, zoe, label } = await setup();
    vi.mocked(requireUserContext).mockResolvedValue(zoe);

    const missing = { ok: false, error: 'Étiquette introuvable.' };
    await expect(deleteLabelAction(label.Bug)).resolves.toEqual(missing);
    await expect(updateLabelAction(label.Bug, { name: 'Piraté' })).resolves.toEqual(missing);

    expect((await listLabels(paul)).map((l) => l.name)).toContain('Bug');
  });
});

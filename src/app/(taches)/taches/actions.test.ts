import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { TaskError } from '@/server/tasks/errors';
import { createLabel } from '@/server/tasks/labels';
import { listTasks } from '@/server/tasks/task-list';
import {
  bulkUpdateTasks,
  createTask,
  deleteTasks,
  moveTask,
  updateTask,
} from '@/server/tasks/tasks';
import {
  bulkUpdateTasksAction,
  createLabelAction,
  createTaskAction,
  deleteTasksAction,
  moveTaskAction,
  searchTasksAction,
  updateTaskAction,
} from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/tasks/tasks', () => ({
  bulkUpdateTasks: vi.fn(),
  createTask: vi.fn(),
  deleteTasks: vi.fn(),
  moveTask: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock('@/server/tasks/labels', () => ({ createLabel: vi.fn() }));
vi.mock('@/server/tasks/task-list', () => ({ listTasks: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const ID = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d';
const OTHER_ID = '5b0a8a0e-6b9e-4a54-9d2b-3f6f1c7d8e90';
const SECRET = 'Titre confidentiel du client';
const ACTOR = { kind: 'user', userId: 'user' };
const INVALID = { ok: false, error: 'Saisie invalide.' };

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
});

afterEach(() => {
  const logged = JSON.stringify(consoleError.mock.calls);
  expect(logged).not.toContain(SECRET);
});

// Ce que Postgres renvoie : le message cite la valeur refusée, donc le texte saisi.
function postgresError(): Error {
  return Object.assign(new Error(`valeur trop longue : « ${SECRET} »`), {
    code: '22001',
    severity: 'ERROR',
  });
}

describe('createTaskAction', () => {
  it('crée la tâche sous les droits du lecteur, en son nom, puis rafraîchit les tâches', async () => {
    vi.mocked(createTask).mockResolvedValue({ id: ID, ref: 'LEO-12' });

    await expect(
      createTaskAction({ title: `  ${SECRET}  `, projectId: ID, priority: 'high', labelIds: [ID] }),
    ).resolves.toEqual({ ok: true, ref: 'LEO-12' });

    expect(createTask).toHaveBeenCalledWith(
      ctx,
      { title: SECRET, projectId: ID, priority: 'high', labelIds: [ID] },
      ACTOR,
    );
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it('accepte une description, un assigné et un parent vides ou nuls et une échéance', async () => {
    vi.mocked(createTask).mockResolvedValue({ id: ID, ref: 'LEO-13' });

    await createTaskAction({
      title: 'Titre',
      descriptionMd: '',
      assigneeId: null,
      parentId: null,
      dueDate: '2026-10-20',
    });

    expect(createTask).toHaveBeenCalledOnce();
  });

  it.each([
    { title: '' },
    { title: '   ' },
    { title: 'a'.repeat(201) },
    { title: 'Titre', projectId: 'pas-un-uuid' },
    { title: 'Titre', priority: 'critique' },
    { title: 'Titre', dueDate: '2026-02-30' },
    { title: 'Titre', dueDate: '20/10/2026' },
    { title: 'Titre', labelIds: Array.from({ length: 201 }, () => ID) },
    { title: 'Titre', descriptionMd: 'a'.repeat(100_001) },
    { title: 'Titre', acl: [ID] },
    { title: 'Titre', origin: 'mcp' },
  ])('refuse %j sans rien écrire', async (input) => {
    await expect(createTaskAction(input as never)).resolves.toEqual(INVALID);

    expect(createTask).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ne cite pas le titre saisi quand l'entrée est refusée", async () => {
    const result = await createTaskAction({ title: SECRET, projectId: 'pas-un-uuid' });

    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("rend tel quel le message d'une TaskError", async () => {
    vi.mocked(createTask).mockRejectedValue(new TaskError('not_found', 'Statut introuvable.'));

    await expect(createTaskAction({ title: 'Titre' })).resolves.toEqual({
      ok: false,
      error: 'Statut introuvable.',
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('journalise une erreur interne sans son texte et ne montre rien au lecteur', async () => {
    vi.mocked(createTask).mockRejectedValue(postgresError());

    const result = await createTaskAction({ title: SECRET });

    expect(result).toEqual({ ok: false, error: 'Erreur interne de Leon.' });
    expect(consoleError).toHaveBeenCalledOnce();
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.create_task');
    expect(consoleError.mock.calls[0]?.[2]).toContain('code=22001');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('ne crée rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(createTaskAction({ title: 'Titre' })).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(createTask).not.toHaveBeenCalled();
  });
});

describe('updateTaskAction', () => {
  it('applique le patch en nom de lecteur, puis rafraîchit', async () => {
    vi.mocked(updateTask).mockResolvedValue(undefined);
    const patch = {
      statusId: OTHER_ID,
      priority: 'urgent' as const,
      assigneeId: null,
      dueDate: null,
      addLabelIds: [ID],
      removeLabelIds: [OTHER_ID],
    };

    await expect(updateTaskAction(ID, patch)).resolves.toEqual({ ok: true });

    expect(updateTask).toHaveBeenCalledWith(ctx, ID, patch, ACTOR);
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it.each([
    ['un identifiant qui n’est pas un UUID', 'pas-un-uuid', { priority: 'low' }],
    ['une priorité inconnue', ID, { priority: 'critique' }],
    ['un champ interdit (acl)', ID, { acl: [ID] }],
    ['un champ interdit (tenantId)', ID, { tenantId: ID }],
    ['une échéance impossible', ID, { dueDate: '2026-13-01' }],
    ['un titre vide', ID, { title: ' ' }],
    ['trop d’étiquettes', ID, { addLabelIds: Array.from({ length: 201 }, () => ID) }],
  ])('refuse %s sans rien écrire', async (_name, id, patch) => {
    await expect(updateTaskAction(id, patch as never)).resolves.toEqual(INVALID);

    expect(updateTask).not.toHaveBeenCalled();
  });

  it("rend le message d'une TaskError (assigné non membre, tâche disparue)", async () => {
    vi.mocked(updateTask).mockRejectedValue(new TaskError('not_found', 'Membre introuvable.'));

    await expect(updateTaskAction(ID, { assigneeId: OTHER_ID })).resolves.toEqual({
      ok: false,
      error: 'Membre introuvable.',
    });
  });

  it('journalise une erreur interne sans le texte saisi', async () => {
    vi.mocked(updateTask).mockRejectedValue(postgresError());

    await expect(updateTaskAction(ID, { title: SECRET })).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.update_task');
  });
});

describe('bulkUpdateTasksAction', () => {
  it('applique le patch à la sélection, en nom de lecteur, rend le nombre de tâches, puis rafraîchit', async () => {
    vi.mocked(bulkUpdateTasks).mockResolvedValue(2);
    const patch = {
      statusId: OTHER_ID,
      priority: 'urgent' as const,
      assigneeId: null,
      dueDate: '2026-10-20',
      addLabelIds: [ID],
      removeLabelIds: [OTHER_ID],
    };

    await expect(bulkUpdateTasksAction([ID, OTHER_ID], patch)).resolves.toEqual({
      ok: true,
      count: 2,
    });

    expect(bulkUpdateTasks).toHaveBeenCalledWith(ctx, [ID, OTHER_ID], patch, ACTOR);
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it('accepte 200 tâches et refuse la 201e sans rien écrire', async () => {
    vi.mocked(bulkUpdateTasks).mockResolvedValue(200);
    const ids = (count: number) =>
      Array.from({ length: count }, (_, n) => `${n}`.padStart(8, '0') + ID.slice(8));

    await expect(bulkUpdateTasksAction(ids(200), { priority: 'low' })).resolves.toMatchObject({
      ok: true,
    });
    vi.mocked(bulkUpdateTasks).mockClear();
    await expect(bulkUpdateTasksAction(ids(201), { priority: 'low' })).resolves.toEqual(INVALID);

    expect(bulkUpdateTasks).not.toHaveBeenCalled();
  });

  it.each([
    ['aucune tâche', [], { priority: 'low' }],
    ['un identifiant qui n’est pas un UUID', ['pas-un-uuid'], { priority: 'low' }],
    ['une priorité inconnue', [ID], { priority: 'critique' }],
    ['un projet (hors des actions groupées)', [ID], { projectId: OTHER_ID }],
    ['un titre (hors des actions groupées)', [ID], { title: 'Titre' }],
    ['un champ interdit (acl)', [ID], { acl: [ID] }],
    ['une échéance impossible', [ID], { dueDate: '2026-13-01' }],
    ['trop d’étiquettes', [ID], { addLabelIds: Array.from({ length: 201 }, () => ID) }],
  ])('refuse %s sans rien écrire', async (_name, ids, patch) => {
    await expect(bulkUpdateTasksAction(ids, patch as never)).resolves.toEqual(INVALID);

    expect(bulkUpdateTasks).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rend le message d'une TaskError (assigné non membre) et ne rafraîchit rien", async () => {
    vi.mocked(bulkUpdateTasks).mockRejectedValue(new TaskError('not_found', 'Membre introuvable.'));

    await expect(bulkUpdateTasksAction([ID], { assigneeId: OTHER_ID })).resolves.toEqual({
      ok: false,
      error: 'Membre introuvable.',
    });
    expect(consoleError).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('journalise une erreur interne sans le texte saisi et ne montre rien au lecteur', async () => {
    vi.mocked(bulkUpdateTasks).mockRejectedValue(postgresError());

    await expect(bulkUpdateTasksAction([ID], { priority: 'low' })).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.bulk_update_tasks');
  });

  it('ne modifie rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(bulkUpdateTasksAction([ID], { priority: 'low' })).rejects.toThrow(
      'NEXT_REDIRECT /connexion',
    );

    expect(bulkUpdateTasks).not.toHaveBeenCalled();
  });
});

describe('deleteTasksAction', () => {
  it('supprime la sélection sous les droits du lecteur, rend le nombre, puis rafraîchit', async () => {
    vi.mocked(deleteTasks).mockResolvedValue(2);

    await expect(deleteTasksAction([ID, OTHER_ID])).resolves.toEqual({ ok: true, count: 2 });

    expect(deleteTasks).toHaveBeenCalledWith(ctx, [ID, OTHER_ID]);
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it.each([
    ['aucune tâche', []],
    ['un identifiant qui n’est pas un UUID', ['pas-un-uuid']],
    ['201 tâches', Array.from({ length: 201 }, () => ID)],
  ])('refuse %s sans rien supprimer', async (_name, ids) => {
    await expect(deleteTasksAction(ids)).resolves.toEqual(INVALID);

    expect(deleteTasks).not.toHaveBeenCalled();
  });

  it('journalise une erreur interne sans son texte', async () => {
    vi.mocked(deleteTasks).mockRejectedValue(postgresError());

    await expect(deleteTasksAction([ID])).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.delete_tasks');
  });

  it('ne supprime rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(deleteTasksAction([ID])).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(deleteTasks).not.toHaveBeenCalled();
  });
});

describe('moveTaskAction', () => {
  const NEIGHBORS = { beforeId: ID, afterId: null };

  it.each([
    ['le statut', { field: 'status', value: OTHER_ID, ...NEIGHBORS }],
    ['la priorité', { field: 'priority', value: 'urgent', ...NEIGHBORS }],
    ['l’assigné', { field: 'assignee', value: OTHER_ID, ...NEIGHBORS }],
    ['la tâche sans assigné', { field: 'assignee', value: null, ...NEIGHBORS }],
    ['seulement la place dans la colonne', { beforeId: null, afterId: null }],
  ] as const)(
    'range la tâche en changeant %s, en nom de lecteur, puis rafraîchit',
    async (_name, move) => {
      vi.mocked(moveTask).mockResolvedValue(undefined);

      await expect(moveTaskAction(ID, move)).resolves.toEqual({ ok: true });

      expect(moveTask).toHaveBeenCalledWith(ctx, ID, move, ACTOR);
      expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
    },
  );

  it.each([
    ['un identifiant qui n’est pas un UUID', 'pas-un-uuid', NEIGHBORS],
    ['une voisine qui n’est pas un UUID', ID, { beforeId: 'pas-un-uuid', afterId: null }],
    ['des voisines absentes', ID, {}],
    ['une seule voisine', ID, { beforeId: ID }],
    ['un champ inconnu', ID, { field: 'project', value: OTHER_ID, ...NEIGHBORS }],
    ['une priorité inconnue', ID, { field: 'priority', value: 'critique', ...NEIGHBORS }],
    ['un statut qui n’est pas un UUID', ID, { field: 'status', value: 'En cours', ...NEIGHBORS }],
    ['un statut nul', ID, { field: 'status', value: null, ...NEIGHBORS }],
    ['un champ sans valeur', ID, { field: 'assignee', ...NEIGHBORS }],
    ['une valeur sans champ', ID, { value: OTHER_ID, ...NEIGHBORS }],
    ['un champ interdit (acl)', ID, { acl: [ID], ...NEIGHBORS }],
  ])('refuse %s sans rien écrire', async (_name, id, move) => {
    await expect(moveTaskAction(id, move as never)).resolves.toEqual(INVALID);

    expect(moveTask).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rend le message d'une TaskError (assigné non membre, voisine disparue)", async () => {
    vi.mocked(moveTask).mockRejectedValue(new TaskError('not_found', 'Tâche introuvable.'));

    await expect(moveTaskAction(ID, { beforeId: OTHER_ID, afterId: null })).resolves.toEqual({
      ok: false,
      error: 'Tâche introuvable.',
    });
    expect(consoleError).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('journalise une erreur interne sans son texte et ne montre rien au lecteur', async () => {
    vi.mocked(moveTask).mockRejectedValue(postgresError());

    await expect(moveTaskAction(ID, NEIGHBORS)).resolves.toEqual({
      ok: false,
      error: 'Erreur interne de Leon.',
    });
    expect(String(consoleError.mock.calls[0]?.[1])).toBe('tasks.move_task');
    expect(consoleError.mock.calls[0]?.[2]).toContain('code=22001');
  });

  it('ne déplace rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(moveTaskAction(ID, NEIGHBORS)).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(moveTask).not.toHaveBeenCalled();
  });
});

describe('createLabelAction', () => {
  it("crée l'étiquette et la rend", async () => {
    const label = { id: ID, name: 'Urgent client', color: '#dc2626' };
    vi.mocked(createLabel).mockResolvedValue(label);

    await expect(createLabelAction({ name: ' Urgent client ', color: '#dc2626' })).resolves.toEqual(
      { ok: true, label },
    );

    expect(createLabel).toHaveBeenCalledWith(ctx, { name: 'Urgent client', color: '#dc2626' });
    expect(revalidatePath).toHaveBeenCalledWith('/taches', 'layout');
  });

  it.each([
    { name: '', color: '#dc2626' },
    { name: 'a'.repeat(41), color: '#dc2626' },
    { name: 'Bug', color: 'rouge' },
    { name: 'Bug', color: '#DC2626' },
    { name: 'Bug', color: '#dc2626', acl: [] },
  ])('refuse %j', async (input) => {
    await expect(createLabelAction(input)).resolves.toEqual(INVALID);

    expect(createLabel).not.toHaveBeenCalled();
  });

  it('rend le conflit de nom sans citer le nom', async () => {
    vi.mocked(createLabel).mockRejectedValue(
      new TaskError('conflict', 'Une étiquette porte déjà ce nom.'),
    );

    await expect(
      createLabelAction({ name: SECRET.slice(0, 40), color: '#dc2626' }),
    ).resolves.toEqual({ ok: false, error: 'Une étiquette porte déjà ce nom.' });
  });
});

describe('searchTasksAction', () => {
  const row = (n: number) => ({
    id: `id-${n}`,
    ref: `LEO-${n}`,
    title: `Tâche ${n}`,
    projectId: ID,
    priority: 'low',
    statusLabel: 'À faire',
  });

  it('cherche dans toutes les tâches, sous-tâches comprises, et en rend douze au plus', async () => {
    vi.mocked(listTasks).mockResolvedValue({
      rows: Array.from({ length: 20 }, (_, n) => row(n + 1)) as never,
      hiddenCount: 0,
    });

    const result = await searchTasksAction('  tâche ');

    expect(result.ok && result.tasks).toHaveLength(12);
    expect(result.ok && result.tasks[0]).toEqual({
      id: 'id-1',
      ref: 'LEO-1',
      title: 'Tâche 1',
      projectId: ID,
      priority: 'low',
    });
    const [, config] = vi.mocked(listTasks).mock.calls[0] ?? [];
    expect(config?.filters).toMatchObject({ q: 'tâche', statuses: [] });
    expect(config?.showSubtasks).toBe(true);
  });

  it('ne rafraîchit pas les pages : lire une recherche ne change rien', async () => {
    vi.mocked(listTasks).mockResolvedValue({ rows: [], hiddenCount: 0 });

    await expect(searchTasksAction('leo')).resolves.toEqual({ ok: true, tasks: [] });

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(['', ' ', 'a', 'x'.repeat(101)])('refuse la recherche %j', async (query) => {
    await expect(searchTasksAction(query)).resolves.toEqual(INVALID);

    expect(listTasks).not.toHaveBeenCalled();
  });
});

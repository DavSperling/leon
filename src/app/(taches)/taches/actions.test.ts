import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { TaskError } from '@/server/tasks/errors';
import { createLabel } from '@/server/tasks/labels';
import { listTasks } from '@/server/tasks/task-list';
import { createTask, updateTask } from '@/server/tasks/tasks';
import {
  createLabelAction,
  createTaskAction,
  searchTasksAction,
  updateTaskAction,
} from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('@/server/tasks/tasks', () => ({ createTask: vi.fn(), updateTask: vi.fn() }));
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

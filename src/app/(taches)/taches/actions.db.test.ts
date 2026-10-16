import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { createTask } from '@/server/tasks/tasks';
import { readTask, seedTasksScenario } from '@/test/tasks-scenario';
import { bulkUpdateTasksAction, deleteTasksAction } from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Les actions groupées, de bout en bout : zod, puis la base sous les droits du lecteur.
async function setup() {
  const scenario = await seedTasksScenario();
  const { paul, projectId } = scenario;
  const actor = { kind: 'user', userId: paul.userId } as const;
  const make = async (title: string) => (await createTask(paul, { title, projectId }, actor)).id;
  vi.mocked(requireUserContext).mockResolvedValue(paul);
  return { ...scenario, make };
}

beforeEach(() => vi.clearAllMocks());

describe('bulkUpdateTasksAction', () => {
  it('change toute la sélection sous les droits du lecteur', async () => {
    const { marie, status, make } = await setup();
    const ids = [await make('Une'), await make('Deux')];

    const result = await bulkUpdateTasksAction(ids, {
      priority: 'high',
      assigneeId: marie.userId,
      statusId: status['En cours'],
    });

    expect(result).toEqual({ ok: true, count: 2 });
    for (const id of ids) {
      expect(await readTask(id)).toMatchObject({
        priority: 'high',
        assigneeId: marie.userId,
        statusId: status['En cours'],
      });
    }
  });

  it('refuse un assigné qui n’est pas membre de l’organisation, sans rien changer', async () => {
    const { zoe, make } = await setup();
    const id = await make('Une');

    const result = await bulkUpdateTasksAction([id], { assigneeId: zoe.userId });

    expect(result).toEqual({ ok: false, error: 'Membre introuvable.' });
    expect((await readTask(id)).assigneeId).toBeNull();
  });

  it('refuse plus de 200 tâches', async () => {
    await setup();
    const ids = Array.from(
      { length: 201 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );

    await expect(bulkUpdateTasksAction(ids, { priority: 'low' })).resolves.toEqual({
      ok: false,
      error: 'Saisie invalide.',
    });
  });

  it('ne touche pas aux tâches d’une autre organisation', async () => {
    const { zoe, make } = await setup();
    const id = await make('Protégée');
    vi.mocked(requireUserContext).mockResolvedValue(zoe);

    const result = await bulkUpdateTasksAction([id], { priority: 'urgent' });

    expect(result).toEqual({ ok: false, error: 'Tâche introuvable.' });
    expect((await readTask(id)).priority).toBe('none');
  });
});

describe('deleteTasksAction', () => {
  it('supprime la sélection et rend le nombre de tâches', async () => {
    const { make } = await setup();
    const ids = [await make('Une'), await make('Deux')];

    await expect(deleteTasksAction(ids)).resolves.toEqual({ ok: true, count: 2 });

    await expect(readTask(ids[0] as string)).rejects.toThrow('tâche absente');
  });

  it('ne supprime rien d’une autre organisation', async () => {
    const { zoe, make } = await setup();
    const id = await make('Protégée');
    vi.mocked(requireUserContext).mockResolvedValue(zoe);

    await expect(deleteTasksAction([id])).resolves.toEqual({ ok: true, count: 0 });

    expect(await readTask(id)).toMatchObject({ title: 'Protégée' });
  });
});

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { tasks } from '@/server/db/schema/tasks';
import { adminDb } from '@/test/db';
import { ageTask, seedTasksScenario } from '@/test/tasks-scenario';
import { createProject } from './projects';
import { createStatus, deleteStatus, listStatuses, moveStatus, updateStatus } from './statuses';
import { createTask } from './tasks';

async function taskState(id: string) {
  const [row] = await adminDb
    .select({
      statusId: tasks.statusId,
      statusChangedAt: tasks.statusChangedAt,
      completedAt: tasks.completedAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(eq(tasks.id, id));
  if (!row) throw new Error('tâche absente');
  return row;
}

const labelsOf = async (scenario: Awaited<ReturnType<typeof seedTasksScenario>>) =>
  (await listStatuses(scenario.paul, scenario.projectId)).map((status) => status.label);

describe('listStatuses', () => {
  it('range les statuts par catégorie puis par position, et filtre par projet', async () => {
    const scenario = await seedTasksScenario();
    const { paul, projectId } = scenario;
    const ops = await createProject(paul, { name: 'Opérations', key: 'OPS' });
    await createStatus(paul, { projectId, label: 'Idée', color: '#9ca3af', category: 'backlog' });

    expect(await labelsOf(scenario)).toEqual([
      'Backlog',
      'Idée',
      'À faire',
      'En cours',
      'En revue',
      'Terminé',
      'Annulé',
      'Doublon',
    ]);
    expect(await listStatuses(paul, ops.id)).toHaveLength(7);
    expect((await listStatuses(paul)).length).toBe(15);
  });
});

describe('createStatus', () => {
  it('ajoute le statut en fin de sa catégorie', async () => {
    const { paul, projectId } = await seedTasksScenario();

    const status = await createStatus(paul, {
      projectId,
      label: 'En test',
      color: '#0891b2',
      category: 'started',
    });

    const started = (await listStatuses(paul, projectId)).filter((s) => s.category === 'started');
    expect(started.map((s) => s.label)).toEqual(['En cours', 'En revue', 'En test']);
    expect(status).toMatchObject({ label: 'En test', color: '#0891b2', category: 'started' });
  });

  it('garde la position en fin de catégorie quand l’entrée en porte une autre', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const input = {
      projectId,
      label: 'En test',
      color: '#0891b2',
      category: 'started',
      position: -1,
    };

    await createStatus(paul, input as never);

    const started = (await listStatuses(paul, projectId)).filter((s) => s.category === 'started');
    expect(started.map((s) => s.label)).toEqual(['En cours', 'En revue', 'En test']);
  });

  it("refuse le projet d'une autre organisation", async () => {
    const { zoe, projectId } = await seedTasksScenario();

    const create = createStatus(zoe, {
      projectId,
      label: 'Glissé',
      color: '#000000',
      category: 'todo',
    });
    await expect(create).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('updateStatus', () => {
  it('change le libellé et la couleur', async () => {
    const scenario = await seedTasksScenario();
    const { paul, status } = scenario;

    await updateStatus(paul, status['En revue'], { label: 'Relecture', color: '#db2777' });

    expect(await labelsOf(scenario)).toContain('Relecture');
    expect(await labelsOf(scenario)).not.toContain('En revue');
  });

  it('refuse de vider une catégorie, et accepte quand elle garde un autre statut', async () => {
    const { paul, status } = await seedTasksScenario();

    await expect(updateStatus(paul, status.Backlog, { category: 'todo' })).rejects.toMatchObject({
      code: 'conflict',
      message: 'Chaque catégorie garde au moins un statut.',
    });
    await expect(updateStatus(paul, status.Doublon, { category: 'todo' })).resolves.toBeUndefined();
  });

  it('pose la date de fin des tâches quand le statut devient terminé, et la retire ensuite', async () => {
    const { paul, projectId, status } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const review = status['En revue'];
    const { id } = await createTask(
      paul,
      { title: 'À relire', projectId, statusId: review },
      actor,
    );
    expect((await taskState(id)).completedAt).toBeNull();

    await updateStatus(paul, review, { category: 'done' });
    expect((await taskState(id)).completedAt).toBeInstanceOf(Date);

    await updateStatus(paul, review, { category: 'started' });
    expect((await taskState(id)).completedAt).toBeNull();
  });

  it("n'agit pas sur le statut d'une autre organisation", async () => {
    const { zoe, status } = await seedTasksScenario();

    await expect(updateStatus(zoe, status.Backlog, { label: 'Volé' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('moveStatus', () => {
  it('échange le statut avec son voisin de la même catégorie', async () => {
    const scenario = await seedTasksScenario();
    const { paul, status } = scenario;

    await moveStatus(paul, status['En revue'], 'up');
    expect((await labelsOf(scenario)).slice(2, 4)).toEqual(['En revue', 'En cours']);

    await moveStatus(paul, status['En revue'], 'down');
    expect((await labelsOf(scenario)).slice(2, 4)).toEqual(['En cours', 'En revue']);
  });

  it('ne fait rien en bout de catégorie', async () => {
    const scenario = await seedTasksScenario();
    const before = await labelsOf(scenario);
    const { paul, status } = scenario;

    await moveStatus(paul, status['En cours'], 'up');
    await moveStatus(paul, status['En revue'], 'down');
    await moveStatus(paul, status.Backlog, 'down');

    expect(await labelsOf(scenario)).toEqual(before);
  });
});

describe('deleteStatus', () => {
  it('déplace les tâches vers le statut de repli, avec la date de fin qui convient', async () => {
    const { paul, projectId, status } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const duplicate = status.Doublon;
    const open = await createTask(
      paul,
      { title: 'Ouverte', projectId, statusId: duplicate },
      actor,
    );
    await ageTask(open.id);
    const before = await taskState(open.id);
    expect(before.completedAt).toBeInstanceOf(Date);

    await deleteStatus(paul, duplicate, status['À faire']);

    const after = await taskState(open.id);
    expect(after.statusId).toBe(status['À faire']);
    expect(after.completedAt).toBeNull();
    expect(after.statusChangedAt.getTime()).toBeGreaterThan(before.statusChangedAt.getTime());
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect((await listStatuses(paul, projectId)).map((s) => s.id)).not.toContain(duplicate);
  });

  it('pose la date de fin des tâches déplacées vers un statut terminé', async () => {
    const { paul, projectId, status } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const review = status['En revue'];
    const { id } = await createTask(paul, { title: 'À clore', projectId, statusId: review }, actor);
    expect((await taskState(id)).completedAt).toBeNull();

    await deleteStatus(paul, review, status.Terminé);

    const after = await taskState(id);
    expect(after.statusId).toBe(status.Terminé);
    expect(after.completedAt).toBeInstanceOf(Date);
  });

  it('refuse de supprimer le dernier statut de sa catégorie', async () => {
    const { paul, status } = await seedTasksScenario();

    await expect(deleteStatus(paul, status.Backlog, status['À faire'])).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(await listStatuses(paul)).toHaveLength(7);
  });

  it('refuse un repli identique ou d’un autre projet', async () => {
    const { paul, status } = await seedTasksScenario();
    const ops = await createProject(paul, { name: 'Opérations', key: 'OPS' });
    const [opsStatus] = await listStatuses(paul, ops.id);

    const sameStatus = deleteStatus(paul, status.Doublon, status.Doublon);
    await expect(sameStatus).rejects.toMatchObject({ code: 'invalid' });
    const otherProject = deleteStatus(paul, status.Doublon, opsStatus?.id as string);
    await expect(otherProject).rejects.toMatchObject({ code: 'invalid' });
  });

  it("ne supprime pas le statut d'une autre organisation", async () => {
    const { paul, zoe, projectId, status } = await seedTasksScenario();
    const [zoeStatus] = await listStatuses(zoe);

    const remove = deleteStatus(zoe, status.Doublon, zoeStatus?.id as string);
    await expect(remove).rejects.toMatchObject({ code: 'not_found' });
    expect(await listStatuses(paul, projectId)).toHaveLength(7);
  });
});

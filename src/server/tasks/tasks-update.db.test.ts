import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { taskEvents } from '@/server/db/schema/tasks';
import { adminDb } from '@/test/db';
import { ageTask, readEvents, readTask, seedTasksScenario } from '@/test/tasks-scenario';
import { listLabels } from './labels';
import { createProject } from './projects';
import { listStatuses } from './statuses';
import {
  bulkUpdateTasks,
  createTask,
  getTaskByRef,
  getTaskRef,
  moveTask,
  type TaskInput,
  updateTask,
} from './tasks';

const MISSING = '00000000-0000-4000-8000-000000000000';
// Trie après tout identifiant tiré au hasard : la sélection groupée la traite en dernier.
const MISSING_LAST = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

async function setup() {
  const scenario = await seedTasksScenario();
  const { paul, projectId } = scenario;
  const actor = { kind: 'user', userId: paul.userId } as const;
  const agent = { kind: 'agent', userId: paul.userId, client: 'claude-code' } as const;
  const make = (title: string, extra: Partial<TaskInput> = {}) =>
    createTask(paul, { title, projectId, ...extra }, actor);
  return { ...scenario, actor, agent, make };
}

// Les événements d'une même écriture partagent l'heure : ils sortent triés par type.
const kinds = async (taskId: string) => (await readEvents(taskId)).map((event) => event.kind);

describe('updateTask : un événement par champ changé', () => {
  it('écrit avant, après, acteur et client pour chaque champ', async () => {
    const { paul, marie, make, agent, status, label } = await setup();
    const parent = await make('Parent');
    const { id } = await make('Titre initial');

    await updateTask(
      paul,
      id,
      {
        title: 'Titre final',
        priority: 'high',
        dueDate: '2026-10-20',
        assigneeId: marie.userId,
        statusId: status['En cours'],
        parentId: parent.id,
        addLabelIds: [label.Bug],
      },
      agent,
    );

    const who = { actorId: paul.userId, actorKind: 'agent', client: 'claude-code' };
    expect(await readEvents(id)).toEqual([
      { kind: 'created', payload: {}, actorId: paul.userId, actorKind: 'user', client: null },
      { kind: 'assignee', payload: { from: null, to: marie.userId }, ...who },
      { kind: 'due_date', payload: { from: null, to: '2026-10-20' }, ...who },
      { kind: 'labels', payload: { added: ['Bug'], removed: [] }, ...who },
      { kind: 'parent', payload: { from: null, to: parent.ref }, ...who },
      { kind: 'priority', payload: { from: 'none', to: 'high' }, ...who },
      { kind: 'status', payload: { from: 'Backlog', to: 'En cours' }, ...who },
      { kind: 'title', payload: { from: 'Titre initial', to: 'Titre final' }, ...who },
    ]);
  });

  it('retire l’échéance, l’assigné et le parent avec null', async () => {
    const { paul, marie, make, actor } = await setup();
    const parent = await make('Parent');
    const { id } = await make('Fille', {
      parentId: parent.id,
      assigneeId: marie.userId,
      dueDate: '2026-10-20',
    });

    await updateTask(paul, id, { assigneeId: null, dueDate: null, parentId: null }, actor);

    const stored = await readTask(id);
    expect(stored).toMatchObject({ assigneeId: null, dueDate: null, parentId: null });
    expect((await readEvents(id)).slice(1)).toEqual([
      expect.objectContaining({ kind: 'assignee', payload: { from: marie.userId, to: null } }),
      expect.objectContaining({ kind: 'due_date', payload: { from: '2026-10-20', to: null } }),
      expect.objectContaining({ kind: 'parent', payload: { from: parent.ref, to: null } }),
    ]);
  });

  it('n’écrit rien quand les valeurs sont celles de la tâche, ni avec un patch vide', async () => {
    const { paul, make, actor, status } = await setup();
    const { id } = await make('Stable', { priority: 'low' });
    const before = await readTask(id);

    await updateTask(
      paul,
      id,
      { title: 'Stable', priority: 'low', statusId: status.Backlog },
      actor,
    );
    await updateTask(paul, id, {}, actor);

    expect(await kinds(id)).toEqual(['created']);
    expect((await readTask(id)).updatedAt).toEqual(before.updatedAt);
  });

  it('met à jour updated_at quand un champ change', async () => {
    const { paul, make, actor } = await setup();
    const { id } = await make('À modifier');
    await ageTask(id);
    const before = await readTask(id);

    await updateTask(paul, id, { title: 'Modifiée' }, actor);

    const after = await readTask(id);
    expect(after.title).toBe('Modifiée');
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });
});

describe('updateTask : description', () => {
  it('écrit un événement sans le texte, puis aucun pour le même acteur sous dix minutes', async () => {
    const { paul, make, actor } = await setup();
    const { id } = await make('Documentée');

    await updateTask(paul, id, { descriptionMd: 'texte secret v1' }, actor);
    await updateTask(paul, id, { descriptionMd: 'texte secret v2' }, actor);

    expect((await readTask(id)).descriptionMd).toBe('texte secret v2');
    const events = await readEvents(id);
    expect(events.filter((event) => event.kind === 'description')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('secret');
  });

  it('écrit un nouvel événement pour un autre acteur, ou après dix minutes', async () => {
    const { paul, marie, make, actor } = await setup();
    const { id } = await make('Documentée');
    const descriptionEvents = async () =>
      (await kinds(id)).filter((kind) => kind === 'description').length;

    await updateTask(paul, id, { descriptionMd: 'v1' }, actor);
    await updateTask(marie, id, { descriptionMd: 'v2' }, { kind: 'user', userId: marie.userId });
    expect(await descriptionEvents()).toBe(2);

    await updateTask(paul, id, { descriptionMd: 'v3' }, actor);
    expect(await descriptionEvents()).toBe(2);
    await adminDb
      .update(taskEvents)
      .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) })
      .where(
        and(
          eq(taskEvents.taskId, id),
          eq(taskEvents.actorId, paul.userId),
          eq(taskEvents.kind, 'description'),
        ),
      );
    await updateTask(paul, id, { descriptionMd: 'v4' }, actor);
    expect(await descriptionEvents()).toBe(3);
  });

  it('distingue la personne de l’agent qui agit pour elle', async () => {
    const { paul, make, actor, agent } = await setup();
    const { id } = await make('Documentée');

    await updateTask(paul, id, { descriptionMd: 'v1' }, actor);
    await updateTask(paul, id, { descriptionMd: 'v2' }, agent);

    expect((await kinds(id)).filter((kind) => kind === 'description')).toHaveLength(2);
  });
});

describe('updateTask : statut et date de fin', () => {
  it('pose completed_at en terminé ou annulé, le retire sinon, et date le changement de statut', async () => {
    const { paul, make, actor, status } = await setup();
    const { id } = await make('Cycle de vie');
    await ageTask(id);
    const created = await readTask(id);
    expect(created.completedAt).toBeNull();

    await updateTask(paul, id, { statusId: status.Terminé }, actor);
    const done = await readTask(id);
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.statusChangedAt.getTime()).toBeGreaterThan(created.statusChangedAt.getTime());

    await updateTask(paul, id, { statusId: status['En cours'] }, actor);
    expect((await readTask(id)).completedAt).toBeNull();

    await updateTask(paul, id, { statusId: status.Annulé }, actor);
    expect((await readTask(id)).completedAt).toBeInstanceOf(Date);
  });

  it('garde status_changed_at quand le statut ne change pas', async () => {
    const { paul, make, actor, status } = await setup();
    const { id } = await make('Même statut');
    await ageTask(id);
    const before = await readTask(id);

    await updateTask(paul, id, { statusId: status.Backlog, priority: 'high' }, actor);

    const after = await readTask(id);
    expect(after.priority).toBe('high');
    expect(after.statusChangedAt).toEqual(before.statusChangedAt);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('refuse le statut d’un autre projet', async () => {
    const { paul, make, actor, status, projectId } = await setup();
    const other = await createProject(paul, { name: 'Opérations', key: 'OPS' });
    const { id } = await make('Bloquée');
    expect(projectId).not.toBe(other.id);
    const [otherStatus] = await listStatuses(paul, other.id);

    const wrong = updateTask(paul, id, { statusId: otherStatus?.id ?? MISSING }, actor);

    await expect(wrong).rejects.toMatchObject({
      code: 'not_found',
      message: 'Statut introuvable.',
    });
    expect((await readTask(id)).statusId).toBe(status.Backlog);
  });
});

describe('updateTask : assigné', () => {
  it('refuse un assigné qui n’est pas membre, sans rien changer', async () => {
    const { paul, zoe, make, actor } = await setup();
    const { id } = await make('Pas pour Zoé');

    const assign = updateTask(paul, id, { title: 'Changée', assigneeId: zoe.userId }, actor);

    await expect(assign).rejects.toMatchObject({
      code: 'not_found',
      message: 'Membre introuvable.',
    });
    expect(await readTask(id)).toMatchObject({ title: 'Pas pour Zoé', assigneeId: null });
  });
});

describe('updateTask : parent', () => {
  it('refuse un parent invisible, la tâche elle-même et un cycle', async () => {
    const { paul, zoe, zoeProjectId, make, actor } = await setup();
    const a = await make('A');
    const b = await make('B', { parentId: a.id });
    const c = await make('C', { parentId: b.id });
    const zoeTask = await createTask(
      zoe,
      { title: 'De Zoé', projectId: zoeProjectId },
      { kind: 'user', userId: zoe.userId },
    );

    await expect(updateTask(paul, a.id, { parentId: zoeTask.id }, actor)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(updateTask(paul, a.id, { parentId: MISSING }, actor)).rejects.toMatchObject({
      code: 'not_found',
    });
    for (const parentId of [a.id, b.id, c.id]) {
      await expect(updateTask(paul, a.id, { parentId }, actor)).rejects.toMatchObject({
        code: 'invalid',
        message: 'Ce parent créerait un cycle.',
      });
    }
    expect((await readTask(a.id)).parentId).toBeNull();
  });

  it('accepte un nouveau parent qui n’est pas un descendant', async () => {
    const { paul, make, actor } = await setup();
    const a = await make('A');
    const b = await make('B', { parentId: a.id });
    const c = await make('C');

    await updateTask(paul, b.id, { parentId: c.id }, actor);

    expect((await readTask(b.id)).parentId).toBe(c.id);
  });
});

describe('updateTask : changement de projet', () => {
  it('donne un nouveau numéro, un statut de même catégorie et garde l’ancienne référence dans l’événement', async () => {
    const { paul, make, actor, status } = await setup();
    const ops = await createProject(paul, { name: 'Opérations', key: 'OPS' });
    await createTask(paul, { title: 'Déjà là', projectId: ops.id }, actor);
    const { id, ref } = await make('Voyageuse', { statusId: status['En revue'] });

    await updateTask(paul, id, { projectId: ops.id }, actor);

    const moved = await getTaskByRef(paul, 'OPS-2');
    expect(moved).toMatchObject({ id, projectKey: 'OPS', number: 2, statusLabel: 'En cours' });
    expect(await getTaskByRef(paul, ref)).toBeNull();
    expect((await readEvents(id)).slice(1)).toEqual([
      expect.objectContaining({ kind: 'project', payload: { from: ref, to: 'OPS-2' } }),
    ]);
  });

  it('rend la nouvelle référence, et rien pour une tâche d’une autre organisation', async () => {
    const { paul, zoe, make, actor } = await setup();
    const ops = await createProject(paul, { name: 'Opérations', key: 'OPS' });
    const { id, ref } = await make('Voyageuse');
    expect(await getTaskRef(paul, id)).toBe(ref);

    await updateTask(paul, id, { projectId: ops.id }, actor);

    expect(await getTaskRef(paul, id)).toBe('OPS-1');
    expect(await getTaskRef(zoe, id)).toBeNull();
  });

  it('accepte un statut du projet d’arrivée donné en même temps', async () => {
    const { paul, make, actor } = await setup();
    const ops = await createProject(paul, { name: 'Opérations', key: 'OPS' });
    const opsDone = (await listStatuses(paul, ops.id)).find((s) => s.category === 'done');
    const { id } = await make('Terminée ailleurs');

    await updateTask(paul, id, { projectId: ops.id, statusId: opsDone?.id }, actor);

    expect(await readTask(id)).toMatchObject({ projectId: ops.id, statusId: opsDone?.id });
    expect((await readTask(id)).completedAt).toBeInstanceOf(Date);
    expect(await kinds(id)).toEqual(['created', 'project', 'status']);
  });

  it('refuse le projet d’une autre organisation sans consommer de numéro', async () => {
    const { paul, zoe, zoeProjectId, make, actor } = await setup();
    const { id } = await make('Reste ici');

    const move = updateTask(paul, id, { projectId: zoeProjectId }, actor);

    await expect(move).rejects.toMatchObject({ code: 'not_found', message: 'Projet introuvable.' });
    expect((await readTask(id)).number).toBe(1);
    const zoeTask = await createTask(
      zoe,
      { title: 'Première de Zoé', projectId: zoeProjectId },
      { kind: 'user', userId: zoe.userId },
    );
    expect(zoeTask.ref.endsWith('-1')).toBe(true);
  });
});

describe('updateTask : étiquettes', () => {
  it('ajoute et retire sans écraser les autres, et n’écrit rien pour une étiquette déjà posée', async () => {
    const { paul, make, actor, label } = await setup();
    const { id, ref } = await make('Étiquetée', { labelIds: [label.Bug] });
    const names = async () => (await getTaskByRef(paul, ref))?.labels.map((l) => l.name);

    await updateTask(paul, id, { addLabelIds: [label.Bug] }, actor);
    expect(await kinds(id)).toEqual(['created']);

    await updateTask(paul, id, { addLabelIds: [label.Amélioration] }, actor);
    expect(await names()).toEqual(['Amélioration', 'Bug']);

    await updateTask(paul, id, { removeLabelIds: [label.Bug, label.Fonctionnalité] }, actor);
    expect(await names()).toEqual(['Amélioration']);
    expect((await readEvents(id)).slice(1).map((event) => event.payload)).toEqual([
      { added: ['Amélioration'], removed: [] },
      { added: [], removed: ['Bug'] },
    ]);
  });

  it('refuse une étiquette inconnue ou d’une autre organisation, sans rien changer', async () => {
    const { paul, zoe, make, actor, label } = await setup();
    const { id } = await make('Étiquetée');
    const [zoeLabel] = await listLabels(zoe);

    for (const unknown of [MISSING, zoeLabel?.id ?? MISSING]) {
      await expect(
        updateTask(paul, id, { title: 'Changée', addLabelIds: [label.Bug, unknown] }, actor),
      ).rejects.toMatchObject({ code: 'not_found', message: 'Étiquette introuvable.' });
    }
    expect((await getTaskByRef(paul, 'ATE-1'))?.labels).toEqual([]);
    expect((await readTask(id)).title).toBe('Étiquetée');
  });
});

describe('updateTask : une autre organisation', () => {
  it('ne modifie rien et ne révèle rien', async () => {
    const { zoe, make, status } = await setup();
    const { id } = await make('Protégée');
    const actor = { kind: 'user', userId: zoe.userId } as const;

    await expect(updateTask(zoe, id, { title: 'Volée' }, actor)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(bulkUpdateTasks(zoe, [id], { priority: 'urgent' }, actor)).rejects.toMatchObject({
      code: 'not_found',
    });
    const move = { field: 'status', value: status.Terminé, beforeId: null, afterId: null } as const;
    await expect(moveTask(zoe, id, move, actor)).rejects.toMatchObject({ code: 'not_found' });
    expect(await readTask(id)).toMatchObject({ title: 'Protégée', priority: 'none' });
    expect(await kinds(id)).toEqual(['created']);
  });
});

describe('bulkUpdateTasks', () => {
  it('applique le patch à toutes les tâches, avec un événement par tâche et par champ', async () => {
    const { paul, marie, make, actor, status, label } = await setup();
    const tasks = [await make('Une'), await make('Deux'), await make('Trois')];
    const ids = tasks.map((task) => task.id);

    const count = await bulkUpdateTasks(
      paul,
      [...ids, ids[0] as string],
      { statusId: status['En cours'], assigneeId: marie.userId, addLabelIds: [label.Bug] },
      actor,
    );

    expect(count).toBe(3);
    for (const id of ids) {
      expect(await readTask(id)).toMatchObject({
        statusId: status['En cours'],
        assigneeId: marie.userId,
      });
      expect(await kinds(id)).toEqual(['created', 'assignee', 'labels', 'status']);
    }
  });

  it('annule tout quand une tâche manque', async () => {
    const { paul, make, actor } = await setup();
    const tasks = [await make('Une'), await make('Deux')];
    const ids = tasks.map((task) => task.id);

    const bulk = bulkUpdateTasks(paul, [...ids, MISSING_LAST], { priority: 'urgent' }, actor);

    await expect(bulk).rejects.toMatchObject({ code: 'not_found', message: 'Tâche introuvable.' });
    for (const id of ids) {
      expect((await readTask(id)).priority).toBe('none');
      expect(await kinds(id)).toEqual(['created']);
    }
  });

  it('refuse un assigné qui n’est pas membre', async () => {
    const { paul, zoe, make, actor } = await setup();
    const one = await make('Une');

    const bulk = bulkUpdateTasks(paul, [one.id], { assigneeId: zoe.userId }, actor);

    await expect(bulk).rejects.toMatchObject({ code: 'not_found', message: 'Membre introuvable.' });
    expect((await readTask(one.id)).assigneeId).toBeNull();
  });

  it('refuse une sélection vide ou de plus de 200 tâches', async () => {
    const { paul, actor } = await setup();
    const many = Array.from(
      { length: 201 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );

    await expect(bulkUpdateTasks(paul, [], { priority: 'low' }, actor)).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(bulkUpdateTasks(paul, many, { priority: 'low' }, actor)).rejects.toMatchObject({
      code: 'invalid',
    });
  });
});

describe('moveTask', () => {
  it('range la tâche entre ses voisines sans journal ni mise à jour', async () => {
    const { paul, make, actor } = await setup();
    const [a, b, c] = [await make('A'), await make('B'), await make('C')];
    const before = await readTask(c.id);

    await moveTask(paul, c.id, { beforeId: a.id, afterId: b.id }, actor);

    const [pa, pb, pc] = await Promise.all(
      [a, b, c].map(async (t) => (await readTask(t.id)).position),
    );
    expect(pa).toBeLessThan(pc as number);
    expect(pc).toBeLessThan(pb as number);
    expect(await kinds(c.id)).toEqual(['created']);
    expect((await readTask(c.id)).updatedAt).toEqual(before.updatedAt);
  });

  it('place en tête ou en fin quand une voisine manque', async () => {
    const { paul, make, actor } = await setup();
    const [a, b] = [await make('A'), await make('B')];
    const first = (await readTask(a.id)).position;

    await moveTask(paul, b.id, { beforeId: null, afterId: a.id }, actor);
    expect((await readTask(b.id)).position).toBeLessThan(first);
    await moveTask(paul, b.id, { beforeId: a.id, afterId: null }, actor);
    expect((await readTask(b.id)).position).toBeGreaterThan(first);
  });

  it('change le statut, la priorité ou l’assigné de la colonne d’arrivée, avec le journal', async () => {
    const { paul, marie, make, actor, status } = await setup();
    const { id } = await make('Glissée', { assigneeId: marie.userId });

    await moveTask(
      paul,
      id,
      { field: 'status', value: status.Terminé, beforeId: null, afterId: null },
      actor,
    );
    await moveTask(
      paul,
      id,
      { field: 'priority', value: 'urgent', beforeId: null, afterId: null },
      actor,
    );
    await moveTask(
      paul,
      id,
      { field: 'assignee', value: null, beforeId: null, afterId: null },
      actor,
    );

    expect(await readTask(id)).toMatchObject({
      statusId: status.Terminé,
      priority: 'urgent',
      assigneeId: null,
    });
    expect((await readTask(id)).completedAt).toBeInstanceOf(Date);
    expect(await kinds(id)).toEqual(['created', 'status', 'priority', 'assignee']);
  });

  it('refuse un assigné qui n’est pas membre', async () => {
    const { paul, zoe, make, actor } = await setup();
    const { id } = await make('Glissée');

    const move = moveTask(
      paul,
      id,
      { field: 'assignee', value: zoe.userId, beforeId: null, afterId: null },
      actor,
    );

    await expect(move).rejects.toMatchObject({ code: 'not_found', message: 'Membre introuvable.' });
    expect((await readTask(id)).assigneeId).toBeNull();
  });

  it('annule le changement de colonne quand une voisine est introuvable', async () => {
    const { paul, make, actor, status } = await setup();
    const { id } = await make('Glissée');

    const move = moveTask(
      paul,
      id,
      { field: 'status', value: status.Terminé, beforeId: MISSING, afterId: null },
      actor,
    );

    await expect(move).rejects.toMatchObject({ code: 'not_found' });
    expect((await readTask(id)).statusId).toBe(status.Backlog);
  });
});

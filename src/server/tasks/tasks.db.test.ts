import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { taskProjects, taskStatuses } from '@/server/db/schema/tasks';
import { adminDb } from '@/test/db';
import { seedTaskProject } from '@/test/fixtures';
import { readEvents, readTask, seedTasksScenario } from '@/test/tasks-scenario';
import { MAX_IDS } from './errors';
import { createProject } from './projects';
import { createTask, deleteTasks, getTaskByRef } from './tasks';

describe('createTask : numérotation', () => {
  it('donne les numéros 1 à 20 sans trou à vingt créations parallèles', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;

    const created = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createTask(paul, { title: `Tâche ${i}`, projectId }, actor),
      ),
    );

    expect(created.map((task) => task.ref).sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => `ATE-${i + 1}`).sort(),
    );
    const [project] = await adminDb
      .select({ lastNumber: taskProjects.lastNumber })
      .from(taskProjects)
      .where(eq(taskProjects.id, projectId));
    expect(project?.lastNumber).toBe(20);
  });

  it('ne consomme pas de numéro quand la création échoue', async () => {
    const { paul, projectId, label } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const unknown = '00000000-0000-4000-8000-000000000000';

    const failing = createTask(
      paul,
      { title: 'Étiquette fantôme', projectId, labelIds: [label.Bug, unknown] },
      actor,
    );
    await expect(failing).rejects.toMatchObject({ code: 'not_found' });

    const next = await createTask(paul, { title: 'Suivante', projectId }, actor);
    expect(next.ref).toBe('ATE-1');
  });
});

describe('createTask : valeurs par défaut', () => {
  it('prend le premier statut backlog, une position en fin, le créateur et l’origine ui', async () => {
    const { paul, projectId, status } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;

    const first = await createTask(paul, { title: 'Première', projectId }, actor);
    const second = await createTask(paul, { title: 'Seconde', projectId }, actor);

    const stored = await readTask(first.id);
    expect(stored).toMatchObject({
      number: 1,
      statusId: status.Backlog,
      priority: 'none',
      descriptionMd: '',
      assigneeId: null,
      creatorId: paul.userId,
      dueDate: null,
      origin: 'ui',
      completedAt: null,
      acl: [paul.tenantId],
    });
    expect((await readTask(second.id)).position).toBeGreaterThan(stored.position);
    expect(await readEvents(first.id)).toEqual([
      { kind: 'created', payload: {}, actorId: paul.userId, actorKind: 'user', client: null },
    ]);
  });

  it('prend le statut « À faire » quand le projet n’a pas de backlog', async () => {
    const { paul } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const { projectId, statusIds } = await seedTaskProject(paul.tenantId, { key: 'SBL' });
    await adminDb.delete(taskStatuses).where(eq(taskStatuses.id, statusIds.backlog));

    const { id } = await createTask(paul, { title: 'Sans backlog', projectId }, actor);

    expect((await readTask(id)).statusId).toBe(statusIds.todo);
  });

  it('enregistre l’agent et son client sur l’événement, et l’origine mcp', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const agent = { kind: 'agent', userId: paul.userId, client: 'claude-code' } as const;

    const { id } = await createTask(paul, { title: 'Par un agent', projectId }, agent);

    expect((await readTask(id)).origin).toBe('mcp');
    expect(await readEvents(id)).toEqual([
      {
        kind: 'created',
        payload: {},
        actorId: paul.userId,
        actorKind: 'agent',
        client: 'claude-code',
      },
    ]);
  });

  it('range les champs saisis : statut, priorité, assigné, échéance, description, étiquettes', async () => {
    const { paul, marie, projectId, status, label } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;

    const { id, ref } = await createTask(
      paul,
      {
        title: 'Complète',
        descriptionMd: '## Détail',
        projectId,
        statusId: status['En cours'],
        priority: 'high',
        assigneeId: marie.userId,
        dueDate: '2026-10-20',
        labelIds: [label.Bug, label.Bug, label.Amélioration],
      },
      actor,
    );

    const detail = await getTaskByRef(paul, ref);
    expect(detail).toMatchObject({
      id,
      title: 'Complète',
      descriptionMd: '## Détail',
      statusLabel: 'En cours',
      priority: 'high',
      assignee: { id: marie.userId, name: 'Marie Durand', initials: 'MD' },
      dueDate: '2026-10-20',
      creator: { id: paul.userId, name: 'Paul Martin', initials: 'PM' },
    });
    expect(detail?.labels.map((l) => l.name)).toEqual(['Amélioration', 'Bug']);
  });

  it('pose la date de fin quand la tâche naît terminée', async () => {
    const { paul, projectId, status } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;

    const { id } = await createTask(
      paul,
      { title: 'Déjà faite', projectId, statusId: status.Terminé },
      actor,
    );

    expect((await readTask(id)).completedAt).toBeInstanceOf(Date);
  });
});

describe('createTask : sous-tâches', () => {
  it('hérite du projet et de la priorité du parent, sauf priorité explicite', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const other = await createProject(paul, { name: 'Opérations', key: 'OPS' });
    const parent = await createTask(
      paul,
      { title: 'Parent', projectId, priority: 'urgent' },
      actor,
    );

    const inherited = await createTask(
      paul,
      { title: 'Fille', parentId: parent.id, projectId: other.id },
      actor,
    );
    const explicit = await createTask(
      paul,
      { title: 'Fille basse', parentId: parent.id, priority: 'low' },
      actor,
    );

    expect(await readTask(inherited.id)).toMatchObject({
      projectId,
      parentId: parent.id,
      priority: 'urgent',
    });
    expect(inherited.ref).toBe('ATE-2');
    expect(await readTask(explicit.id)).toMatchObject({ projectId, priority: 'low' });
  });
});

describe('createTask : refus', () => {
  it('exige un projet quand il n’y a pas de parent', async () => {
    const { paul } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;

    await expect(createTask(paul, { title: 'Sans projet' }, actor)).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('refuse le statut d’un autre projet, l’étiquette inconnue et le parent absent', async () => {
    const { paul, projectId, status } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const other = await createProject(paul, { name: 'Opérations', key: 'OPS' });
    const missing = '00000000-0000-4000-8000-000000000000';

    const wrongStatus = createTask(
      paul,
      { title: 'x', projectId: other.id, statusId: status.Backlog },
      actor,
    );
    await expect(wrongStatus).rejects.toMatchObject({
      code: 'not_found',
      message: 'Statut introuvable.',
    });
    const unknownLabel = createTask(paul, { title: 'x', projectId, labelIds: [missing] }, actor);
    await expect(unknownLabel).rejects.toMatchObject({ message: 'Étiquette introuvable.' });
    const unknownParent = createTask(paul, { title: 'x', parentId: missing }, actor);
    await expect(unknownParent).rejects.toMatchObject({ message: 'Tâche parente introuvable.' });
  });

  it('refuse un assigné qui n’est pas membre de l’organisation', async () => {
    const { paul, zoe, projectId } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;

    const create = createTask(paul, { title: 'x', projectId, assigneeId: zoe.userId }, actor);

    await expect(create).rejects.toMatchObject({
      code: 'not_found',
      message: 'Membre introuvable.',
    });
  });

  it('ne crée rien dans le projet ni sous le parent d’une autre organisation', async () => {
    const { paul, zoe, projectId } = await seedTasksScenario();
    const paulActor = { kind: 'user', userId: paul.userId } as const;
    const zoeActor = { kind: 'user', userId: zoe.userId } as const;
    const parent = await createTask(paul, { title: 'Parent', projectId }, paulActor);

    const intoProject = createTask(zoe, { title: 'x', projectId }, zoeActor);
    await expect(intoProject).rejects.toMatchObject({ code: 'not_found' });
    const underParent = createTask(zoe, { title: 'x', parentId: parent.id }, zoeActor);
    await expect(underParent).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('getTaskByRef', () => {
  it('rend le détail : parent, sous-tâches et leur avancement, insensible à la casse', async () => {
    const { paul, projectId, status } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const parent = await createTask(paul, { title: 'Chantier', projectId }, actor);
    await createTask(paul, { title: 'Dalle', projectId, parentId: parent.id }, actor);
    await createTask(
      paul,
      { title: 'Murs', projectId, parentId: parent.id, statusId: status.Terminé },
      actor,
    );

    const detail = await getTaskByRef(paul, 'ate-1');
    const child = await getTaskByRef(paul, 'ATE-2');

    expect(detail).toMatchObject({
      ref: 'ATE-1',
      subtaskCount: 2,
      subtaskDoneCount: 1,
      parent: null,
    });
    expect(detail?.subtasks.map((t) => t.ref)).toEqual(['ATE-2', 'ATE-3']);
    expect(child?.parent).toEqual({ ref: 'ATE-1', title: 'Chantier' });
    expect(child?.parentRef).toBe('ATE-1');
  });

  it('rend null pour une référence mal formée, inconnue, ou vue d’une autre organisation', async () => {
    const { paul, zoe, projectId } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    await createTask(paul, { title: 'Privée de Paul', projectId }, actor);

    expect(await getTaskByRef(paul, 'pas une référence')).toBeNull();
    expect(await getTaskByRef(paul, 'ATE-99')).toBeNull();
    expect(await getTaskByRef(zoe, 'ATE-1')).toBeNull();
    expect(await getTaskByRef(paul, 'ATE-1')).not.toBeNull();
  });
});

describe('deleteTasks', () => {
  it('supprime les tâches, leurs événements ; les sous-tâches perdent leur parent', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const parent = await createTask(paul, { title: 'Parent', projectId }, actor);
    const child = await createTask(paul, { title: 'Fille', projectId, parentId: parent.id }, actor);

    const deleted = await deleteTasks(paul, [parent.id, parent.id]);

    expect(deleted).toBe(1);
    expect(await getTaskByRef(paul, parent.ref)).toBeNull();
    expect(await readEvents(parent.id)).toEqual([]);
    expect((await readTask(child.id)).parentId).toBeNull();
  });

  it('ne supprime rien chez une autre organisation', async () => {
    const { paul, zoe, projectId } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const { id, ref } = await createTask(paul, { title: 'Protégée', projectId }, actor);

    expect(await deleteTasks(zoe, [id])).toBe(0);
    expect(await getTaskByRef(paul, ref)).not.toBeNull();
  });

  it(`refuse une sélection vide ou de plus de ${MAX_IDS} tâches`, async () => {
    const { paul } = await seedTasksScenario();
    const many = Array.from(
      { length: MAX_IDS + 1 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );

    await expect(deleteTasks(paul, [])).rejects.toMatchObject({ code: 'invalid' });
    await expect(deleteTasks(paul, many)).rejects.toMatchObject({ code: 'invalid' });
  });
});

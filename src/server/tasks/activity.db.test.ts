import { describe, expect, it } from 'vitest';
import { readEvents, seedTasksScenario } from '@/test/tasks-scenario';
import { addComment, listActivity, listMyActivity } from './activity';
import { createTask, updateTask } from './tasks';

const user = (ctx: { userId: string }) => ({ kind: 'user', userId: ctx.userId }) as const;

describe('addComment', () => {
  it('écrit le commentaire et un seul événement comment, qui ne porte pas le texte', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const { id } = await createTask(paul, { title: 'Commentée', projectId }, user(paul));

    await addComment(paul, id, 'À **vérifier** avant lundi', user(paul));

    const events = await readEvents(id);
    expect(events.map((event) => event.kind)).toEqual(['created', 'comment']);
    expect(events[1]).toMatchObject({
      payload: { commentId: expect.any(String) },
      actorId: paul.userId,
      actorKind: 'user',
      client: null,
    });
    expect(JSON.stringify(events)).not.toContain('vérifier');
  });

  it('garde l’agent et son client sur l’événement', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const { id } = await createTask(paul, { title: 'Pour un agent', projectId }, user(paul));
    const agent = { kind: 'agent', userId: paul.userId, client: 'claude-code' } as const;

    await addComment(paul, id, 'Fait.', agent);

    const [item] = (await listActivity(paul, id)).slice(-1);
    expect(item).toMatchObject({ kind: 'comment', actorKind: 'agent', client: 'claude-code' });
  });

  it('refuse une tâche inconnue ou invisible, sans rien écrire', async () => {
    const { paul, zoe, projectId } = await seedTasksScenario();
    const { id } = await createTask(paul, { title: 'Privée', projectId }, user(paul));
    const missing = '00000000-0000-4000-8000-000000000000';

    await expect(addComment(zoe, id, 'Intrus', user(zoe))).rejects.toMatchObject({
      code: 'not_found',
      message: 'Tâche introuvable.',
    });
    await expect(addComment(paul, missing, 'Fantôme', user(paul))).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await listActivity(paul, id)).toHaveLength(1);
  });

  it('ne laisse pas écrire au nom d’un autre', async () => {
    const { paul, marie, projectId } = await seedTasksScenario();
    const { id } = await createTask(paul, { title: 'Usurpée', projectId }, user(paul));

    await expect(addComment(marie, id, 'Faux', user(paul))).rejects.toThrow();
    expect(await listActivity(paul, id)).toHaveLength(1);
  });
});

describe('listActivity', () => {
  it('mêle événements et commentaires, du plus ancien au plus récent', async () => {
    const { paul, marie, projectId, status } = await seedTasksScenario();
    const { id, ref } = await createTask(paul, { title: 'Chantier', projectId }, user(paul));
    await updateTask(paul, id, { statusId: status['En cours'] }, user(paul));
    await addComment(marie, id, 'Je m’en occupe.', user(marie));
    const agent = { kind: 'agent', userId: paul.userId, client: 'claude-code' } as const;
    await addComment(paul, id, 'Terminé côté code.', agent);

    const items = await listActivity(paul, id);

    expect(items.map((item) => [item.kind, item.body])).toEqual([
      ['created', null],
      ['status', null],
      ['comment', 'Je m’en occupe.'],
      ['comment', 'Terminé côté code.'],
    ]);
    expect(items[1]).toMatchObject({
      payload: { from: 'Backlog', to: 'En cours' },
      actor: { id: paul.userId, name: 'Paul Martin', initials: 'PM' },
      taskRef: ref,
      taskTitle: 'Chantier',
    });
    expect(items[2]).toMatchObject({ actor: { name: 'Marie Durand' }, actorKind: 'user' });
    expect(items[3]).toMatchObject({ actorKind: 'agent', client: 'claude-code' });
  });

  it('ne rend que les lignes de la tâche demandée, et rien à une autre organisation', async () => {
    const { paul, zoe, projectId } = await seedTasksScenario();
    const first = await createTask(paul, { title: 'Première', projectId }, user(paul));
    const second = await createTask(paul, { title: 'Seconde', projectId }, user(paul));
    await addComment(paul, second.id, 'Sur la seconde', user(paul));

    expect(await listActivity(paul, first.id)).toHaveLength(1);
    expect(await listActivity(paul, second.id)).toHaveLength(2);
    expect(await listActivity(zoe, second.id)).toEqual([]);
  });
});

describe('listMyActivity', () => {
  it('ne remonte que les tâches que j’ai créées ou qui me sont assignées, la plus récente d’abord', async () => {
    const { paul, marie, projectId } = await seedTasksScenario();
    const mine = await createTask(paul, { title: 'Créée par Paul', projectId }, user(paul));
    const assigned = await createTask(
      marie,
      { title: 'Assignée à Paul', projectId, assigneeId: paul.userId },
      user(marie),
    );
    const theirs = await createTask(
      marie,
      { title: 'À Marie seule', projectId, assigneeId: marie.userId },
      user(marie),
    );
    await addComment(marie, mine.id, 'Bien reçu.', user(marie));

    const pauls = await listMyActivity(paul, 50);
    const maries = await listMyActivity(marie, 50);

    expect(pauls.map((item) => [item.taskRef, item.kind])).toEqual([
      [mine.ref, 'comment'],
      [assigned.ref, 'created'],
      [mine.ref, 'created'],
    ]);
    expect(pauls[0]).toMatchObject({ body: 'Bien reçu.', actor: { name: 'Marie Durand' } });
    expect(maries.map((item) => item.taskRef).sort()).toEqual([assigned.ref, theirs.ref].sort());
  });

  it('respecte la limite', async () => {
    const { paul, projectId } = await seedTasksScenario();
    const { id } = await createTask(paul, { title: 'Bavarde', projectId }, user(paul));
    await addComment(paul, id, 'Un', user(paul));
    await addComment(paul, id, 'Deux', user(paul));

    const [newest] = await listMyActivity(paul, 1);

    expect(await listMyActivity(paul, 2)).toHaveLength(2);
    expect(newest).toMatchObject({ kind: 'comment', body: 'Deux' });
  });

  it('est vide pour une autre organisation', async () => {
    const { paul, zoe, projectId } = await seedTasksScenario();
    await createTask(paul, { title: 'Invisible', projectId, assigneeId: paul.userId }, user(paul));

    expect(await listMyActivity(zoe, 50)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { eventText } from '@/components/tasks/event-text';
import { addComment, listActivity } from '@/server/tasks/activity';
import { listMembers } from '@/server/tasks/members';
import { createProject } from '@/server/tasks/projects';
import { createTask, updateTask } from '@/server/tasks/tasks';
import { seedTasksScenario } from '@/test/tasks-scenario';

// L'interface lit les charges que le serveur écrit (events.ts) : si l'une change de forme, le fil
// d'activité afficherait « ? » ou « un ancien membre » sans qu'aucun test de l'interface rougisse.
describe('charges des événements et libellés du fil d’activité', () => {
  it('chaque écriture d’une tâche se lit comme le contrat C8', async () => {
    const { paul, marie, projectId, status, label } = await seedTasksScenario();
    const actor = { kind: 'user', userId: paul.userId } as const;
    const parent = await createTask(paul, { title: 'Parent', projectId }, actor);
    const task = await createTask(paul, { title: 'Avant', projectId }, actor);
    const ops = await createProject(paul, { name: 'Opérations', key: 'OPS' });

    await updateTask(paul, task.id, { title: 'Après' }, actor);
    await updateTask(paul, task.id, { priority: 'high' }, actor);
    await updateTask(paul, task.id, { statusId: status['En cours'] }, actor);
    await updateTask(paul, task.id, { assigneeId: marie.userId }, actor);
    await updateTask(paul, task.id, { dueDate: '2026-10-16' }, actor);
    await updateTask(paul, task.id, { addLabelIds: [label.Bug] }, actor);
    await updateTask(paul, task.id, { removeLabelIds: [label.Bug] }, actor);
    await updateTask(paul, task.id, { parentId: parent.id }, actor);
    await updateTask(paul, task.id, { projectId: ops.id }, actor);
    await addComment(paul, task.id, 'Fait.', actor);

    const names = new Map((await listMembers(paul)).map((member) => [member.id, member.name]));
    const texts = (await listActivity(paul, task.id)).map((item) => eventText(item, names));

    expect(texts).toEqual([
      'a créé la tâche',
      'a changé le titre : « Avant » → « Après »',
      'a changé la priorité : Sans priorité → Haute',
      'a changé le statut : Backlog → En cours',
      'a changé l’assigné : personne → Marie Durand',
      'a changé l’échéance : aucune → ven. 16 oct.',
      'a ajouté l’étiquette Bug',
      'a retiré l’étiquette Bug',
      `a changé le parent : aucun → ${parent.ref}`,
      `a changé de projet : ${task.ref} → OPS-1`,
      'a commenté',
    ]);
  });
});

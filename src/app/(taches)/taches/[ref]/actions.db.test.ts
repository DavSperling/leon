import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireUserContext } from '@/server/auth/session';
import { listActivity } from '@/server/tasks/activity';
import { createProject } from '@/server/tasks/projects';
import { createTask, getTaskByRef } from '@/server/tasks/tasks';
import { seedTasksScenario } from '@/test/tasks-scenario';
import { addCommentAction, changeProjectAction, deleteTaskAction } from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

// Les actions de la page d'une tâche, de bout en bout : zod, puis la base sous les droits du lecteur.
async function setup() {
  const scenario = await seedTasksScenario();
  const { paul, projectId } = scenario;
  const actor = { kind: 'user', userId: paul.userId } as const;
  const task = await createTask(paul, { title: 'Dalle du hangar', projectId }, actor);
  vi.mocked(requireUserContext).mockResolvedValue(paul);
  return { ...scenario, task };
}

beforeEach(() => vi.clearAllMocks());

describe('addCommentAction', () => {
  it('écrit le commentaire et son événement, au nom du lecteur', async () => {
    const { paul, task } = await setup();

    await expect(addCommentAction(task.id, '  Coulée prévue mardi  ')).resolves.toEqual({
      ok: true,
    });

    const activity = await listActivity(paul, task.id);
    expect(activity.at(-1)).toMatchObject({
      kind: 'comment',
      body: 'Coulée prévue mardi',
      actorKind: 'user',
      actor: { id: paul.userId },
    });
  });

  it('refuse un commentaire vide, sans rien écrire', async () => {
    const { paul, task } = await setup();

    await expect(addCommentAction(task.id, '   ')).resolves.toEqual({
      ok: false,
      error: 'Saisie invalide.',
    });

    expect((await listActivity(paul, task.id)).map((item) => item.kind)).toEqual(['created']);
  });

  it('ne commente pas la tâche d’une autre organisation', async () => {
    const { paul, zoe, task } = await setup();
    vi.mocked(requireUserContext).mockResolvedValue(zoe);

    await expect(addCommentAction(task.id, 'Intrus')).resolves.toEqual({
      ok: false,
      error: 'Tâche introuvable.',
    });

    expect((await listActivity(paul, task.id)).map((item) => item.kind)).toEqual(['created']);
  });
});

describe('deleteTaskAction', () => {
  it('supprime la tâche puis mène à la liste d’où l’on vient', async () => {
    const { paul, task } = await setup();

    await expect(deleteTaskAction(task.id, 'groupe=priorite')).rejects.toThrow(
      'NEXT_REDIRECT /taches?groupe=priorite',
    );

    expect(await getTaskByRef(paul, task.ref)).toBeNull();
  });

  it('ne supprime rien d’une autre organisation', async () => {
    const { paul, zoe, task } = await setup();
    vi.mocked(requireUserContext).mockResolvedValue(zoe);

    await expect(deleteTaskAction(task.id, '')).rejects.toThrow('NEXT_REDIRECT /taches');

    expect(await getTaskByRef(paul, task.ref)).not.toBeNull();
  });
});

describe('changeProjectAction', () => {
  it('donne un nouveau numéro à la tâche et mène à sa nouvelle page', async () => {
    const { paul, task } = await setup();
    const ops = await createProject(paul, { name: 'Opérations', key: 'OPS' });

    await expect(changeProjectAction(task.id, ops.id, 'tri=echeance')).rejects.toThrow(
      `NEXT_REDIRECT /taches/OPS-1?retour=${encodeURIComponent('tri=echeance')}`,
    );

    expect(await getTaskByRef(paul, task.ref)).toBeNull();
    expect(await getTaskByRef(paul, 'OPS-1')).toMatchObject({ id: task.id });
  });

  it('refuse le projet d’une autre organisation, sans rediriger', async () => {
    const { paul, zoeProjectId, task } = await setup();

    await expect(changeProjectAction(task.id, zoeProjectId, '')).resolves.toEqual({
      ok: false,
      error: 'Projet introuvable.',
    });

    expect(await getTaskByRef(paul, task.ref)).not.toBeNull();
  });
});

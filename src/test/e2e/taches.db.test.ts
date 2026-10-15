import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addCommentAction } from '@/app/(taches)/taches/[ref]/actions';
import { createTaskAction, updateTaskAction } from '@/app/(taches)/taches/actions';
import { DEFAULT_VIEW_CONFIG, type ViewConfig } from '@/lib/tasks/view-config';
import { requireUserContext } from '@/server/auth/session';
import { listActivity } from '@/server/tasks/activity';
import { listTasks } from '@/server/tasks/task-list';
import { getTaskByRef } from '@/server/tasks/tasks';
import { call, closeClients, connect } from '@/test/mcp-client';
import { readTask, seedTasksScenario } from '@/test/tasks-scenario';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(closeClients);

// Tous les statuts : la vue par défaut cache les tâches terminées.
const EVERY_STATUS: ViewConfig = {
  ...DEFAULT_VIEW_CONFIG,
  filters: { ...DEFAULT_VIEW_CONFIG.filters, statuses: [] },
};

it('suit une tâche de sa création à sa fin, entre l’interface et un agent, sans rien montrer à une autre organisation', async () => {
  const { paul, marie, zoe, projectId, status, label } = await seedTasksScenario();

  // Interface : Paul crée la tâche, avec ses actions serveur.
  vi.mocked(requireUserContext).mockResolvedValue(paul);
  const created = await createTaskAction({
    title: 'Brancher la facturation',
    descriptionMd: 'Relier le devis à la facture.',
    projectId,
    priority: 'high',
    labelIds: [label.Fonctionnalité],
  });
  expect(created).toEqual({ ok: true, ref: 'ATE-1' });
  const task = await getTaskByRef(paul, 'ATE-1');
  if (!task) throw new Error('tâche créée introuvable');

  // Agent : Marie la retrouve par MCP, la démarre et la commente.
  const marieMcp = await connect(marie);
  const listed = await call(marieMcp, 'task_list');
  expect(listed.text).toContain('ATE-1 · Backlog · Haute · ');
  expect(listed.text).toContain('Brancher la facturation');
  const started = await call(marieMcp, 'task_start', { ref: 'ATE-1' });
  expect(started.structuredContent).toMatchObject({
    ref: 'ATE-1',
    branch: 'marie/ate-1-brancher-la-facturation',
    status: 'En cours',
  });
  const read = await call(marieMcp, 'task_get', { ref: 'ATE-1' });
  expect(read.text).toContain('Relier le devis à la facture.');
  await call(marieMcp, 'task_comment', { ref: 'ATE-1', texte: 'Branche créée, je commence.' });

  // Interface : Paul voit le travail de Marie, répond, puis termine la tâche.
  const seen = await listTasks(paul, EVERY_STATUS, new Date());
  expect(seen.rows).toMatchObject([
    {
      ref: 'ATE-1',
      statusLabel: 'En cours',
      assignee: { id: marie.userId },
      labels: [{ name: 'Fonctionnalité' }],
    },
  ]);
  expect(await addCommentAction(task.id, 'Merci, je relis demain.')).toEqual({ ok: true });
  expect(await updateTaskAction(task.id, { statusId: status.Terminé })).toEqual({ ok: true });

  const done = await getTaskByRef(paul, 'ATE-1');
  expect(done).toMatchObject({ statusLabel: 'Terminé', statusCategory: 'done' });
  expect((await readTask(task.id)).completedAt).not.toBeNull();

  // Le journal dit qui a fait quoi : l'agent avec le nom de son client, Paul sans.
  const activity = await listActivity(paul, task.id);
  expect(activity.map(({ kind, actorKind, client }) => [kind, actorKind, client])).toEqual([
    ['created', 'user', null],
    ['assignee', 'agent', 'claude-code'],
    ['status', 'agent', 'claude-code'],
    ['comment', 'agent', 'claude-code'],
    ['comment', 'user', null],
    ['status', 'user', null],
  ]);
  expect(activity.filter((item) => item.kind === 'comment').map((item) => item.body)).toEqual([
    'Branche créée, je commence.',
    'Merci, je relis demain.',
  ]);

  // Zoé, d'une autre organisation, ne voit ni ne touche rien, par l'interface comme par MCP.
  vi.mocked(requireUserContext).mockResolvedValue(zoe);
  expect(await listTasks(zoe, EVERY_STATUS, new Date())).toEqual({ rows: [], hiddenCount: 0 });
  expect(await getTaskByRef(zoe, 'ATE-1')).toBeNull();
  expect(await listActivity(zoe, task.id)).toEqual([]);
  const refused = { ok: false, error: 'Tâche introuvable.' };
  expect(await updateTaskAction(task.id, { priority: 'low' })).toEqual(refused);
  expect(await addCommentAction(task.id, 'Intrus')).toEqual(refused);
  const zoeMcp = await connect(zoe);
  expect((await call(zoeMcp, 'task_list')).text).toBe('Aucune tâche ne correspond.');
  expect(await call(zoeMcp, 'task_get', { ref: 'ATE-1' })).toMatchObject({
    isError: true,
    text: 'Tâche introuvable : ATE-1.',
  });
  expect(await call(zoeMcp, 'task_start', { ref: 'ATE-1' })).toMatchObject({ isError: true });

  // Rien n'a bougé pour Paul.
  const unchanged = await readTask(task.id);
  expect(unchanged).toMatchObject({ priority: 'high', assigneeId: marie.userId });
  expect(await listActivity(paul, task.id)).toHaveLength(activity.length);
});

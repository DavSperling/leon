'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { COMMENT_MAX_CHARS } from '@/lib/tasks/limits';
import { backHref, cleanListQuery, taskHref } from '@/lib/tasks/task-links';
import { addComment } from '@/server/tasks/activity';
import { deleteTasks, getTaskRef, updateTask } from '@/server/tasks/tasks';
import { type ActionFailure, type ActionResult, run } from '../run-action';

// Les actions propres à la page d'une tâche. Les modifications de ses propriétés passent par
// updateTaskAction (../actions.ts), comme sur une ligne de la liste.

const Id = z.uuid();
// La requête de la liste d'où l'on vient : la page l'a déjà nettoyée, l'action le refait.
const ReturnQuery = z.string().max(2_000);

const AddCommentSchema = z.strictObject({
  taskId: Id,
  body: z.string().trim().min(1).max(COMMENT_MAX_CHARS),
});
const DeleteTaskSchema = z.strictObject({ id: Id, returnQuery: ReturnQuery });
const ChangeProjectSchema = z.strictObject({ id: Id, projectId: Id, returnQuery: ReturnQuery });

export async function addCommentAction(taskId: string, body: string): Promise<ActionResult> {
  return run('add_comment', AddCommentSchema, { taskId, body }, async (ctx, data) => {
    await addComment(ctx, data.taskId, data.body, { kind: 'user', userId: ctx.userId });
    return {};
  });
}

// Une tâche supprimée n'a plus de page : l'action mène à la liste d'où l'on vient, au lieu de
// laisser la page se rafraîchir sur un « introuvable ». Sur un succès, la promesse du client est
// rejetée par Next, qui mène la navigation (safely la laisse passer) : seule une erreur est rendue.
export async function deleteTaskAction(id: string, returnQuery: string): Promise<ActionFailure> {
  const result = await run(
    'delete_task',
    DeleteTaskSchema,
    { id, returnQuery },
    async (ctx, data) => {
      await deleteTasks(ctx, [data.id]);
      return {};
    },
  );
  if (!result.ok) return result;
  redirect(backHref(returnQuery));
}

// Changer de projet donne à la tâche un nouveau numéro, donc une nouvelle adresse : l'action mène à
// la page sous sa nouvelle référence. Comme pour la suppression, seule une erreur est rendue.
export async function changeProjectAction(
  id: string,
  projectId: string,
  returnQuery: string,
): Promise<ActionFailure> {
  const input = { id, projectId, returnQuery };
  const result = await run('change_project', ChangeProjectSchema, input, async (ctx, data) => {
    await updateTask(
      ctx,
      data.id,
      { projectId: data.projectId },
      { kind: 'user', userId: ctx.userId },
    );
    return { ref: await getTaskRef(ctx, data.id) };
  });
  if (!result.ok) return result;
  redirect(result.ref ? taskHref(result.ref, cleanListQuery(returnQuery)) : backHref(returnQuery));
}

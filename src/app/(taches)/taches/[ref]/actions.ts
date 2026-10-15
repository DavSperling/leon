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
const Retour = z.string().max(2_000);

const AddCommentSchema = z.strictObject({
  taskId: Id,
  body: z.string().trim().min(1).max(COMMENT_MAX_CHARS),
});
const DeleteTaskSchema = z.strictObject({ id: Id, retour: Retour });
const ChangeProjectSchema = z.strictObject({ id: Id, projectId: Id, retour: Retour });

export async function addCommentAction(taskId: string, body: string): Promise<ActionResult> {
  return run('add_comment', AddCommentSchema, { taskId, body }, async (ctx, data) => {
    await addComment(ctx, data.taskId, data.body, { kind: 'user', userId: ctx.userId });
    return {};
  });
}

// Une tâche supprimée n'a plus de page : l'action mène à la liste d'où l'on vient, au lieu de
// laisser la page se rafraîchir sur un « introuvable ». Seule une erreur revient au client ;
// une redirection ne rend rien.
export async function deleteTaskAction(id: string, retour: string): Promise<ActionFailure> {
  const result = await run('delete_task', DeleteTaskSchema, { id, retour }, async (ctx, data) => {
    await deleteTasks(ctx, [data.id]);
    return {};
  });
  if (!result.ok) return result;
  redirect(backHref(retour));
}

// Changer de projet donne à la tâche un nouveau numéro, donc une nouvelle adresse : l'action mène à
// la page sous sa nouvelle référence. Seule une erreur revient au client.
export async function changeProjectAction(
  id: string,
  projectId: string,
  retour: string,
): Promise<ActionFailure> {
  const input = { id, projectId, retour };
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
  redirect(result.ref ? taskHref(result.ref, cleanListQuery(retour)) : backHref(retour));
}

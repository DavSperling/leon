import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { COMMENT_MAX_CHARS } from '@/lib/tasks/limits';
import type { TenantContext } from '@/server/auth/tenant-context';
import { addComment } from '@/server/tasks/activity';
import { guarded } from './guarded';
import { findTask } from './task-fields';
import { writeResult } from './task-result';

const InputSchema = z.object({
  ref: z.string().max(20).describe('Identifiant de la tâche (LEO-12).'),
  texte: z.string().trim().min(1).max(COMMENT_MAX_CHARS).describe('Commentaire en Markdown.'),
});

export function registerTaskCommentTool(
  server: McpServer,
  ctx: TenantContext,
  client: string,
): void {
  server.registerTool(
    'task_comment',
    {
      title: 'Commenter une tâche',
      description: 'Ajoute un commentaire à une tâche, signé de l’agent.',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('task_comment', async ({ ref, texte }) => {
      const task = await findTask(ctx, ref);
      await addComment(ctx, task.id, texte, { kind: 'agent', userId: ctx.userId, client });
      return writeResult(`Commentaire ajouté à ${task.ref}.`, task.ref);
    }),
  );
}

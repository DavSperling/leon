import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { branchName } from '@/lib/tasks/ref';
import type { TenantContext } from '@/server/auth/tenant-context';
import { getViewerProfile } from '@/server/auth/viewer';
import { oneLine } from '@/server/memory/labels';
import { firstNameOf } from '@/server/tasks/members';
import { listStatuses } from '@/server/tasks/statuses';
import { updateTask } from '@/server/tasks/tasks';
import { guarded, ToolInputError } from './guarded';
import { findTask } from './task-fields';
import { writeResult } from './task-result';

const InputSchema = z.object({
  ref: z.string().max(20).describe('Identifiant de la tâche (LEO-12).'),
});

export function registerTaskStartTool(server: McpServer, ctx: TenantContext, client: string): void {
  server.registerTool(
    'task_start',
    {
      title: 'Démarrer une tâche',
      description:
        'À appeler avant de coder : assigne la tâche à l’utilisateur, la passe au premier statut « en cours » (elle y reste si elle y est déjà) et renvoie le nom de la branche à créer.',
      inputSchema: InputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    guarded('task_start', async ({ ref }) => {
      const task = await findTask(ctx, ref);
      const status =
        task.statusCategory === 'started'
          ? { id: task.statusId, label: task.statusLabel }
          : (await listStatuses(ctx, task.projectId)).find((s) => s.category === 'started');
      if (!status) throw new ToolInputError('Ce projet n’a pas de statut « en cours ».');
      await updateTask(
        ctx,
        task.id,
        { assigneeId: ctx.userId, statusId: status.id },
        { kind: 'agent', userId: ctx.userId, client },
      );
      const { userName } = await getViewerProfile(ctx);
      const branch = branchName(task.ref, task.title, firstNameOf(userName));
      return writeResult(
        `Tâche ${task.ref} démarrée : assignée à vous, statut « ${oneLine(status.label)} ».\nBranche : ${branch}`,
        task.ref,
        { branch, status: status.label },
      );
    }),
  );
}

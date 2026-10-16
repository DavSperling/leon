import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listActivity } from '@/server/tasks/activity';
import { listLabels } from '@/server/tasks/labels';
import { listStatuses } from '@/server/tasks/statuses';
import { renderTaskMarkdown } from '@/server/tasks/task-markdown';
import { taskUrl } from '@/server/tasks/task-url';
import { guarded } from './guarded';
import { findTask } from './task-fields';

const InputSchema = z.object({
  ref: z.string().max(20).describe('Identifiant de la tâche (LEO-12).'),
});

export function registerTaskGetTool(server: McpServer, ctx: TenantContext): void {
  server.registerTool(
    'task_get',
    {
      title: 'Lire une tâche',
      description:
        'Lit une tâche par son identifiant : propriétés, description, sous-tâches, derniers commentaires, et les statuts et étiquettes disponibles à utiliser avec task_update.',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('task_get', async ({ ref }) => {
      const task = await findTask(ctx, ref);
      const [activity, statuses, labels] = await Promise.all([
        listActivity(ctx, task.id),
        listStatuses(ctx, task.projectId),
        listLabels(ctx),
      ]);
      const text = renderTaskMarkdown({ task, activity, statuses, labels });
      return {
        content: [{ type: 'text', text }],
        structuredContent: { ref: task.ref, title: task.title, url: taskUrl(task.ref), text },
      };
    }),
  );
}

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createTask, type TaskDetail } from '@/server/tasks/tasks';
import { guarded, ToolInputError } from './guarded';
import {
  assigneeIdOf,
  clearable,
  findTask,
  LabelNames,
  labelIdsOf,
  pickProject,
  priorityOf,
  projectsOf,
  statusIdOf,
  TaskFields,
  TaskTitle,
} from './task-fields';
import { writeResult } from './task-result';

const InputSchema = z.object({
  titre: TaskTitle.describe('Titre court de la tâche.'),
  ...TaskFields,
  etiquettes: LabelNames.optional().describe('Noms d’étiquettes existantes.'),
});

// Une sous-tâche vit dans le projet de son parent : en demander un autre est refusé, pas ignoré.
async function projectIdOf(
  ctx: TenantContext,
  key: string | undefined,
  parent: TaskDetail | null,
): Promise<string> {
  if (parent && key === undefined) return parent.projectId;
  const project = pickProject(await projectsOf(ctx), key);
  if (parent && project.id !== parent.projectId) {
    throw new ToolInputError(
      `Une sous-tâche reste dans le projet de son parent (${parent.projectKey}).`,
    );
  }
  return project.id;
}

export function registerTaskCreateTool(
  server: McpServer,
  ctx: TenantContext,
  client: string,
): void {
  server.registerTool(
    'task_create',
    {
      title: 'Créer une tâche',
      description:
        'Crée une tâche. Sans projet : celui du parent (une sous-tâche reste dans le projet de son parent), sinon l’unique projet de l’organisation. Sans statut : le premier du backlog. Les étiquettes doivent exister : task_get les liste.',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('task_create', async (input: z.infer<typeof InputSchema>) => {
      const parentRef = clearable(input.parent);
      const parent = parentRef ? await findTask(ctx, parentRef) : null;
      const projectId = await projectIdOf(ctx, input.projet, parent);
      const created = await createTask(
        ctx,
        {
          title: input.titre,
          descriptionMd: input.description,
          projectId,
          parentId: parent?.id,
          statusId: await statusIdOf(ctx, projectId, input.statut),
          priority: priorityOf(input.priorite),
          assigneeId: await assigneeIdOf(ctx, input.assigne),
          dueDate: clearable(input.echeance),
          labelIds: await labelIdsOf(ctx, input.etiquettes),
        },
        { kind: 'agent', userId: ctx.userId, client },
      );
      return writeResult(`Tâche ${created.ref} créée.`, created.ref);
    }),
  );
}

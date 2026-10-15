import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listActivity } from '@/server/tasks/activity';
import { isEmptyPatch } from '@/server/tasks/errors';
import { type TaskDetail, type TaskPatch, updateTask } from '@/server/tasks/tasks';
import { guarded, ToolInputError } from './guarded';
import {
  assigneeIdOf,
  clearable,
  findTask,
  LabelNames,
  labelIdsOf,
  parentIdOf,
  pickProject,
  priorityOf,
  projectsOf,
  statusIdOf,
  TaskFields,
  TaskTitle,
} from './task-fields';
import { writeResult } from './task-result';

const InputSchema = z.object({
  ref: z.string().max(20).describe('Identifiant de la tâche (LEO-12).'),
  titre: TaskTitle.optional().describe('Nouveau titre.'),
  ...TaskFields,
  etiquettes_ajout: LabelNames.optional().describe('Étiquettes à ajouter (les autres restent).'),
  etiquettes_retrait: LabelNames.optional().describe('Étiquettes à retirer.'),
});
type Input = z.infer<typeof InputSchema>;

// Seuls les champs donnés changent. Les statuts se lisent dans le projet visé, s'il change.
async function patchOf(ctx: TenantContext, task: TaskDetail, input: Input): Promise<TaskPatch> {
  const target =
    input.projet === undefined ? undefined : pickProject(await projectsOf(ctx), input.projet);
  return {
    title: input.titre,
    descriptionMd: input.description,
    projectId: target?.id,
    statusId: await statusIdOf(ctx, target?.id ?? task.projectId, input.statut),
    priority: priorityOf(input.priorite),
    assigneeId: await assigneeIdOf(ctx, input.assigne),
    dueDate: clearable(input.echeance),
    parentId: await parentIdOf(ctx, input.parent),
    addLabelIds: await labelIdsOf(ctx, input.etiquettes_ajout),
    removeLabelIds: await labelIdsOf(ctx, input.etiquettes_retrait),
  };
}

// Un changement de projet donne un nouveau numéro : l'identifiant courant se relit dans le fil.
async function currentRef(ctx: TenantContext, task: TaskDetail): Promise<string> {
  const [first] = await listActivity(ctx, task.id);
  return first?.taskRef ?? task.ref;
}

export function registerTaskUpdateTool(
  server: McpServer,
  ctx: TenantContext,
  client: string,
): void {
  server.registerTool(
    'task_update',
    {
      title: 'Modifier une tâche',
      description:
        'Modifie les champs donnés d’une tâche, les autres restent. La description remplace la précédente. Changer de projet donne un nouvel identifiant.',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    guarded('task_update', async (input: Input) => {
      const task = await findTask(ctx, input.ref);
      const patch = await patchOf(ctx, task, input);
      if (isEmptyPatch(patch)) {
        throw new ToolInputError('Rien à modifier : précisez au moins un champ.');
      }
      await updateTask(ctx, task.id, patch, { kind: 'agent', userId: ctx.userId, client });
      if (patch.projectId === undefined || patch.projectId === task.projectId) {
        return writeResult(`Tâche ${task.ref} modifiée.`, task.ref);
      }
      const ref = await currentRef(ctx, task);
      return writeResult(`Tâche ${task.ref} déplacée : elle s’appelle désormais ${ref}.`, ref);
    }),
  );
}

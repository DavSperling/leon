import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { TASK_STATUS_CATEGORIES } from '@/lib/enums';
import { groupTasks } from '@/lib/tasks/group';
import { DUE_FILTER_LABELS, EMPTY_GROUP_LABELS, PRIORITY_LABELS } from '@/lib/tasks/labels';
import { DEFAULT_VIEW_CONFIG, type ViewConfig } from '@/lib/tasks/view-config';
import type { TenantContext } from '@/server/auth/tenant-context';
import { oneLine } from '@/server/memory/labels';
import { DATA_GUARD_LINE } from '@/server/memory/render-card';
import { listTasks } from '@/server/tasks/task-list';
import type { TaskRow } from '@/server/tasks/task-row';
import { taskUrl } from '@/server/tasks/task-url';
import { guarded } from './guarded';
import { labelIdsOf, pickProject, projectsOf } from './task-fields';

const InputSchema = z.object({
  projet: z.string().max(10).optional().describe('Clé du projet (LEO).'),
  statut: z
    .array(z.enum(TASK_STATUS_CATEGORIES))
    .max(TASK_STATUS_CATEGORIES.length)
    .optional()
    .describe('Catégories de statut. Sans elles : les tâches ouvertes (backlog, todo, started).'),
  assigne: z.enum(['moi', 'aucun']).optional().describe('« moi » ou « aucun » (sans assigné).'),
  etiquette: z.string().max(40).optional().describe('Nom d’une étiquette.'),
  q: z.string().max(100).optional().describe('Texte cherché dans le titre ou l’identifiant.'),
  limite: z.number().int().min(1).max(100).optional().describe('Nombre de tâches (20 par défaut).'),
});
type Input = z.infer<typeof InputSchema>;

const DEFAULT_LIMIT = 20;
const LIST_MAX_CHARS = 4_000;
// Place de l'en-tête, de la ligne de garde et de la mention de troncature.
const LIST_FRAME_CHARS = 400;
const ASSIGNEE_FILTER = { moi: 'me', aucun: 'none' } as const;
const NO_CONTEXT = { statuses: [], members: [], labels: [], projects: [] };

async function viewOf(ctx: TenantContext, input: Input): Promise<ViewConfig> {
  const { filters } = DEFAULT_VIEW_CONFIG;
  const projectId =
    input.projet === undefined ? null : pickProject(await projectsOf(ctx), input.projet).id;
  const labelIds = await labelIdsOf(
    ctx,
    input.etiquette === undefined ? undefined : [input.etiquette],
  );
  return {
    ...DEFAULT_VIEW_CONFIG,
    filters: {
      ...filters,
      statuses: input.statut ?? filters.statuses,
      assignee: input.assigne ? ASSIGNEE_FILTER[input.assigne] : null,
      labelId: labelIds?.[0] ?? null,
      projectId,
      q: input.q ?? '',
    },
  };
}

// Les plus urgentes d'abord, à égalité dans l'ordre manuel.
function byPriority(rows: TaskRow[]): TaskRow[] {
  const config = { groupBy: 'none', orderBy: 'priority', showEmptyGroups: false } as const;
  return groupTasks(rows, config, NO_CONTEXT)[0]?.rows ?? [];
}

function lineOf(row: TaskRow): string {
  return [
    row.ref,
    oneLine(row.statusLabel),
    PRIORITY_LABELS[row.priority],
    row.assignee ? oneLine(row.assignee.name) : EMPTY_GROUP_LABELS.assignee,
    row.dueDate ?? DUE_FILTER_LABELS.none,
    oneLine(row.title),
  ].join(' · ');
}

function structured(row: TaskRow) {
  return {
    ref: row.ref,
    title: row.title,
    status: row.statusLabel,
    category: row.statusCategory,
    priority: row.priority,
    assignee: row.assignee?.name ?? null,
    dueDate: row.dueDate,
    labels: row.labels.map((label) => label.name),
    url: taskUrl(row.ref),
  };
}

// Combien de lignes tiennent dans le plafond, une fois la place du cadre réservée.
function fittingCount(lines: readonly string[]): number {
  let used = 0;
  let count = 0;
  for (const line of lines) {
    used += line.length + 1;
    if (used > LIST_MAX_CHARS - LIST_FRAME_CHARS) break;
    count++;
  }
  return count;
}

function listText(lines: readonly string[], total: number): string {
  if (lines.length === 0) return 'Aucune tâche ne correspond.';
  const rest = total - lines.length;
  return [
    rest > 0 ? `${lines.length} tâche(s) sur ${total} :` : `${total} tâche(s) :`,
    DATA_GUARD_LINE,
    ...lines,
    ...(rest > 0
      ? [`… ${rest} autre(s) non affichée(s) : affinez avec projet, statut, etiquette ou q.`]
      : []),
  ].join('\n');
}

export function registerTaskListTool(server: McpServer, ctx: TenantContext): void {
  server.registerTool(
    'task_list',
    {
      title: 'Lister les tâches',
      description:
        'Liste les tâches visibles par l’utilisateur, les plus urgentes d’abord : identifiant, statut, priorité, assigné, échéance, titre. Sans filtre de statut, seules les tâches ouvertes sont listées.',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('task_list', async (input: Input) => {
      const { rows } = await listTasks(ctx, await viewOf(ctx, input), new Date());
      const sorted = byPriority(rows);
      const wanted = sorted.slice(0, input.limite ?? DEFAULT_LIMIT);
      const lines = wanted.map(lineOf);
      const count = fittingCount(lines);
      return {
        content: [{ type: 'text', text: listText(lines.slice(0, count), sorted.length) }],
        structuredContent: { total: sorted.length, tasks: wanted.slice(0, count).map(structured) },
      };
    }),
  );
}

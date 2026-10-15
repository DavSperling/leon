import type { Metadata } from 'next';
import { z } from 'zod';
import { CreateTaskProvider } from '@/components/tasks/create-task-provider';
import { groupStatuses, type ListContext } from '@/components/tasks/list-context';
import { TaskList } from '@/components/tasks/task-list';
import { ViewToolbar } from '@/components/tasks/view-toolbar';
import { groupTasks } from '@/lib/tasks/group';
import { parseViewParams } from '@/lib/tasks/view-config';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listLabels } from '@/server/tasks/labels';
import { listMembers } from '@/server/tasks/members';
import { listProjects } from '@/server/tasks/projects';
import { listStatuses } from '@/server/tasks/statuses';
import { listTasks } from '@/server/tasks/task-list';
import { getTeamDefaultConfig, getView } from '@/server/tasks/views';

export const metadata: Metadata = { title: 'Tâches' };

type SearchParams = Record<string, string | string[] | undefined>;

// La vue enregistrée que `?vue=` ouvre ; un identifiant absent, mal formé ou inconnu n'en ouvre aucune.
async function openedView(ctx: TenantContext, params: SearchParams) {
  const id = z.uuid().safeParse([params.vue].flat()[0]);
  return id.success ? getView(ctx, id.data) : null;
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireUserContext();
  const now = new Date();
  const view = await openedView(ctx, params);
  const base = view?.config ?? (await getTeamDefaultConfig(ctx));
  const config = parseViewParams(params, base);
  const [list, statuses, members, labels, projects] = await Promise.all([
    listTasks(ctx, config, now),
    listStatuses(ctx),
    listMembers(ctx),
    listLabels(ctx),
    listProjects(ctx),
  ]);
  const context: ListContext = {
    statuses,
    members: members.map(({ id, name, initials }) => ({ id, name, initials })),
    labels,
    projects,
    viewerId: ctx.userId,
  };
  // Seuls les groupes se limitent au projet filtré et distinguent les statuts de même nom de deux
  // projets (« Backlog · LEO ») ; la création rapide a besoin des statuts de tous les projets.
  const groupContext = { ...context, statuses: groupStatuses(statuses, projects, config) };
  return (
    <CreateTaskProvider config={config} context={context} now={now}>
      <ViewToolbar viewName={view?.name ?? null} config={config} base={base} context={context} />
      <TaskList
        groups={groupTasks(list.rows, config, groupContext)}
        config={config}
        base={base}
        hiddenCount={list.hiddenCount}
        context={context}
        now={now}
      />
    </CreateTaskProvider>
  );
}

import type { Metadata } from 'next';
import { z } from 'zod';
import { BreakdownPanel } from '@/components/tasks/breakdown-panel';
import { CreateTaskProvider } from '@/components/tasks/create-task-provider';
import { groupStatuses, type ListContext, type OpenView } from '@/components/tasks/list-context';
import { MyActivity } from '@/components/tasks/my-activity';
import { TaskBoard } from '@/components/tasks/task-board';
import { TaskList } from '@/components/tasks/task-list';
import { TaskShortcuts } from '@/components/tasks/task-shortcuts';
import type { SavedView } from '@/components/tasks/view-bar';
import { ViewToolbar } from '@/components/tasks/view-toolbar';
import { groupTasks } from '@/lib/tasks/group';
import { parseViewParams, type ViewConfig } from '@/lib/tasks/view-config';
import { viewContextOf } from '@/lib/tasks/view-context';
import { cn } from '@/lib/utils';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listMyActivity } from '@/server/tasks/activity';
import { listLabels } from '@/server/tasks/labels';
import { listMembers } from '@/server/tasks/members';
import { listProjects } from '@/server/tasks/projects';
import { listStatuses } from '@/server/tasks/statuses';
import { countBreakdown, listTasks } from '@/server/tasks/task-list';
import { getTeamDefaultConfig, getView, listViews, type ViewRow } from '@/server/tasks/views';

export const metadata: Metadata = { title: 'Tâches' };

type SearchParams = Record<string, string | string[] | undefined>;

// La vue enregistrée que `?vue=` ouvre ; un identifiant absent, mal formé ou inconnu n'en ouvre aucune.
async function openedView(ctx: TenantContext, params: SearchParams) {
  const id = z.uuid().safeParse([params.vue].flat()[0]);
  return id.success ? getView(ctx, id.data) : null;
}

// Ce que la barre d'outils sait de la vue ouverte ; seul l'auteur l'enregistre, la renomme, la supprime.
const toOpenView = (ctx: TenantContext, view: ViewRow): OpenView => ({
  id: view.id,
  name: view.name,
  team: view.team,
  isTeamDefault: view.isTeamDefault,
  owned: view.ownerId === ctx.userId,
});

// Les onglets d'un contexte sont les vues enregistrées que ses filtres désignent ; la configuration
// d'une vue ne part pas au client.
const toSavedView = ({ id, name, config }: ViewRow): SavedView => ({
  id,
  name,
  context: viewContextOf(config),
});

const ACTIVITY_LIMIT = 50;

// Mes tâches, onglet Activité : le fil des derniers événements, sans liste ni filtres.
async function ActivityPage({ ctx, now }: { ctx: TenantContext; now: Date }) {
  const [items, members, views] = await Promise.all([
    listMyActivity(ctx, ACTIVITY_LIMIT),
    listMembers(ctx),
    listViews(ctx),
  ]);
  return <MyActivity items={items} members={members} views={views.map(toSavedView)} now={now} />;
}

// Ce que la liste affiche : les tâches, de quoi les décrire (statuts, membres, étiquettes, projets)
// et, quand l'affichage le demande, la répartition.
async function loadList(ctx: TenantContext, config: ViewConfig, now: Date) {
  const [list, statuses, members, labels, projects, breakdown] = await Promise.all([
    listTasks(ctx, config, now),
    listStatuses(ctx),
    listMembers(ctx),
    listLabels(ctx),
    listProjects(ctx),
    config.showBreakdown ? countBreakdown(ctx, config, now) : null,
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
  return { list, context, groupContext, breakdown };
}

type ListPageProps = { ctx: TenantContext; params: SearchParams; now: Date };

async function ListPage({ ctx, params, now }: ListPageProps) {
  const [view, views] = await Promise.all([openedView(ctx, params), listViews(ctx)]);
  const base = view?.config ?? (await getTeamDefaultConfig(ctx));
  const config = parseViewParams(params, base);
  const { list, context, groupContext, breakdown } = await loadList(ctx, config, now);
  const View = config.layout === 'board' ? TaskBoard : TaskList;
  return (
    <CreateTaskProvider projectId={config.filters.projectId} context={context} now={now}>
      <TaskShortcuts />
      {/* Le tableau remplit la hauteur de la page : chaque colonne défile seule. La liste la remplit
          au moins, pour que la barre d'actions groupées colle au bas de la page. */}
      <div className={cn('flex', config.layout === 'board' ? 'h-full' : 'min-h-full')}>
        <div className="flex min-w-0 flex-1 flex-col">
          <ViewToolbar
            view={view && toOpenView(ctx, view)}
            views={views.map(toSavedView)}
            config={config}
            base={base}
            context={context}
          />
          <View
            groups={groupTasks(list.rows, config, groupContext)}
            config={config}
            base={base}
            hiddenCount={list.hiddenCount}
            context={context}
            now={now}
          />
        </div>
        {breakdown && (
          <BreakdownPanel breakdown={breakdown} config={config} base={base} context={context} />
        )}
      </div>
    </CreateTaskProvider>
  );
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireUserContext();
  const now = new Date();
  if ([params.onglet].flat()[0] === 'activite') return <ActivityPage ctx={ctx} now={now} />;
  return <ListPage ctx={ctx} params={params} now={now} />;
}

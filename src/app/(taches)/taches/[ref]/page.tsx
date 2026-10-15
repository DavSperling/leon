import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActivityFeed } from '@/components/tasks/activity-feed';
import { BackOnEscape } from '@/components/tasks/back-on-escape';
import { CommentForm } from '@/components/tasks/comment-form';
import { DescriptionField } from '@/components/tasks/description-field';
import { type ListContext, projectStatuses } from '@/components/tasks/list-context';
import { SubtaskList } from '@/components/tasks/subtask-list';
import { TaskActions } from '@/components/tasks/task-actions';
import { TaskHeader } from '@/components/tasks/task-header';
import { TaskProperties } from '@/components/tasks/task-properties';
import { TaskTitleField } from '@/components/tasks/task-title-field';
import { formatRelative } from '@/lib/format';
import { backHref, cleanListQuery, RETURN_PARAM } from '@/lib/tasks/task-links';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listActivity } from '@/server/tasks/activity';
import { listLabels } from '@/server/tasks/labels';
import { listMembers } from '@/server/tasks/members';
import { listProjects } from '@/server/tasks/projects';
import { listStatuses } from '@/server/tasks/statuses';
import { renderTaskMarkdown } from '@/server/tasks/task-markdown';
import { getTaskByRef } from '@/server/tasks/tasks';

export const metadata: Metadata = { title: 'Tâche' };

type PageProps = {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// L'activité de la tâche et l'entourage des sélecteurs. Les statuts sont ceux de tous les projets :
// une sous-tâche peut être d'un autre projet que son parent, et sa ligne choisit parmi les siens.
async function loadSurroundings(ctx: TenantContext, taskId: string) {
  const [activity, statuses, members, labels, projects] = await Promise.all([
    listActivity(ctx, taskId),
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
  const firstName = members.find((member) => member.id === ctx.userId)?.firstName ?? '';
  return { activity, context, firstName };
}

// Deux colonnes : le titre, la description, les sous-tâches et l'activité ; à droite, les propriétés
// et les actions. Une référence mal formée, inconnue ou invisible donne la même réponse. `retour`
// (la requête de la liste d'où l'on vient) vient de l'URL : cleanListQuery n'en garde que des
// réglages valides.
export default async function TaskPage({ params, searchParams }: PageProps) {
  const [{ ref }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireUserContext();
  const task = await getTaskByRef(ctx, ref);
  if (!task) notFound();

  const now = new Date();
  const listQuery = cleanListQuery([query[RETURN_PARAM]].flat()[0]);
  const back = backHref(listQuery);
  const { activity, context, firstName } = await loadSurroundings(ctx, task.id);
  const { descriptionMd, subtasks, creator, ...properties } = task;
  const statuses = projectStatuses(context.statuses, task.projectId);
  const agentMarkdown = renderTaskMarkdown({ task, activity, statuses, labels: context.labels });

  return (
    <div className="@container flex min-h-full flex-col">
      <BackOnEscape href={back} />
      <TaskHeader task={task} back={back} listQuery={listQuery} />
      <div className="flex flex-1 flex-col @2xl:flex-row">
        <div className="min-w-0 flex-1 px-5 py-6 @2xl:px-10 @2xl:py-8">
          <div className="mx-auto max-w-[720px] space-y-8">
            <div className="space-y-2">
              <TaskTitleField task={{ id: task.id, title: task.title }} />
              <DescriptionField key={task.id} taskId={task.id} value={descriptionMd} />
            </div>
            <SubtaskList
              parentId={task.id}
              subtasks={subtasks}
              doneCount={task.subtaskDoneCount}
              context={context}
              listQuery={listQuery}
            />
            <section aria-labelledby="activite" className="space-y-4">
              <h2 id="activite" className="text-sm font-medium">
                Activité
              </h2>
              <ActivityFeed items={activity} members={context.members} now={now} />
              <CommentForm taskId={task.id} />
            </section>
          </div>
        </div>
        <aside
          aria-label="Propriétés et actions"
          className="w-full shrink-0 space-y-4 border-t px-5 py-4 @2xl:w-[280px] @2xl:border-t-0 @2xl:border-l"
        >
          <TaskProperties task={properties} context={context} now={now} listQuery={listQuery} />
          <TaskActions
            task={{ id: task.id, ref: task.ref, title: task.title }}
            firstName={firstName}
            agentMarkdown={agentMarkdown}
            listQuery={listQuery}
          />
          {creator && (
            <p className="text-xs text-muted-foreground">
              Créée par {creator.name} · {formatRelative(task.createdAt, now)}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

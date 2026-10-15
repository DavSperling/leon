'use client';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { formatNumber } from '@/lib/format';
import type { TaskGroup } from '@/lib/tasks/group';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { TaskRow } from '@/server/tasks/task-row';
import { groupPrefill } from './create-draft';
import { useCreateTask } from './create-task-provider';
import type { ListContext } from './list-context';
import { GroupIcon, TaskGroupSection } from './task-group';
import { TaskRowItem } from './task-row';
import { useViewNavigation } from './use-view-navigation';

const NO_FILTERS: ViewConfig['filters'] = {
  statuses: [],
  priority: null,
  assignee: null,
  creator: null,
  labelId: null,
  projectId: null,
  due: null,
  q: '',
};

export const hiddenLabel = (count: number): string =>
  `${formatNumber(count)} ${count > 1 ? 'tâches masquées' : 'tâche masquée'}`;

type TaskListProps = {
  groups: TaskGroup<TaskRow>[];
  config: ViewConfig;
  base: ViewConfig;
  hiddenCount: number; // tâches visibles que les filtres et l'affichage écartent
  context: ListContext;
  now: Date;
};

// La liste : groupes repliables, lignes modifiables sur place, puis le nombre de tâches masquées. Les groupes
// arrivent déjà ordonnés (groupTasks, côté serveur). La disposition « tableau » vient plus tard.
export function TaskList({ groups, config, base, hiddenCount, context, now }: TaskListProps) {
  const navigate = useViewNavigation(base);
  const openCreate = useCreateTask();
  const showAll = () => navigate({ ...config, showSubtasks: true, filters: NO_FILTERS });
  const projectNames = new Map(context.projects.map((project) => [project.id, project.name]));

  if (!groups.some((group) => group.rows.length > 0)) {
    return (
      <div className="px-5">
        {hiddenCount > 0 ? (
          <EmptyState
            reason="Aucune tâche ne correspond."
            nextStep={`${hiddenLabel(hiddenCount)} par les filtres ou l'affichage.`}
          >
            <Button variant="outline" size="sm" onClick={showAll}>
              Tout afficher
            </Button>
          </EmptyState>
        ) : (
          <EmptyState reason="Aucune tâche." nextStep="Créez la première pour démarrer.">
            <Button variant="outline" size="sm" onClick={() => openCreate()}>
              Créer une tâche
              <Kbd>C</Kbd>
            </Button>
          </EmptyState>
        )}
      </div>
    );
  }
  return (
    <div className="@container pb-10">
      {groups.map((group) => (
        <TaskGroupSection
          key={group.key}
          label={group.label}
          count={group.rows.length}
          icon={<GroupIcon groupBy={config.groupBy} groupKey={group.key} context={context} />}
          onCreate={() => openCreate(groupPrefill(config.groupBy, group.key, context))}
        >
          {group.rows.map((row) => (
            <TaskRowItem
              key={row.id}
              row={row}
              properties={config.properties}
              projectName={projectNames.get(row.projectId) ?? row.projectKey}
              context={context}
              now={now}
            />
          ))}
        </TaskGroupSection>
      ))}
      {hiddenCount > 0 && (
        <p className="flex items-center justify-center gap-1 pt-6 text-sm text-muted-foreground">
          {hiddenLabel(hiddenCount)}
          <Button variant="link" size="sm" onClick={showAll}>
            Tout afficher
          </Button>
        </p>
      )}
    </div>
  );
}

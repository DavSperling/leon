'use client';

import type { TaskGroup } from '@/lib/tasks/group';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { TaskRow } from '@/server/tasks/task-row';
import { groupPrefill } from './create-draft';
import { useCreateTask } from './create-task-provider';
import type { ListContext } from './list-context';
import { EmptyList, HiddenFooter } from './list-notices';
import { GroupIcon, TaskGroupSection } from './task-group';
import { TaskRowItem } from './task-row';

type TaskListProps = {
  groups: TaskGroup<TaskRow>[];
  config: ViewConfig;
  base: ViewConfig;
  hiddenCount: number; // tâches visibles que les filtres et l'affichage écartent
  context: ListContext;
  now: Date;
};

// La liste : groupes repliables, lignes modifiables sur place, puis le nombre de tâches masquées. Les groupes
// arrivent déjà ordonnés (groupTasks, côté serveur). La disposition « tableau » est celle de TaskBoard.
export function TaskList({ groups, config, base, hiddenCount, context, now }: TaskListProps) {
  const openCreate = useCreateTask();
  const projectNames = new Map(context.projects.map((project) => [project.id, project.name]));

  if (!groups.some((group) => group.rows.length > 0)) {
    return <EmptyList hiddenCount={hiddenCount} config={config} base={base} />;
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
      {hiddenCount > 0 && <HiddenFooter hiddenCount={hiddenCount} config={config} base={base} />}
    </div>
  );
}

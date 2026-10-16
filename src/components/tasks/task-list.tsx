'use client';

import { useMemo, useState } from 'react';
import type { TaskGroup } from '@/lib/tasks/group';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { TaskRow } from '@/server/tasks/task-row';
import { groupPrefill } from './create-draft';
import { useCreateTask } from './create-task-provider';
import type { ListContext } from './list-context';
import { EmptyList, HiddenFooter } from './list-notices';
import { shownRows } from './selection';
import { SelectionBar } from './selection-bar';
import { SelectionProvider } from './selection-provider';
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

// Les groupes repliés : leurs tâches ne sont plus affichées, donc plus sélectionnables.
function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const setOpen = (key: string, open: boolean) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
  return { collapsed, setOpen };
}

// La liste : groupes repliables, lignes modifiables et cochables sur place, puis le nombre de tâches
// masquées. Les groupes arrivent déjà ordonnés (groupTasks, côté serveur). La disposition « tableau »
// est celle de TaskBoard.
export function TaskList({ groups, config, base, hiddenCount, context, now }: TaskListProps) {
  const openCreate = useCreateTask();
  const { collapsed, setOpen } = useCollapsedGroups();
  const rows = useMemo(() => shownRows(groups, collapsed), [groups, collapsed]);
  const projectNames = new Map(context.projects.map((project) => [project.id, project.name]));

  if (groups.every((group) => group.rows.length === 0)) {
    return <EmptyList hiddenCount={hiddenCount} config={config} base={base} />;
  }
  return (
    <SelectionProvider rows={rows}>
      <div className="@container flex-1 pb-10">
        {groups.map((group) => (
          <TaskGroupSection
            key={group.key}
            label={group.label}
            count={group.rows.length}
            open={!collapsed.has(group.key)}
            onOpenChange={(open) => setOpen(group.key, open)}
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
      <SelectionBar context={context} now={now} />
    </SelectionProvider>
  );
}

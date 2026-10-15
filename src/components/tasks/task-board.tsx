'use client';

import {
  type CollisionDetection,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useId } from 'react';
import type { TaskGroup } from '@/lib/tasks/group';
import type { ViewConfig } from '@/lib/tasks/view-config';
import type { TaskRow } from '@/server/tasks/task-row';
import { boardAnnouncements, SCREEN_READER_INSTRUCTIONS } from './board-announcements';
import { BoardColumn } from './board-column';
import { canDragCards } from './board-move';
import { CardPointerSensor } from './card-pointer-sensor';
import { groupPrefill } from './create-draft';
import { useCreateTask } from './create-task-provider';
import type { ListContext } from './list-context';
import { EmptyList, HiddenFooter } from './list-notices';
import { CardPreview, type CardProps, TaskCard } from './task-card';
import { GroupIcon } from './task-group';
import { useBoardDrag } from './use-board-drag';

// En dessous de cette distance (px), un appui sur la carte est un clic : il ouvre la tâche.
const DRAG_DISTANCE = 6;

// La carte sous le pointeur d'abord ; au clavier, il n'y a pas de pointeur : la plus proche.
const detectCollisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCorners(args);
};

// Les props d'une carte du tableau : ce que la vue affiche, et le nom du projet de la tâche.
function cardPropsOf(config: ViewConfig, context: ListContext, now: Date) {
  const projectNames = new Map(context.projects.map((project) => [project.id, project.name]));
  return (row: TaskRow): CardProps => ({
    row,
    properties: config.properties,
    projectName: projectNames.get(row.projectId) ?? row.projectKey,
    context,
    now,
  });
}

function useBoardSensors() {
  return useSensors(
    useSensor(CardPointerSensor, { activationConstraint: { distance: DRAG_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

type TaskBoardProps = {
  groups: TaskGroup<TaskRow>[];
  config: ViewConfig;
  base: ViewConfig;
  hiddenCount: number; // tâches visibles que les filtres et l'affichage écartent
  context: ListContext;
  now: Date;
};

type BoardColumnsProps = Pick<TaskBoardProps, 'groups' | 'config' | 'context'> & {
  drag: ReturnType<typeof useBoardDrag>;
  cardProps: (row: TaskRow) => CardProps;
};

// Une colonne par groupe. Une carte ne se glisse que si le regroupement et le tri le permettent.
function BoardColumns({ groups, config, context, drag, cardProps }: BoardColumnsProps) {
  const openCreate = useCreateTask();
  const draggable = canDragCards(config.groupBy, config.orderBy);
  return groups.map((group) => {
    const ids = drag.columns[group.key] ?? [];
    const accepting = drag.accepts(group.key);
    return (
      <BoardColumn
        key={group.key}
        columnKey={group.key}
        label={group.label}
        icon={<GroupIcon groupBy={config.groupBy} groupKey={group.key} context={context} />}
        ids={ids}
        accepting={accepting}
        onCreate={() => openCreate(groupPrefill(config.groupBy, group.key, context))}
      >
        {ids.map((id) => {
          const row = drag.rowOf(id);
          return (
            row && (
              <TaskCard key={id} {...cardProps(row)} draggable={draggable} droppable={accepting} />
            )
          );
        })}
      </BoardColumn>
    );
  });
}

// Le tableau : cartes en colonnes, qu'on glisse d'une colonne à l'autre (statut, priorité ou
// assigné) et, en tri manuel, dans leur colonne. Les groupes arrivent déjà ordonnés.
export function TaskBoard({ groups, config, base, hiddenCount, context, now }: TaskBoardProps) {
  const dndId = useId(); // même identifiant côté serveur et côté client : les attributs ARIA concordent
  const sensors = useBoardSensors();
  const drag = useBoardDrag(groups, config, context);
  const cardProps = cardPropsOf(config, context, now);
  const labels = new Map(groups.map((group) => [group.key, group.label]));

  if (!groups.some((group) => group.rows.length > 0)) {
    return <EmptyList hiddenCount={hiddenCount} config={config} base={base} />;
  }
  return (
    <>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={detectCollisions}
        accessibility={{
          announcements: boardAnnouncements(drag.columns, {
            card: (id) => drag.rowOf(id)?.ref ?? '',
            column: (key) => labels.get(key) ?? '',
          }),
          screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
        }}
        {...drag.handlers}
      >
        {/* relative : les textes pour lecteurs d'écran (sr-only) restent dans le tableau, sinon ils élargissent la page */}
        <div
          data-dragging={drag.draggedRow ? '' : undefined}
          className="relative flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 py-4"
        >
          <BoardColumns
            groups={groups}
            config={config}
            context={context}
            drag={drag}
            cardProps={cardProps}
          />
        </div>
        <DragOverlay>
          {drag.draggedRow && <CardPreview {...cardProps(drag.draggedRow)} />}
        </DragOverlay>
      </DndContext>
      {hiddenCount > 0 && (
        <HiddenFooter hiddenCount={hiddenCount} config={config} base={base} className="pt-0 pb-3" />
      )}
    </>
  );
}

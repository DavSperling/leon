'use client';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { formatNumber } from '@/lib/format';
import type { ViewConfig } from '@/lib/tasks/view-config';
import { cn } from '@/lib/utils';
import { useCreateTask } from './create-task-provider';
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

type NoticeProps = {
  hiddenCount: number; // tâches visibles que les filtres et l'affichage écartent
  config: ViewConfig;
  base: ViewConfig;
};

// Retire les filtres et montre les sous-tâches : tout ce que l'affichage cachait réapparaît.
function useShowAll(config: ViewConfig, base: ViewConfig): () => void {
  const navigate = useViewNavigation(base);
  return () => navigate({ ...config, showSubtasks: true, filters: NO_FILTERS });
}

// Ce que la liste et le tableau disent quand ils n'ont aucune tâche à montrer.
export function EmptyList({ hiddenCount, config, base }: NoticeProps) {
  const showAll = useShowAll(config, base);
  const openCreate = useCreateTask();
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

// Le pied d'une liste ou d'un tableau dont des tâches sont masquées.
export function HiddenFooter({
  hiddenCount,
  config,
  base,
  className,
}: NoticeProps & { className?: string }) {
  const showAll = useShowAll(config, base);
  return (
    <p
      className={cn(
        'flex shrink-0 items-center justify-center gap-1 pt-6 text-sm text-muted-foreground',
        className,
      )}
    >
      {hiddenLabel(hiddenCount)}
      <Button variant="link" size="sm" onClick={showAll}>
        Tout afficher
      </Button>
    </p>
  );
}

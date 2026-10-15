import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TASK_PRIORITIES, type ViewGrouping } from '@/lib/enums';
import { formatNumber } from '@/lib/format';
import { Avatar } from './avatar';
import { LabelDot } from './label-chip';
import type { ListContext } from './list-context';
import { PriorityIcon } from './priority-icon';
import { StatusIcon } from './status-icon';

type GroupIconProps = { groupBy: ViewGrouping; groupKey: string; context: ListContext };

// L'icône d'un groupe : celle de son statut, de sa priorité, de son assigné ou de son étiquette.
// Les groupes sans valeur (clé « none ») et « Autre » n'en ont pas, sauf « Sans assigné ».
export function GroupIcon({ groupBy, groupKey, context }: GroupIconProps) {
  if (groupBy === 'status') {
    const status = context.statuses.find((candidate) => candidate.id === groupKey);
    return status && <StatusIcon category={status.category} color={status.color} />;
  }
  if (groupBy === 'priority') {
    const priority = TASK_PRIORITIES.find((value) => value === groupKey);
    return priority && <PriorityIcon priority={priority} />;
  }
  if (groupBy === 'assignee') {
    if (groupKey === 'none') return <Avatar person={null} />;
    const member = context.members.find((candidate) => candidate.id === groupKey);
    return member && <Avatar person={member} />;
  }
  if (groupBy === 'label') {
    const label = context.labels.find((candidate) => candidate.id === groupKey);
    return label && <LabelDot color={label.color} className="size-2.5" />;
  }
  return null;
}

type TaskGroupSectionProps = { label: string; count: number; icon: ReactNode; children: ReactNode };

// Un groupe repliable : icône, nom, compteur. Le titre est un bouton, comme dans un accordéon.
export function TaskGroupSection({ label, count, icon, children }: TaskGroupSectionProps) {
  return (
    <Collapsible defaultOpen>
      <h2 className="text-sm font-normal">
        <CollapsibleTrigger className="group/trigger flex h-9 w-full items-center gap-2 bg-muted px-5 text-left transition-colors hover:bg-accent">
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            aria-hidden="true"
            className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]/trigger:rotate-90"
          />
          {icon}
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatNumber(count)}
            <span className="sr-only"> {count > 1 ? 'tâches' : 'tâche'}</span>
          </span>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>{count > 0 && <ul aria-label={label}>{children}</ul>}</CollapsibleContent>
    </Collapsible>
  );
}

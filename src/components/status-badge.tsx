import { CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { cn } from '@/lib/utils';

// État d'indexation d'une source. Le sens passe toujours par l'icône et le mot, jamais par la couleur seule.
const STATUSES = {
  running: { label: 'En cours', icon: CircleDashed, tone: 'bg-info-soft text-info' },
  done: { label: 'Indexée', icon: CircleCheck, tone: 'bg-success-soft text-success' },
  failed: { label: 'Erreur', icon: CircleX, tone: 'bg-destructive-soft text-destructive' },
} as const;

export type BadgeStatus = keyof typeof STATUSES;

export function StatusBadge({ status }: { status: BadgeStatus }) {
  const { label, icon: Icon, tone } = STATUSES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap',
        tone,
      )}
    >
      <Icon size={12} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </span>
  );
}

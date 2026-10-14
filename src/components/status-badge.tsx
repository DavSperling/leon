import {
  CircleCheck,
  CircleDashed,
  CircleQuestionMark,
  CircleX,
  Clock,
  History,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Un fait actif n'a pas de badge. Le sens passe toujours par l'icône et le mot, jamais par la couleur seule.
const STATUSES = {
  superseded: { label: 'Remplacé', icon: History, tone: 'bg-muted text-muted-foreground' },
  conflict: { label: 'Contradiction', icon: TriangleAlert, tone: 'bg-warning-soft text-warning' },
  pending_review: { label: 'À valider', icon: Clock, tone: 'bg-warning-soft text-warning' },
  unconfirmed: {
    label: 'Non confirmée',
    icon: CircleQuestionMark,
    tone: 'bg-muted text-muted-foreground',
  },
  proposed: { label: 'Proposé', icon: Plus, tone: 'bg-info-soft text-info' },
  running: { label: 'En cours', icon: CircleDashed, tone: 'bg-info-soft text-info' },
  done: { label: 'Traité', icon: CircleCheck, tone: 'bg-success-soft text-success' },
  failed: { label: 'Erreur', icon: CircleX, tone: 'bg-destructive-soft text-destructive' },
} as const;

export type BadgeStatus = keyof typeof STATUSES;

export function StatusBadge({ status }: { status: BadgeStatus }) {
  const { label, icon: Icon, tone } = STATUSES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-xs leading-4 font-medium whitespace-nowrap',
        tone,
      )}
    >
      <Icon size={12} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </span>
  );
}

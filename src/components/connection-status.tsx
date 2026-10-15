import { CircleCheck, CircleX, Pause } from 'lucide-react';
import { statusLine } from '@/lib/connection-form';
import { cn } from '@/lib/utils';
import type { ConnectionView } from '@/server/connectors/connections';

const TONES = {
  active: { icon: CircleCheck, className: 'text-success' },
  paused: { icon: Pause, className: 'text-muted-foreground' },
  error: { icon: CircleX, className: 'text-destructive' },
} as const;

// L'état d'une connexion : le sens passe par l'icône et par le mot, jamais par la couleur seule.
export function ConnectionStatus({
  view,
  now,
}: {
  view: Pick<ConnectionView, 'status' | 'lastSyncAt' | 'itemsSynced' | 'lastError'>;
  now: Date;
}) {
  const { icon: Icon, className } = TONES[view.status];
  return (
    <p className={cn('flex items-start gap-1.5 text-[13px] leading-[18px]', className)}>
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{statusLine(view, now)}</span>
    </p>
  );
}

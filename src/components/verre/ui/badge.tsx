import { CircleCheck, CircleDashed, CircleX, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/verre/cn';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'bg-glass-3 text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)]',
  accent: 'bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]',
  success: 'bg-success-soft text-success shadow-[inset_0_0_0_1px_var(--success-line)]',
  warning: 'bg-warning-soft text-warning shadow-[inset_0_0_0_1px_var(--warning-line)]',
  destructive:
    'bg-destructive-soft text-destructive shadow-[inset_0_0_0_1px_var(--destructive-line)]',
  info: 'bg-info-soft text-info shadow-[inset_0_0_0_1px_var(--info-line)]',
};

export type BadgeProps = ComponentProps<'span'> & {
  tone?: Tone;
  icon?: LucideIcon /** chiffres et statuts en Geist Mono */;
  mono?: boolean;
};

/** Petite étiquette : « Non essayé en réel », « Bientôt », un compteur. */
export function Badge({
  tone = 'neutral',
  icon: Icon,
  mono,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] leading-none font-medium whitespace-nowrap',
        mono && 'font-mono tracking-normal',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" className="size-3" strokeWidth={1.8} />}
      {children}
    </span>
  );
}

export type IndexingStatus = 'running' | 'done' | 'failed';
const STATUSES = {
  running: { label: 'En cours', icon: CircleDashed, tone: 'info' },
  done: { label: 'Indexée', icon: CircleCheck, tone: 'success' },
  failed: { label: 'Erreur', icon: CircleX, tone: 'destructive' },
} as const;

/**
 * État d'indexation d'une source : le sens passe par l'icône et le mot, jamais par la couleur seule. L'état courant
 * (« Indexée ») reste discret, icône verte et mot atténué ; seules les exceptions (« En cours », « Erreur ») sont des pastilles.
 */
export function StatusBadge({ status, className }: { status: IndexingStatus; className?: string }) {
  const { label, icon: Icon, tone } = STATUSES[status];
  if (status === 'done')
    return (
      <span
        className={cn(
          'inline-flex h-5 shrink-0 items-center gap-1 text-[11px] leading-none font-medium whitespace-nowrap text-muted',
          className,
        )}
      >
        <Icon aria-hidden="true" className="size-3 text-success" strokeWidth={1.8} />
        {label}
      </span>
    );
  return (
    <Badge tone={tone} icon={Icon} className={className}>
      {label}
    </Badge>
  );
}

import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  type LucideIcon,
  TriangleAlert,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { Button } from './button';

/** Bloc de chargement avec reflet qui balaie. Donnez la taille par className (h-2.5 w-3/4…). */
export function Skeleton({ className, ...props }: ComponentProps<'span'>) {
  return <span aria-hidden="true" className={cn('sk block h-2.5', className)} {...props} />;
}

/** Trois lignes de texte en attente (réponse de Leon, aperçu). */
export function SkeletonText({
  widths = ['94%', '81%', '58%'],
  className,
}: {
  widths?: string[];
  className?: string;
}) {
  return (
    <span className={cn('grid gap-[9px]', className)} aria-hidden="true">
      {widths.map((w, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: traits fixes
        <Skeleton key={i} style={{ width: w }} />
      ))}
    </span>
  );
}

/** Page en chargement : barre de titre, sous-titre, cinq lignes de deux traits ; `label` pour les lecteurs d'écran. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="grid gap-3 pt-2">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-56 rounded-lg" />
      <Skeleton className="mb-5 h-3 w-96 max-w-full" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="grid gap-2.5 rounded-card border border-line bg-glass p-4">
          <Skeleton style={{ width: `${34 - i * 3}%` }} />
          <Skeleton className="h-3" style={{ width: `${78 - i * 6}%` }} />
        </div>
      ))}
    </div>
  );
}

export type EmptyStateProps = {
  icon?: LucideIcon;
  /** La raison, en gras : « Aucun résultat. » */
  title: string;
  /** La suite à donner, en atténué : « Essayez d'autres mots… » */
  description?: ReactNode;
  /** Un seul bouton au plus. */
  action?: ReactNode;
  /** Sans cadre (dans une carte qui en a déjà un). */
  bare?: boolean;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bare,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 py-10 text-center',
        !bare && 'rounded-box border border-line bg-glass shadow-hi',
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 grid size-11 place-items-center rounded-full bg-glass-3 text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong),inset_0_1px_0_var(--hi)]">
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.6} />
        </span>
      )}
      <p className="text-title font-semibold tracking-[-0.015em] text-fg">{nb(title)}</p>
      {description && (
        <p className="mt-1.5 max-w-[46ch] text-body text-muted">
          {typeof description === 'string' ? nb(description) : description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export type NoticeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
const NOTICE: Record<NoticeTone, { icon: LucideIcon; cls: string; ico: string }> = {
  neutral: {
    icon: CircleAlert,
    cls: 'bg-glass-3 shadow-[inset_0_0_0_1px_var(--line-strong)]',
    ico: 'text-muted',
  },
  info: {
    icon: Info,
    cls: 'bg-info-soft shadow-[inset_0_0_0_1px_var(--info-line)]',
    ico: 'text-info',
  },
  success: {
    icon: CircleCheck,
    cls: 'bg-success-soft shadow-[inset_0_0_0_1px_var(--success-line)]',
    ico: 'text-success',
  },
  warning: {
    icon: TriangleAlert,
    cls: 'bg-warning-soft shadow-[inset_0_0_0_1px_var(--warning-line)]',
    ico: 'text-warning',
  },
  error: {
    icon: CircleX,
    cls: 'bg-destructive-soft shadow-[inset_0_0_0_1px_var(--destructive-line)]',
    ico: 'text-destructive',
  },
};

export type NoticeProps = {
  tone?: NoticeTone;
  /** Remplace l'icône du ton (CircleAlert pour les notices de discussion…). */
  icon?: LucideIcon;
  children: ReactNode;
  /** Bouton d'action : { label, onClick, icon } ou un élément. */
  action?: ReactNode | { label: string; onClick: () => void; icon?: LucideIcon };
  /** role="alert" (erreur qui survient) ou "status" (information qui survient) ; rien pour une notice présente d'emblée. */
  live?: 'alert' | 'status';
  className?: string;
};

/**
 * Bandeau neutre, d'information, de succès, d'avertissement ou d'erreur ; le texte reste en couleur de texte (contraste).
 * `neutral` pour une simple remarque (notices de discussion) : le ton coloré est réservé à ce qui demande d'agir.
 */
export function Notice({ tone = 'info', icon, children, action, live, className }: NoticeProps) {
  const t = NOTICE[tone];
  const Icon = icon ?? t.icon;
  const act =
    action && typeof action === 'object' && 'label' in action ? (
      <Button size="sm" icon={action.icon} onClick={action.onClick}>
        {action.label}
      </Button>
    ) : (
      (action as ReactNode)
    );
  return (
    <div
      role={live}
      className={cn(
        'flex flex-wrap items-start gap-x-3 gap-y-2 rounded-card px-4 py-3 text-ui text-fg',
        t.cls,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.8}
        className={cn('mt-[2px] size-4 shrink-0', t.ico)}
      />
      <div className="min-w-0 flex-1 basis-[240px]">
        {typeof children === 'string' ? nb(children) : children}
      </div>
      {act && <div className="-my-0.5 ml-7 sm:ml-0">{act}</div>}
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { Button } from './button';

/** Bloc en attente : un aplat fixe, rien ne balaie. Donnez la taille par className (h-2.5 w-3/4…). */
export function Skeleton({ className, ...props }: ComponentProps<'span'>) {
  return <span aria-hidden="true" className={cn('sk block h-2.5', className)} {...props} />;
}

/** Page en chargement : la place du titre, puis quatre cartes vides ; `label` pour les lecteurs d'écran. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-48" />
      <div className="things mt-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[88px] rounded-card border border-line bg-sheet" />
        ))}
      </div>
    </div>
  );
}

export type EmptyStateProps = {
  /** La raison, en gras : « Aucun document pour l'instant » */
  title: string;
  /** Une ligne courte, atténuée : « Ajoutez un fichier, Leon le lit. » */
  description?: ReactNode;
  /** Un seul bouton au plus (secondary, sm), et seulement si la vue n'a pas déjà sa pastille d'encre. */
  action?: ReactNode;
  /** Sans cadre (dans une feuille qui en a déjà un). */
  bare?: boolean;
  className?: string;
};

/** Rien à montrer : un cadre en pointillé, aligné à gauche, un titre et une ligne. */
export function EmptyState({ title, description, action, bare, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'grid justify-items-start gap-1',
        !bare && 'rounded-card border border-dashed border-line-strong py-7 pr-7 pl-8',
        className,
      )}
    >
      <h3 className="text-title font-semibold text-fg">{nb(title)}</h3>
      {description && (
        <p className="max-w-[60ch] text-body text-muted">
          {typeof description === 'string' ? nb(description) : description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export type NoticeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
// Une ligne plate, un point de 6 px. Seuls l'erreur et l'avertissement prennent une teinte : ils demandent d'agir.
const NOTICE: Record<NoticeTone, { cls: string; dot: string }> = {
  neutral: { cls: 'border-transparent bg-glass-3', dot: 'bg-icon' },
  info: { cls: 'border-transparent bg-glass-3', dot: 'bg-icon' },
  success: { cls: 'border-transparent bg-glass-3', dot: 'bg-ok' },
  warning: { cls: 'border-warning-line bg-warning-soft', dot: 'bg-f4' },
  error: { cls: 'border-destructive-line bg-destructive-soft', dot: 'bg-destructive' },
};

export type NoticeProps = {
  tone?: NoticeTone;
  children: ReactNode;
  /** Bouton d'action : { label, onClick, icon } ou un élément. */
  action?: ReactNode | { label: string; onClick: () => void; icon?: LucideIcon };
  /** role="alert" (erreur qui survient) ou "status" (information qui survient) ; rien pour une notice présente d'emblée. */
  live?: 'alert' | 'status';
  className?: string;
};

/**
 * Ligne de remarque, de succès, d'avertissement ou d'erreur ; le texte reste en couleur de texte (contraste).
 * Ce qui se voit sur place se dit sur place (sous son champ, dans son bouton) : une Notice est pour le reste.
 */
export function Notice({ tone = 'info', children, action, live, className }: NoticeProps) {
  const t = NOTICE[tone];
  const act =
    action && typeof action === 'object' && 'label' in action ? (
      <Button size="xs" icon={action.icon} onClick={action.onClick}>
        {action.label}
      </Button>
    ) : (
      (action as ReactNode)
    );
  return (
    <div
      role={live}
      className={cn(
        'flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-item border px-3.5 py-2.5 text-ui text-fg',
        t.cls,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', t.dot)} />
      <div className="min-w-0 flex-1 basis-[240px]">
        {typeof children === 'string' ? nb(children) : children}
      </div>
      {act && <div className="-my-0.5 ml-4 sm:ml-0">{act}</div>}
    </div>
  );
}

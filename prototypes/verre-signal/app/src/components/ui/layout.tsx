import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { nb } from '@/lib/nb';

export type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  /** Boutons à droite du titre */
  actions?: ReactNode;
  /** Ligne fine sous le sous-titre (cadenas « Vos discussions ne sont visibles que de vous. »…) */
  meta?: ReactNode;
  className?: string;
};

/** En-tête d'écran : h1 (le seul de la page) + sous-titre + actions + ligne méta. */
export function PageHeader({ title, subtitle, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0 max-w-[68ch]">
        <h1 className="text-h1 font-bold tracking-[-0.03em] text-fg max-sm:text-[26px]">{nb(title)}</h1>
        {subtitle && <p className="mt-2 text-lead text-fg-2">{typeof subtitle === 'string' ? nb(subtitle) : subtitle}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-muted [&_svg]:size-3.5 [&_svg]:shrink-0">{typeof meta === 'string' ? nb(meta) : meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export type SectionProps = Omit<ComponentProps<'section'>, 'title'> & { title: string; description?: ReactNode; actions?: ReactNode; id?: string; className?: string; children: ReactNode };

/** Section d'écran : h2 + description + actions, puis le contenu. Les autres props (tabIndex, data-*…) vont au <section>. */
export function Section({ title, description, actions, id, className, children, ...props }: SectionProps) {
  const hid = id ? `${id}-titre` : undefined;
  return (
    <section id={id} aria-labelledby={hid} className={cn('mt-10 first:mt-0', className)} {...props}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id={hid} className="text-h2 font-semibold tracking-[-0.02em] text-fg">{nb(title)}</h2>
          {description && <p className="mt-1 text-body text-muted">{typeof description === 'string' ? nb(description) : description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

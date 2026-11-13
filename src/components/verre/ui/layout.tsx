import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { Flag, type FlagTone } from './marks';

export type PageHeaderProps = {
  title: string;
  /** Plus dessiné : rien sous le titre (un écran est un titre et des choses). La prop reste pour ses appelants. */
  subtitle?: ReactNode;
  /** À droite du titre : la pastille d'encre de la vue, quand elle en a une. */
  actions?: ReactNode;
  /** Plus dessinée, comme `subtitle`. Une promesse du produit (qui voit quoi) vit dans le panneau. */
  meta?: ReactNode;
  className?: string;
};

/**
 * En-tête d'écran : le h1 (le seul de la page) et, à droite, l'action de la vue. 32 px de haut quoi qu'il porte (la
 * pastille de 36 px déborde de 2 px de chaque côté) : chaque écran commence à la même ligne.
 */
export function PageHeader({ title, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'page-head mb-6 flex min-h-8 items-center justify-between gap-4 max-sm:flex-wrap sm:h-8',
        className,
      )}
    >
      <h1 className="min-w-0 text-h1 font-semibold tracking-[-0.022em] text-fg max-sm:text-[26px]">
        {nb(title)}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export type SectionProps = Omit<ComponentProps<'section'>, 'title'> & {
  title: string;
  /** Le drapeau qui compte les choses dessinées dessous. */
  count?: number;
  /** La couleur du drapeau : 1 rose, 2 vert, 3 bleu, 4 ambre (2 par défaut). */
  tone?: FlagTone;
  /** Une phrase sous le titre : à garder pour une promesse du produit ou une chose technique, jamais pour expliquer l'écran. */
  description?: ReactNode;
  /** À droite du titre : la recherche, les puces. */
  actions?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
};

/** Section d'écran : h2, son drapeau, ses outils à droite, puis le contenu. 40 px entre deux sections, 24 sous le titre de la page. */
export function Section({
  title,
  count,
  tone = 2,
  description,
  actions,
  id,
  className,
  children,
  ...props
}: SectionProps) {
  const hid = id ? `${id}-titre` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={hid}
      className={cn('mt-10 first:mt-0 [.page-head+&]:mt-0', className)}
      {...props}
    >
      <div className="mb-3 flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={hid} className="text-h2 font-semibold tracking-[-0.012em] text-fg">
          {nb(title)}
        </h2>
        {count != null && <Flag tone={tone}>{count}</Flag>}
        {actions && (
          <div className="ml-auto flex items-center gap-2 max-shell:ml-0 max-shell:basis-full">
            {actions}
          </div>
        )}
        {description && (
          <p className="basis-full text-label text-muted">
            {typeof description === 'string' ? nb(description) : description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

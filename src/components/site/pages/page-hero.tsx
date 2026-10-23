import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { ParticleField, SplitWords, type WordsPart } from '../fx';
import { Container, Kicker } from '../parts';

// Haut des pages secondaires du site (produit, cas d'usage, connecteurs, sécurité, tarifs) : un seul style partagé.
// Fil d'Ariane, libellé, h1 (le seul de la page), chapeau, boutons ; à droite, un visuel facultatif.
// Entrée échelonnée en CSS (.site-rise, mots du titre qui basculent en 3D) : visible sans JavaScript. Derrière, une
// nappe de particules en 3D, plus légère que celle de l'accueil.

const rise = (i: number) => ({ '--i': i }) as CSSProperties;

export type Crumb = { href: string; label: string };

export function PageHero({
  kicker,
  title,
  accent,
  lead,
  actions,
  aside,
  crumbs,
  current,
  align = 'left',
  children,
  className,
}: {
  kicker?: ReactNode;
  title: string;
  /** Morceau du titre en dégradé accent → sarcelle (« avec sa source. »). */
  accent?: string;
  lead?: string;
  actions?: ReactNode;
  /** Visuel à droite (sous le texte sur mobile). */
  aside?: ReactNode;
  /** Fil d'Ariane, sans la page courante. */
  crumbs?: Crumb[];
  /** Libellé de la page courante dans le fil d'Ariane (par défaut, `title` s'il est une chaîne). */
  current?: string;
  align?: 'left' | 'center';
  /** Contenu sous les boutons (pastilles, compteurs). */
  children?: ReactNode;
  className?: string;
}) {
  const centered = align === 'center' && !aside;
  const at = accent ? title.indexOf(accent) : -1;
  const parts: WordsPart[] =
    accent && at >= 0
      ? [
          { text: title.slice(0, at) },
          { text: accent, className: 'site-gradient' },
          { text: title.slice(at + accent.length) },
        ].filter((p) => p.text !== '')
      : [{ text: title }];
  return (
    <section className={cn('relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-20', className)}>
      <div
        aria-hidden="true"
        className="site-halo pointer-events-none absolute inset-x-0 top-0 h-[560px]"
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 opacity-75 [mask:linear-gradient(180deg,transparent,#000_42%)] [[data-theme=light]_&]:opacity-45',
          aside ? 'top-[40%]' : 'top-[56%]',
        )}
      >
        <ParticleField density={0.62} height={0.9} />
      </div>
      <Container
        className={cn(
          'relative grid items-center gap-12',
          aside && 'lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:gap-14',
        )}
      >
        <div className={cn('min-w-0', centered && 'mx-auto max-w-[820px] text-center')}>
          {crumbs && crumbs.length > 0 && (
            <nav aria-label="Fil d’Ariane" className="site-rise mb-6" style={rise(0)}>
              <ol
                className={cn(
                  'flex flex-wrap items-center gap-1.5 text-label text-muted',
                  centered && 'justify-center',
                )}
              >
                {crumbs.map((c) => (
                  <li key={c.href} className="flex items-center gap-1.5">
                    {/* cible de 40 px de haut, sans changer la hauteur du fil (marges négatives) */}
                    <Link
                      href={c.href}
                      className="-my-2.5 inline-flex min-h-10 items-center rounded-sm font-medium transition-colors duration-200 hover:text-fg"
                    >
                      {nb(c.label)}
                    </Link>
                    <ChevronRight aria-hidden="true" strokeWidth={1.8} className="size-3.5" />
                  </li>
                ))}
                <li aria-current="page" className="font-medium text-fg-2">
                  {nb(current ?? title)}
                </li>
              </ol>
            </nav>
          )}
          {kicker && (
            <div className={cn('site-rise', centered && 'flex justify-center')} style={rise(1)}>
              {typeof kicker === 'string' ? <Kicker>{nb(kicker)}</Kicker> : kicker}
            </div>
          )}
          <h1
            className={cn(
              'mt-4 font-extrabold tracking-[-0.048em] text-balance text-fg',
              aside ? 'text-[clamp(36px,4.6vw,60px)]' : 'text-[clamp(38px,5.8vw,72px)]',
              // après la taille : tailwind-merge retirerait sinon l'interligne (text-* le règle aussi)
              'leading-[1.02]',
            )}
          >
            <SplitWords parts={parts} delay={140} />
          </h1>
          {lead && (
            <p
              className={cn(
                'site-rise mt-6 max-w-[620px] text-[18px] leading-[1.6] text-pretty text-fg-2 max-sm:text-[16px]',
                centered && 'mx-auto',
              )}
              style={rise(3)}
            >
              {nb(lead)}
            </p>
          )}
          {actions && (
            <div
              className={cn(
                'site-rise mt-9 flex flex-wrap items-center gap-3',
                centered && 'justify-center',
              )}
              style={rise(4)}
            >
              {actions}
            </div>
          )}
          {children && (
            <div className="site-rise mt-10" style={rise(5)}>
              {children}
            </div>
          )}
        </div>
        {aside && (
          <div className="site-rise min-w-0" style={rise(4)}>
            {aside}
          </div>
        )}
      </Container>
    </section>
  );
}

/** Section de page : espacement vertical commun, ancre facultative (décalée sous l'en-tête fixe). */
export function PageSection({
  id,
  className,
  children,
  labelledBy,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn('relative scroll-mt-24 py-16 sm:py-24', className)}
    >
      <Container>{children}</Container>
    </section>
  );
}

/** Étiquette « Prévu » : ce qui n'est pas encore construit. */
export function PlannedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center rounded-full bg-warning-soft px-2.5 font-mono text-[11px] font-medium tracking-normal text-warning shadow-[inset_0_0_0_1px_var(--warning-line)]',
        className,
      )}
    >
      Prévu
    </span>
  );
}

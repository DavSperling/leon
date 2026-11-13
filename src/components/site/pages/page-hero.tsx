import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { PagesMotion } from '../motion/pages-motion';
import { Container, Marked, order } from '../parts';

// Haut des pages intérieures du site (produit, cas d'usage, connecteurs, sécurité, tarifs, documentation) : un seul
// style. Le titre (le seul h1 de la page) sur huit colonnes, ses mots marqués d'un trait ; le chapeau et le bouton sur
// les quatre dernières. Un visuel (`aside`) passe dessous, sur une bande de bureau collée au haut de page.

export type Crumb = { href: string; label: string };

export function PageHero({
  title,
  accent,
  tone = 1,
  lead,
  actions,
  note,
  aside,
  crumbs,
  current,
  children,
  className,
}: {
  title: string;
  /** Les mots du titre sous le trait de surligneur. */
  accent?: string;
  /** Couleur du trait : 1 rose, 2 vert, 3 bleu, 4 ambre. */
  tone?: number;
  lead?: string;
  actions?: ReactNode;
  /** La petite ligne à côté du bouton (« Bêta ouverte · pas encore de facturation »). */
  note?: string;
  /** Un visuel, sur une bande de bureau sous le haut de page. */
  aside?: ReactNode;
  /** Fil d'Ariane, sans la page courante. */
  crumbs?: Crumb[];
  /** Libellé de la page courante dans le fil d'Ariane (par défaut, le titre). */
  current?: string;
  /** Contenu sous le titre (une bascule, des pastilles). */
  children?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('site.common');
  const side = Boolean(lead || actions);
  return (
    <section className={cn('s-top', className)}>
      <PagesMotion />
      <Container>
        {crumbs && crumbs.length > 0 && (
          <nav aria-label={t('breadcrumb')} className="s-arrive" style={order(0)}>
            <ol className="s-crumbs">
              {crumbs.map((c) => (
                <li key={c.href} className="flex items-center gap-1.5">
                  <Link href={c.href}>{nb(c.label)}</Link>
                  <ChevronRight aria-hidden="true" strokeWidth={1.8} className="size-3.5" />
                </li>
              ))}
              <li aria-current="page" className="text-fg">
                {nb(current ?? title)}
              </li>
            </ol>
          </nav>
        )}
        <div className={cn('s-grid s-top__grid', !side && 's-top--solo')}>
          <h1 className="s-h1 s-top__h1 s-arrive" style={order(1)}>
            <Marked text={title} mark={accent} tone={tone} />
          </h1>
          {lead && (
            <p className="s-lead s-top__lead s-arrive" style={order(2)}>
              {nb(lead)}
            </p>
          )}
          {(actions || note) && (
            <div className="s-top__cta s-arrive" style={order(3)}>
              {actions}
              {note && <p className="s-small">{nb(note)}</p>}
            </div>
          )}
        </div>
        {children && (
          <div className="s-arrive mt-8" style={order(4)}>
            {children}
          </div>
        )}
      </Container>
      {aside && (
        <div className="s-stage">
          <Container>{aside}</Container>
        </div>
      )}
    </section>
  );
}

/** Section de page : le rythme commun (148 px), une ancre facultative. */
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
    <section id={id} aria-labelledby={labelledBy} className={cn('s-sec', className)}>
      <Container>{children}</Container>
    </section>
  );
}

/** Le demi-anneau de « en cours » : un anneau pâle et, dessus, sa moitié tracée à l'encre. */
export function ProgressMark() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" className="s-check" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.8" />
      <path
        d="M11 4a7 7 0 0 1 0 14"
        pathLength={1}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** La coche de « en place ». */
export function CheckMark() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" className="s-check" fill="none">
      <path
        d="M5 11.5l4 4L17 7"
        pathLength={1}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Une liste de faits : la marque (coche ou demi-anneau), le fait, sa phrase. */
export function FactList({
  items,
  progress,
  className,
}: {
  items: readonly { title: string; text: string }[];
  progress?: boolean;
  className?: string;
}) {
  return (
    <ul data-pm="ticks" className={cn('s-facts', className)}>
      {items.map((f) => (
        <li key={f.title}>
          {progress ? <ProgressMark /> : <CheckMark />}
          <h3 className="s-h3">{nb(f.title)}</h3>
          {f.text && <p className="s-body">{nb(f.text)}</p>}
        </li>
      ))}
    </ul>
  );
}

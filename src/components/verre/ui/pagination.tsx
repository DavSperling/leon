'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/verre/cn';
import { scrollToTop } from '@/lib/verre/scroll';

export type PaginationProps = {
  page: number;
  /** Nombre de pages ; absent : « Page N » sans total. */
  pages?: number;
  /** Sans total : y a-t-il une page suivante ? */
  hasNext?: boolean;
  /** Adresse d'une page : (p) => `/?q=…&page=${p}` */
  href: (page: number) => string;
  /** id de l'élément qui prend le focus une fois la page changée (titre des résultats, tabIndex={-1}) : sinon le focus reste sur le lien, ou tombe sur <body> s'il disparaît. */
  focusId?: string;
  className?: string;
};

const LINK =
  'inline-flex h-8 items-center gap-2 rounded-full border border-line-strong bg-sheet px-3.5 text-label font-medium text-fg transition-colors duration-150 hover:border-fg hover:bg-n-50 max-shell:h-11';

/** « ← Précédent | Page 2 sur 7 | Suivant → », en liens ; le côté qui manque reste vide ; un clic remonte en haut du panneau. */
export function Pagination({ page, pages, hasNext, href, focusId, className }: PaginationProps) {
  const t = useTranslations('common');
  const next = pages ? page < pages : hasNext;
  const moved = useRef(false);
  // après le rendu de la nouvelle page (le lien cliqué a pu disparaître)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `page` déclenche le report du focus
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }, [page, focusId]);
  const go = () => {
    moved.current = true;
    scrollToTop();
  };
  return (
    <nav
      aria-label={t('pagination')}
      className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-2', className)}
    >
      <span>
        {page > 1 && (
          <Link className={LINK} href={href(page - 1)} rel="prev" onClick={go}>
            <span aria-hidden="true">←</span>
            {t('previous')}
          </Link>
        )}
      </span>
      <span className="text-label text-muted tabular-nums" aria-current="page">
        {pages ? t('pageOf', { page, pages }) : t('page', { page })}
      </span>
      <span className="justify-self-end">
        {next && (
          <Link className={LINK} href={href(page + 1)} rel="next" onClick={go}>
            {t('next')}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </span>
    </nav>
  );
}

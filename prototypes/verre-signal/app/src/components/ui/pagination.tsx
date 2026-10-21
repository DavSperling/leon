import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { scrollToTop } from '@/lib/scroll';

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

const LINK = 'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-ui font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg';

/** « ← Précédent | Page 2 sur 7 | Suivant → », en liens ; le côté qui manque reste vide ; un clic remonte en haut du panneau. */
export function Pagination({ page, pages, hasNext, href, focusId, className }: PaginationProps) {
  const next = pages ? page < pages : hasNext;
  const moved = useRef(false);
  // après le rendu de la nouvelle page (le lien cliqué a pu disparaître)
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
    <nav aria-label="Pagination" className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-2', className)}>
      <span>{page > 1 && <Link className={LINK} to={href(page - 1)} rel="prev" onClick={go}><span aria-hidden="true">←</span>Précédent</Link>}</span>
      <span className="text-label text-muted tabular-nums" aria-current="page">{pages ? `Page ${page} sur ${pages}` : `Page ${page}`}</span>
      <span className="justify-self-end">{next && <Link className={LINK} to={href(page + 1)} rel="next" onClick={go}>Suivant<span aria-hidden="true">→</span></Link>}</span>
    </nav>
  );
}

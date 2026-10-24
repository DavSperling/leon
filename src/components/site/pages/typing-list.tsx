'use client';

import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/verre/cn';
import { isInstant } from '@/lib/verre/instant';

/**
 * Liste de requêtes qui se tapent l'une après l'autre quand elle entre dans l'écran (pages.css, .pg-typing).
 * Visible telle quelle sans JavaScript et en mouvement réduit : la liste n'est « armée » (texte masqué) qu'au montage.
 */
export function TypingList({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || isInstant()) return;
    el.dataset.armed = '';
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        el.dataset.typed = '';
        io.disconnect();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <ul ref={ref} className={cn('pg-typing', className)}>
      {children}
    </ul>
  );
}

/** Texte d'une ligne de TypingList : `row` donne son tour, la durée suit la longueur. */
export function TypedText({
  text,
  row,
  children,
}: {
  text: string;
  row: number;
  children?: ReactNode;
}) {
  const n = Math.max(6, text.length);
  return (
    // les variables sur le parent : le texte et le curseur les lisent tous deux
    <span
      className="inline-flex min-w-0 items-center"
      style={{ '--n': n, '--dur': `${Math.min(1400, n * 32)}ms`, '--row': row } as CSSProperties}
    >
      <span className="pg-typed min-w-0">{children ?? text}</span>
      <span aria-hidden="true" className="pg-typed-caret caret" />
    </span>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { nb } from '@/lib/verre/nb';

// Le plan de la page Documentation, posé sur le bureau à côté de la feuille. L'entrée de la section qu'on lit est
// passée au surligneur (aria-current, pages.css), dans la couleur du marque-page de la section : le trait suit la
// lecture, et le marque-page de la section sort de la feuille au même moment (un seul état, lu ici). Sans script, le
// plan reste une liste de liens ; avec le mouvement réduit, le trait change de place sans se tracer.

export function DocumentationToc({
  title,
  items,
}: {
  title: string;
  items: readonly { id: string; label: string; tone?: string }[];
}) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      // La section qu'on lit : la dernière dont le titre est passé sous l'en-tête (un tiers de fenêtre de marge) ; en
      // haut de page, la première.
      const line = window.innerHeight * 0.34;
      const sections = items.map(({ id }) => document.getElementById(id));
      const at = Math.max(
        0,
        sections.findLastIndex((el) => el && el.getBoundingClientRect().top <= line),
      );
      // Le marque-page d'une section sort de la feuille quand son entrée est marquée, pas avant (pages.css, data-ahead)
      for (const [i, el] of sections.entries()) el?.toggleAttribute('data-ahead', i > at);
      setCurrent(items[at]?.id ?? null);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      for (const { id } of items) document.getElementById(id)?.removeAttribute('data-ahead');
    };
  }, [items]);

  return (
    <nav aria-label={title} className="pg-toc">
      <p className="s-small mb-3 font-medium">{title}</p>
      <ol>
        {items.map(({ id, label, tone }) => (
          <li key={id} className={tone}>
            <a href={`#${id}`} aria-current={current === id ? 'location' : undefined}>
              <span>{nb(label)}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

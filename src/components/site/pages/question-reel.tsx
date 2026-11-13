'use client';

import Link from 'next/link';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/verre/cn';
import { useInstant } from '@/lib/verre/instant';
import { nb } from '@/lib/verre/nb';
import { isFilterQuery, QueryCode } from '../parts';

// Les questions d'une équipe (ou de toutes), dans le champ où l'on demande : un seul champ, signé des trois traits, où
// les questions s'écrivent l'une après l'autre ; dessous, la liste entière, dont celle qui s'écrit est passée au
// surligneur. Pointer une question (ou y venir au clavier) la met dans le champ et arrête la ronde. C'est l'idée des
// « questions qui se tapent » de l'ancien site, dite avec le champ et le surligneur.
// Sans script : la première question dans le champ, la liste entière. Mouvement réduit ou « Arrêter les animations » :
// pas de ronde, la question pointée s'affiche d'un coup. Hors de l'écran, la ronde s'arrête.

export type ReelItem = { q: string; aside?: string; href?: string };

const BEAT = 2800;

function Words({ q }: { q: string }) {
  return isFilterQuery(q) ? <QueryCode q={q} /> : nb(q);
}

export function QuestionReel({
  items,
  wide,
  className,
}: {
  items: ReelItem[];
  /** La liste sur deux colonnes (la page de toutes les équipes). */
  wide?: boolean;
  className?: string;
}) {
  const instant = useInstant();
  const root = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(0);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (instant || held || !visible || items.length < 2) return;
    const id = window.setInterval(() => setOn((i) => (i + 1) % items.length), BEAT);
    return () => window.clearInterval(id);
  }, [instant, held, visible, items.length]);

  const current = items[Math.min(on, items.length - 1)];
  if (!current) return null;
  const hold = (i: number) => {
    setOn(i);
    setHeld(true);
  };

  return (
    <div ref={root} className={cn('pg-reel c4', wide && 'pg-reel--wide', className)}>
      {/* le champ redit la question de la liste : caché aux lecteurs d'écran, qui ont la liste ; il s'écrit une
          première fois quand il entre à l'écran (motion/pages.ts, geste « ask ») */}
      <p aria-hidden="true" data-pm="ask" className="pg-ask pg-reel__field">
        <span key={`s${on}`} className="strokes">
          <i />
          <i />
          <i />
        </span>
        <span key={on} className="pg-reel__q">
          <Words q={current.q} />
        </span>
        {current.aside && <span className="s-small pg-reel__who">{current.aside}</span>}
      </p>
      {/* quitter la liste relance la ronde */}
      <ul
        className="pg-reel__list"
        onPointerLeave={() => setHeld(false)}
        onBlur={() => setHeld(false)}
      >
        {items.map((item, i) => {
          const row = (
            <>
              <span className="min-w-0 flex-1">
                {/* le trait passe sur les mots ; une requête en filtres garde sa pastille, entière */}
                {isFilterQuery(item.q) ? (
                  <QueryCode q={item.q} />
                ) : (
                  <span className="pg-reel__mark">{nb(item.q)}</span>
                )}
              </span>
              {item.aside && <span className="s-small shrink-0 max-sm:hidden">{item.aside}</span>}
            </>
          );
          const props = {
            className: 'pg-reel__row',
            'data-on': i === on ? '' : undefined,
            onPointerEnter: (e: PointerEvent) => {
              if (e.pointerType === 'mouse') hold(i);
            },
            onFocus: () => hold(i),
          };
          return (
            <li key={item.q}>
              {item.href ? (
                <Link href={item.href} {...props}>
                  {row}
                </Link>
              ) : (
                <span {...props}>{row}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

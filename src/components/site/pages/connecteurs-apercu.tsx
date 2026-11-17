'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ProviderId } from '@/capture/turn';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { type Demo, type DemoSource, toolLabel, useSiteContent } from '../content';
import { Pile } from '../demo-card';
import { ToolLogo, tone } from '../parts';

// Le visuel du haut de la page Connecteurs : quatre lignes du catalogue (l'outil, ce que Leon en lit) et, à côté, la
// pile des originaux. Pointer ou choisir une ligne fait sortir son original de la pile (pages.css, pg-peek). Les
// originaux sont ceux des démos du site (content.ts, fictifs et dits tels) : rien n'est écrit ici.

const TOOLS: ProviderId[] = ['granola', 'hubspot', 'linear', 'github'];

export function ConnecteursApercu() {
  const common = useTranslations('site.common');
  const demoT = useTranslations('site.demo');
  const { demos, teams, reads } = useSiteContent();
  const [active, setActive] = useState(1);
  const all = [...demos, ...teams.map((t) => t.demo)].flatMap((d) => d.sources);
  const sources = TOOLS.map((id) => all.find((s) => s.tool === id)).filter(
    (s): s is DemoSource => s !== undefined,
  );
  if (sources.length === 0) return null;
  const demo: Demo = { id: 'apercu', tab: '', query: '', answer: '', sources };
  return (
    <div className="s-grid pg-peek items-center gap-y-10">
      <ol
        aria-label={demoT('sourcesLabel')}
        className="s-sheet pg-land pg-land--left col-[1/13] min-[1100px]:col-[1/8]"
      >
        {sources.map((s, i) => {
          const n = i + 1;
          return (
            <li key={s.tool}>
              <button
                type="button"
                className="s-note"
                aria-pressed={active === n}
                onClick={() => setActive(n)}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setActive(n);
                }}
                onFocus={() => setActive(n)}
              >
                <span aria-hidden="true" className={cn('num', tone(n))}>
                  {n}
                </span>
                <ToolLogo id={s.tool} size={20} lazy={false} />
                <span className="min-w-0">
                  <span className="s-note__t">{toolLabel(s.tool)}</span>
                  <span className="s-note__m">{nb(reads[s.tool])}</span>
                </span>
                <span />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="col-[1/13] min-[1100px]:col-[8/13]">
        <Pile demo={demo} active={Math.min(active, sources.length)} />
        <p className="s-fict mt-6 pl-[18px]">{common('fictional')}</p>
      </div>
    </div>
  );
}

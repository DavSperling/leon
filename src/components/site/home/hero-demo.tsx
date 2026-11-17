'use client';

import { useTranslations } from 'next-intl';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Demo } from '../content';
import { DemoScene } from '../demo-card';
import { motionHooks, type Pace } from '../motion/hooks';

// Le haut de l'accueil, sous le titre : trois questions en onglets d'index joints au bureau, et la scène de la réponse
// choisie (la feuille, ses renvois, la pile des originaux). Flèches gauche et droite d'un onglet à l'autre.
// L'onglet choisi change tout de suite ; la réponse, quand le mouvement a fait partir la précédente (motion/hooks.ts).

export function HeroTabs({ demos }: { demos: Demo[] }) {
  const t = useTranslations('site.heroDemo');
  const common = useTranslations('site.common');
  const [tab, setTab] = useState(0);
  const [shown, setShown] = useState<{ index: number; pace?: Pace }>({ index: 0 });
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const list = useRef<HTMLDivElement>(null);
  const base = useId();
  const demo = demos[shown.index];

  // La couleur de l'onglet choisi est une forme qui glisse d'un onglet à l'autre (sans script : l'onglet a sa couleur).
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const place = () => {
      const on = tabs.current[tab];
      if (!on) return;
      el.style.setProperty('--ind-l', `${on.offsetLeft}px`);
      el.style.setProperty('--ind-w', `${on.offsetWidth}px`);
      el.classList.add('has-ind');
    };
    place();
    window.addEventListener('resize', place);
    document.fonts?.ready.then(place);
    return () => window.removeEventListener('resize', place);
  }, [tab]);

  const choose = (i: number) => {
    const next = (i + demos.length) % demos.length;
    setTab(next);
    const commit = (pace?: Pace) => flushSync(() => setShown({ index: next, pace }));
    // la question déjà affichée : rien à jouer, sauf annuler une autre qui partait
    if (motionHooks.scenario) motionHooks.scenario(commit, next === shown.index);
    else if (next !== shown.index) commit();
  };
  const go = (i: number) => {
    choose(i);
    tabs.current[(i + demos.length) % demos.length]?.focus();
  };
  if (!demo) return null;
  const current = demos[tab] ?? demo;
  return (
    <>
      <div className="s-wrap">
        <div ref={list} role="tablist" aria-label={t('tabs')} className="s-tabs">
          <span aria-hidden="true" className="s-tabs__ind" />
          {demos.map((d, i) => (
            <button
              key={d.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={`${base}-tab-${d.id}`}
              type="button"
              role="tab"
              aria-selected={i === tab}
              aria-controls={`${base}-panel`}
              tabIndex={i === tab ? 0 : -1}
              onClick={() => choose(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') go(i + 1);
                else if (e.key === 'ArrowLeft') go(i - 1);
              }}
              className="s-tab"
            >
              {d.tab}
            </button>
          ))}
        </div>
      </div>
      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-${current.id}`}
        className="s-scene"
      >
        <div className="s-wrap">
          <DemoScene
            key={demo.id}
            demo={demo}
            stage={shown.pace ?? 'load'}
            onSelect={(n, commit) =>
              motionHooks.select ? motionHooks.select(n, commit) : commit()
            }
          />
          <p className="s-fict mt-6">{common('fictional')}</p>
        </div>
      </div>
    </>
  );
}

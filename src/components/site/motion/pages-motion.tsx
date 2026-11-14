'use client';

import { useLayoutEffect } from 'react';
import { isInstant, useInstant } from '@/lib/verre/instant';
import '../pages.css';

// Le mouvement des pages intérieures du site, monté par leur haut de page (page-hero.tsx). Les arrivées du haut sont
// en CSS (pages.css) ; les gestes du défilement (motion/pages.ts et GSAP) sont chargés à la demande. Mouvement réduit
// ou « Arrêter les animations » : rien n'est chargé, tout est défait, la page est finale à l'instant.

export function PagesMotion() {
  const instant = useInstant();
  useLayoutEffect(() => {
    if (instant || isInstant()) return;
    let stop: (() => void) | undefined;
    let dead = false;
    import('./pages')
      .then((m) => {
        if (!dead) stop = m.start();
      })
      .catch((err) => console.error('[site] mouvement', err));
    return () => {
      dead = true;
      stop?.();
    };
  }, [instant]);
  return null;
}

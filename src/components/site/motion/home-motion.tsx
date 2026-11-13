'use client';

import { useLayoutEffect, useRef } from 'react';
import { isInstant, useInstant } from '@/lib/verre/instant';
import './motion.css';

// Le mouvement de l'accueil, monté par l'accueil seul. Le CSS (motion.css) joue ce qui doit être juste à la première
// image ; le reste est chargé à la demande (motion/start.ts et GSAP : rien de tout cela n'entre dans les autres pages
// ni dans l'appli). Mouvement réduit ou « Arrêter les animations » : tout est défait, la page est finale à l'instant.

export function HomeMotion() {
  const instant = useInstant();
  // Le premier montage : un vrai chargement (le script de tête a posé js-motion) ou une navigation dans le site.
  const boot = useRef<{ at: number; hard: boolean; again: boolean } | null>(null);
  const wasOff = useRef(false);
  useLayoutEffect(() => {
    const html = document.documentElement;
    if (!boot.current)
      boot.current = {
        at: performance.now(),
        hard: html.classList.contains('js-motion'),
        again: false,
      };
    if (instant || isInstant()) {
      wasOff.current = true;
      html.classList.remove('js-motion', 'motion-on');
      return;
    }
    const at = boot.current;
    // Relancé par le bouton du pied : l'arrivée du haut ne se rejoue pas, elle est déjà là
    at.again = wasOff.current;
    wasOff.current = false;
    const end = () => {
      for (const el of document.querySelectorAll('.s-hero, .s-hero [data-stage]'))
        el.setAttribute('data-end', '');
    };
    if (at.again) end();
    html.classList.add('motion-on'); // avant la première image : la réponse du haut s'écrit aussi après une navigation
    // Un clic ou une touche avant que le module soit là termine aussi l'arrivée (ensuite, hero.ts s'en charge)
    const unlisten = () => {
      for (const type of ['pointerdown', 'keydown']) document.removeEventListener(type, end, true);
    };
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, end, true);
    let stop: (() => void) | undefined;
    let dead = false;
    import('./start')
      .then((m) => {
        unlisten();
        if (!dead) stop = m.start(at);
      })
      .catch((err) => {
        unlisten();
        console.error('[accueil] mouvement', err);
        html.classList.remove('js-motion');
      });
    return () => {
      dead = true;
      unlisten();
      stop?.();
      html.classList.remove('js-motion', 'motion-on');
    };
  }, [instant]);
  return null;
}

import type { Variants } from 'motion/react';
import { useEffect, useRef } from 'react';
import { duration, ease, rise, unfilter } from '@/lib';

/** Le `rise` du kit, délai passé en `custom` : une transition posée dans la variante l'emporte sur la prop `transition`. */
export const riseAt: Variants = {
  initial: rise.initial!,
  animate: (delay = 0) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: duration.slow, ease: ease.out, delay }, transitionEnd: unfilter }),
  exit: rise.exit!,
};

/**
 * `false` au premier rendu de l'écran, puis 'initial' : ce qui est déjà là au chargement s'affiche sans entrée,
 * seul ce qui arrive ensuite (résultats, retour à l'accueil) en joue une.
 */
export function useAppear(): false | 'initial' {
  const first = useRef(true);
  useEffect(() => void (first.current = false), []);
  return first.current ? false : 'initial';
}

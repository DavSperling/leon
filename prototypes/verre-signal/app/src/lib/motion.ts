import type { Transition, Variants } from 'motion/react';
import { useEffect, useRef } from 'react';

// Préréglages de mouvement partagés : les mêmes courbes et durées partout (celles de la planche).
export const ease = {
  out: [0.16, 1, 0.3, 1], // entrées : rapide puis se pose
  in: [0.4, 0, 1, 1], // sorties : part vite, sans rebond
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const duration = { enter: 0.26, exit: 0.14, fast: 0.18, slow: 0.6 } as const;

/** Ressort des puces, indicateurs et surlignages qui glissent. */
export const spring: Transition = { type: 'spring', stiffness: 520, damping: 36, mass: 0.8 };
/** Ressort plus souple : panneaux, feuilles. */
export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 30 };

export const enter: Transition = { duration: duration.enter, ease: ease.out };
export const exit: Transition = { duration: duration.exit, ease: ease.in };

// Un `filter` resté posé (même blur(0px)) fait de l'élément le bloc conteneur de tout `position: fixed` descendant
// et la racine des `backdrop-filter` : on le retire à la fin de chaque entrée (transitionEnd: unfilter).
export const unfilter = { filter: 'none' } as const;

/** Transition de page : fondu, légère montée et flou à l'entrée ; sortie plus courte. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: enter, transitionEnd: unfilter },
  exit: { opacity: 0, y: -4, filter: 'blur(2px)', transition: exit },
};

// `inherit: true` : la transition d'une variante se fond dans la prop `transition` de l'élément au lieu de la remplacer,
// d'où `<motion.li variants={rise} transition={{ delay: stagger(i) }}>` qui marche (la durée et la courbe restent celles d'ici).

/** Apparition d'un élément (carte, résultat) : monte de 10 px en sortant d'un flou. */
export const rise: Variants = {
  initial: { opacity: 0, y: 10, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: duration.slow, ease: ease.out, inherit: true }, transitionEnd: unfilter },
  exit: { opacity: 0, transition: exit },
};

/** Fondu simple. */
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { ...enter, inherit: true } },
  exit: { opacity: 0, transition: exit },
};

/** Puce qui éclot (renvoi [n], badge). */
export const pop: Variants = {
  initial: { opacity: 0, scale: 0.3 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 600, damping: 22, inherit: true } },
  exit: { opacity: 0, scale: 0.6, transition: exit },
};

/** Délai du i-ème élément d'une liste (70 ms d'écart, plafonné pour ne pas faire attendre). */
export const stagger = (i: number, step = 0.07, max = 0.6): number => Math.min(i * step, max);

/** Conteneur qui échelonne ses enfants `rise` : <motion.ol variants={list} initial="initial" animate="animate">. */
export const list: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.07 } },
};

/**
 * `false` au premier rendu du composant, puis 'initial' : `<motion.li initial={appear} animate="animate">`. Ce qui est là
 * dès l'arrivée sur l'écran s'affiche sans entrée ; seul ce qui arrive ensuite (un changement d'état) en joue une.
 */
export function useAppear(): false | 'initial' {
  const first = useRef(true);
  useEffect(() => void (first.current = false), []);
  return first.current ? false : 'initial';
}

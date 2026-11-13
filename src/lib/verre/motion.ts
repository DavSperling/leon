import type { Variants } from 'motion/react';

/** Transition de page : un fondu court (150 ms), sans montée ni flou. */
export const pageVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15, ease: [0.2, 0.7, 0.2, 1] } },
};

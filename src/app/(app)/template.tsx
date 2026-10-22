'use client';

import { motion } from 'motion/react';
import { type ReactNode, useEffect } from 'react';
import { pageVariants } from '@/lib/verre/motion';

// La première page s'affiche sans entrée (rendu serveur, pas de contenu invisible avant l'hydratation) ; chaque page
// suivante entre en fondu (Next remonte ce gabarit à chaque changement de page). Pas d'animation de sortie.
let booted = false;

export default function Template({ children }: { children: ReactNode }) {
  useEffect(() => {
    booted = true;
  }, []);
  return (
    <motion.div
      variants={pageVariants}
      initial={booted ? 'initial' : false}
      animate="animate"
      // largeur figée pendant le repli de la barre latérale (--page-w, app-shell.tsx)
      className="w-[var(--page-w,auto)]"
    >
      {children}
    </motion.div>
  );
}

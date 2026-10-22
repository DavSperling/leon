'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Brand } from '@/components/verre/shell/brand';
import { GlassCard } from '@/components/verre/ui/surfaces';
import { useInstant } from '@/lib/verre/instant';
import { rise } from '@/lib/verre/motion';
import { nb } from '@/lib/verre/nb';

/** La marque et la carte de verre des pages hors ossature (connexion, inscription, 404, erreur racine). */
export function StandaloneCard({ children }: { children: ReactNode }) {
  const instant = useInstant();
  return (
    <motion.div
      className="mx-auto w-full max-w-[392px]"
      variants={rise}
      initial={instant ? false : 'initial'}
      animate="animate"
    >
      {/* Brand a 6 px de marge interne : le logo s'aligne ainsi sur le bord de la carte */}
      <div className="-mx-1.5">
        <Brand />
      </div>
      <GlassCard variant="raised" className="mt-5 p-6 shadow-panel backdrop-blur-[30px] sm:p-7">
        {children}
      </GlassCard>
    </motion.div>
  );
}

/** Page système seule sur l'aurore (404, erreur racine) : un titre court, une phrase au besoin, un seul bouton. */
export function StandaloneMessage({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center px-4 py-14">
      <StandaloneCard>
        <h1 className="text-h2 font-semibold tracking-[-0.018em] text-fg">{nb(title)}</h1>
        {description && <p className="mt-2 text-body text-muted">{nb(description)}</p>}
        <div className="mt-6">{action}</div>
      </StandaloneCard>
    </div>
  );
}

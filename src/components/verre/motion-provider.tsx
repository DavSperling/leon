'use client';

import { MotionConfig, MotionGlobalConfig } from 'motion/react';
import { type ReactNode, useEffect } from 'react';
import { useInstant } from '@/lib/verre/instant';

// Les animations Motion (JS) suivent le mouvement réduit comme les animations CSS : préférence système, ou le bouton
// « Arrêter les animations » du site. Motion saute alors toutes ses animations (réglé ici, jamais au chargement du
// module).
export function MotionProvider({ children }: { children: ReactNode }) {
  const instant = useInstant();
  useEffect(() => {
    MotionGlobalConfig.skipAnimations = instant;
  }, [instant]);
  return <MotionConfig reducedMotion={instant ? 'always' : 'user'}>{children}</MotionConfig>;
}

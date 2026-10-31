'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { useInstant } from '@/lib/verre/instant';

// Les animations Motion (JS) suivent le mouvement réduit comme les animations CSS : préférence système, ou le bouton
// « Arrêter les animations » du site.
export function MotionProvider({ children }: { children: ReactNode }) {
  const instant = useInstant();
  return <MotionConfig reducedMotion={instant ? 'always' : 'user'}>{children}</MotionConfig>;
}

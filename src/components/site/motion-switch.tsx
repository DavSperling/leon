'use client';

import { useTranslations } from 'next-intl';
import { setMotionOff, useMotionOff } from '@/lib/verre/instant';

/** Arrête ou relance tout ce qui bouge sur le site (WCAG 2.2.2) ; le choix est mémorisé. */
export function MotionSwitch() {
  const t = useTranslations('site.footer');
  const off = useMotionOff();
  return (
    <button
      type="button"
      aria-pressed={off}
      onClick={() => setMotionOff(!off)}
      className="inline-flex items-center rounded-sm px-1.5 text-muted underline-offset-4 transition-colors duration-200 hover:text-fg aria-pressed:text-fg aria-pressed:underline pointer-coarse:min-h-10"
    >
      {off ? t('motionOn') : t('motionOff')}
    </button>
  );
}

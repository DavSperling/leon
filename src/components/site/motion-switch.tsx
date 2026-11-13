'use client';

import { useTranslations } from 'next-intl';
import { setMotionOff, useMotionOff } from '@/lib/verre/instant';

/** Arrête ou relance tout ce qui bouge sur le site (WCAG 2.2.2) ; le choix est mémorisé. Sa forme vient du pied
 *  (site.css, .s-foot__base button). */
export function MotionSwitch() {
  const t = useTranslations('site.footer');
  const off = useMotionOff();
  return (
    <button
      type="button"
      aria-pressed={off}
      onClick={() => setMotionOff(!off)}
      className="aria-pressed:underline"
    >
      {off ? t('motionOn') : t('motionOff')}
    </button>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useInstant } from '@/lib/verre/instant';
import { BrandLoader } from './brand-loader';

/** Marque les navigations entre pages sans ralentir le premier chargement ni les changements de recherche. */
export function RouteTransition() {
  const pathname = usePathname();
  const t = useTranslations('common');
  const instant = useInstant();
  const previousPath = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    if (!pathname) return;
    const previous = previousPath.current;
    previousPath.current = pathname;
    if (previous === null || previous === pathname) return;
    setVisible(!instant);
  }, [instant, pathname]);

  useEffect(() => {
    if (instant) {
      setVisible(false);
      return;
    }
    if (!visible) return;
    const timer = setTimeout(() => {
      if (previousPath.current === pathname) setVisible(false);
    }, 760);
    return () => clearTimeout(timer);
  }, [instant, pathname, visible]);

  return visible && !instant ? <BrandLoader label={t('loading')} transition /> : null;
}

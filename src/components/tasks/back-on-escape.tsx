'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isTypingOrBusy } from './typing';

// Échap revient à la liste, sauf quand on écrit quelque part, qu'un menu ou un dialogue a la main,
// ou qu'un autre élément a déjà pris la touche (preventDefault).
export function BackOnEscape({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isTypingOrBusy()) return;
      router.push(href);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [href, router]);
  return null;
}

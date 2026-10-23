'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/verre/cn';
import { isInstant } from '@/lib/verre/instant';

/**
 * Parallaxe du pointeur : le bloc glisse de quelques pixels vers la souris (`depth` px au bord de la fenêtre), avec un
 * léger retard. Rien sur écran tactile ni en mouvement réduit ; seul `transform` change, une fois par image.
 */
export function Parallax({
  depth = 10,
  className,
  children,
}: {
  depth?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || isInstant()) return;
    const target = { x: 0, y: 0 };
    const now = { x: 0, y: 0 };
    let raf = 0;
    const tick = () => {
      now.x += (target.x - now.x) * 0.08;
      now.y += (target.y - now.y) * 0.08;
      el.style.transform = `translate3d(${(now.x * depth).toFixed(2)}px, ${(now.y * depth).toFixed(2)}px, 0)`;
      if (Math.abs(target.x - now.x) + Math.abs(target.y - now.y) > 0.001)
        raf = requestAnimationFrame(tick);
      else raf = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [depth]);

  return (
    <div ref={ref} className={cn('will-change-transform', className)}>
      {children}
    </div>
  );
}

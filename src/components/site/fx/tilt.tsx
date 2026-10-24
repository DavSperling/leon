'use client';

import { type ComponentProps, type CSSProperties, type PointerEvent, useRef } from 'react';
import { cn } from '@/lib/verre/cn';
import { isInstant } from '@/lib/verre/instant';

/**
 * Carte qui s'incline vers le pointeur, avec un reflet qui le suit. Rien sur écran tactile ni en mouvement réduit.
 * Donnez à Tilt le rayon de la carte (className="rounded-box") : le reflet en hérite. Un enfant `.fx-pop` sort du plan.
 */
export function Tilt({
  max = 7,
  scale = 1.015,
  perspective = 1000,
  glare = true,
  className,
  children,
  onPointerMove,
  onPointerLeave,
  style,
  ...props
}: ComponentProps<'div'> & {
  /** Inclinaison maximale, en degrés. */
  max?: number;
  scale?: number;
  perspective?: number;
  glare?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(e);
    if (e.pointerType !== 'mouse' || isInstant()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(frame.current);
    // une écriture par image : seules des variables CSS changent, le contenu n'est pas recalculé
    frame.current = requestAnimationFrame(() => {
      el.dataset.tilting = '';
      el.style.setProperty('--rx', `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--ts', String(scale));
      el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    });
  };

  const leave = (e: PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(e);
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    delete el.dataset.tilting;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--ts', '1');
  };

  return (
    <div
      ref={ref}
      className={cn('fx-tilt', className)}
      style={{ '--tilt-p': `${perspective}px`, ...style } as CSSProperties}
      onPointerMove={move}
      onPointerLeave={leave}
      {...props}
    >
      {children}
      {glare && <span aria-hidden="true" className="fx-tilt-glare" />}
    </div>
  );
}

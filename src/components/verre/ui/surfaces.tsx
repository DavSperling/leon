'use client';

import { type ComponentProps, type PointerEvent, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/verre/cn';
import { mergeRefs } from '@/lib/verre/refs';

/**
 * Lueur qui suit le pointeur : posez `onPointerMove` sur un hôte `.spot-host` dont un enfant direct est `<span className="spot" />`.
 * Seule la lueur bouge (transform), l'hôte et son contenu ne sont pas recalculés.
 */
export function trackSpot(e: PointerEvent<HTMLElement>): void {
  const host = e.currentTarget;
  const spot = host.querySelector<HTMLElement>(':scope > .spot');
  if (!spot) return;
  const r = host.getBoundingClientRect();
  spot.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
}

export type GlassCardProps = ComponentProps<'div'> & {
  /** panel : verre léger (bg-panel = --glass), rayon 16 (résultats, lignes) ; raised : verre plus dense (bg-glass-2), rayon 18 (réponse, aperçu, formulaires). */
  variant?: 'panel' | 'raised';
  /** Touche Signal : filet dégradé sur l'arête haute et halo d'accent dessous (cartes importantes). */
  signal?: boolean;
  /** Lueur qui suit le pointeur. */
  spotlight?: boolean;
  /** Trait de lumière qui parcourt l'arête haute (Leon lit cette source). */
  reading?: boolean;
};

/** Carte de verre de la planche. */
export function GlassCard({
  variant = 'panel',
  signal,
  spotlight,
  reading,
  className,
  children,
  onPointerMove,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden border border-line shadow-hi',
        variant === 'panel' ? 'rounded-card bg-panel' : 'rounded-box bg-glass-2',
        signal && 'signal-line signal-glow',
        spotlight &&
          'spot-host transition-[border-color,background-color] duration-300 hover:border-line-strong',
        reading && 'reading',
        className,
      )}
      onPointerMove={(e) => {
        if (spotlight) trackSpot(e);
        onPointerMove?.(e);
      }}
      {...props}
    >
      {spotlight && <span className="spot" aria-hidden="true" />}
      {children}
    </div>
  );
}

/** Enveloppe qui ajoute la lueur du pointeur à n'importe quel bloc (donnez-lui son rayon). */
export function Spotlight({ className, children, onPointerMove, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('spot-host', className)}
      onPointerMove={(e) => {
        trackSpot(e);
        onPointerMove?.(e);
      }}
      {...props}
    >
      <span className="spot" aria-hidden="true" />
      {children}
    </div>
  );
}

export type BeamProps = ComponentProps<'div'> & {
  /** Le faisceau tourne et le halo s'allume (Leon travaille). */
  active?: boolean;
};

/**
 * Faisceau conique qui fait le tour de son enfant pendant que Leon travaille, plus un halo d'accent.
 * Donnez à Beam le même rayon que l'enfant (className="rounded-box") : l'anneau en hérite.
 */
export function Beam({ active, className, children, ref: outerRef, ...props }: BeamProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // écrasement vertical proportionnel au rapport hauteur / largeur : la course reste régulière sur la longueur
    const ro = new ResizeObserver(() =>
      el.style.setProperty('--k', ((3 * el.offsetHeight) / Math.max(1, el.offsetWidth)).toFixed(4)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={mergeRefs(ref, outerRef)}
      className={cn('beam-host min-w-0', className)}
      data-active={active || undefined}
      {...props}
    >
      {children}
      <div className="beam" aria-hidden="true">
        <b>
          <i />
        </b>
      </div>
    </div>
  );
}

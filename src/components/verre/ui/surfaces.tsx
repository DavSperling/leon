'use client';

import type { ComponentProps, PointerEvent } from 'react';
import { cn } from '@/lib/verre/cn';

/** La lueur du pointeur n'existe plus. La fonction reste, sans effet, pour ses appelants. */
export function trackSpot(_e: PointerEvent<HTMLElement>): void {}

export type GlassCardProps = ComponentProps<'div'> & {
  /** Les deux valent la même feuille : la prop reste pour ses appelants. */
  variant?: 'panel' | 'raised';
  /** Sans effet (le filet de signal n'existe plus). */
  signal?: boolean;
  /** Sans effet (la lueur du pointeur n'existe plus). */
  spotlight?: boolean;
  /** Sans effet : « Leon lit » se dit par ses mots sous le surligneur (`<Reading>`), pas sur l'arête d'une carte. */
  reading?: boolean;
};

/**
 * Une feuille posée sur le bureau : blanche, un trait fin, rayon 12, l'ombre du repos. Jamais une feuille dans une
 * autre. Le nom date du verre ; le remplissage intérieur (p-6…) reste à l'appelant.
 */
export function GlassCard({
  variant: _variant,
  signal: _signal,
  spotlight: _spotlight,
  reading: _reading,
  className,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card border border-line bg-sheet shadow-sheet',
        className,
      )}
      {...props}
    />
  );
}

/** La lueur du pointeur n'existe plus : un simple bloc, pour ses appelants. */
export function Spotlight({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('relative', className)} {...props} />;
}

export type BeamProps = ComponentProps<'div'> & {
  /** Sans effet : « en cours » se dit par le libellé, aria-busy et le surligneur qui passe une fois. */
  active?: boolean;
};

/** Le faisceau n'existe plus : un simple bloc autour de son enfant, pour ses appelants. */
export function Beam({ active: _active, className, ...props }: BeamProps) {
  return <div className={cn('relative min-w-0', className)} {...props} />;
}

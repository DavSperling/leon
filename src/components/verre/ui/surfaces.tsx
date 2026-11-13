import type { ComponentProps } from 'react';
import { cn } from '@/lib/verre/cn';

export type GlassCardProps = ComponentProps<'div'>;

/**
 * Une feuille posée sur le bureau : blanche, un trait fin, rayon 12, l'ombre du repos. Jamais une feuille dans une
 * autre. Le nom date du verre ; le remplissage intérieur (p-6…) reste à l'appelant.
 */
export function GlassCard({ className, ...props }: GlassCardProps) {
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

import { cn } from '@/lib/verre/cn';
import type { FlagTone } from './marks';

/** Deux initiales : celles du prénom et du nom ; un nom d'un seul mot donne ses deux premières lettres. Jamais un signe. */
export function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  const first = words[0] ?? '';
  const last = words.length > 1 ? (words.at(-1) ?? '') : '';
  return ((first[0] ?? '') + (last ? (last[0] ?? '') : (first[1] ?? ''))).toUpperCase() || '?';
}

/** La teinte d'une personne (1 à 4), la même partout : elle ne dépend que de son nom. */
export function tintOf(name: string): FlagTone {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return ((h % 4) + 1) as FlagTone;
}

const TINTS: Record<FlagTone, string> = { 1: 'bg-m1', 2: 'bg-m2', 3: 'bg-m3', 4: 'bg-m4' };
const SIZES = {
  24: 'size-6 text-label tracking-[-0.03em]',
  28: 'size-7 text-label',
  32: 'size-8 text-label',
  36: 'size-9 text-ui',
  44: 'size-11 text-lead',
} as const;

export type AvatarProps = {
  /** Le nom de la personne : ses initiales et sa teinte en viennent. */
  name: string;
  /** Sa photo, quand le compte en a une. */
  src?: string | null;
  /** 28 dans une tuile, 36 dans une carte, 44 en tête du panneau, 24 dans une ligne de faits, 32 ailleurs. */
  size?: keyof typeof SIZES;
  className?: string;
};

/**
 * Une personne : un rond, sa photo ou ses initiales sur une teinte douce. Décoratif (aria-hidden) : le nom est écrit à
 * côté, ou porté par le bouton qui l'entoure (aria-label).
 */
export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const box = cn(
    'inline-grid shrink-0 place-items-center overflow-hidden rounded-full leading-none font-semibold text-fg select-none',
    SIZES[size],
    className,
  );
  if (src)
    return (
      <span aria-hidden="true" className={box}>
        {/* biome-ignore lint/performance/noImgElement: petite photo de profil, adresse externe, rien à optimiser */}
        <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      </span>
    );
  return (
    <span aria-hidden="true" className={cn(box, TINTS[tintOf(name)])}>
      {initialsOf(name)}
    </span>
  );
}

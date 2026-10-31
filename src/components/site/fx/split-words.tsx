import type { CSSProperties } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';

export type WordsPart = { text: string; className?: string };

/**
 * Titre dont chaque mot bascule en 3D depuis l'arrière, l'un après l'autre (CSS seul : visible sans JavaScript).
 * `parts` : des morceaux de texte, chacun avec sa classe (« site-gradient » sur la fin du titre…). Les mots restent des
 * spans en ligne : un seul titre dans le DOM, lu d'un trait, copié une fois.
 */
export function SplitWords({
  parts,
  delay = 0,
  className,
}: {
  parts: WordsPart[];
  /** Délai avant le premier mot, en ms. */
  delay?: number;
  className?: string;
}) {
  let w = 0;
  return (
    <span
      className={cn('fx-words', className)}
      style={{ '--fx-base': `${delay}ms` } as CSSProperties}
    >
      {parts.map((part) =>
        nb(part.text)
          .split(/([ \t\n]+)/)
          .map((word, k) => {
            if (word === '') return null;
            if (/^[ \t\n]+$/.test(word)) return word;
            const i = w++;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: mots d'un titre figé, dans l'ordre
                key={`${part.text}-${k}`}
                className={cn('fx-word', part.className)}
                style={{ '--w': i } as CSSProperties}
              >
                {word}
              </span>
            );
          }),
      )}
    </span>
  );
}

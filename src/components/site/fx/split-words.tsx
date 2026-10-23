import type { CSSProperties } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';

export type WordsPart = { text: string; className?: string };

/**
 * Titre dont chaque mot bascule en 3D depuis l'arrière, l'un après l'autre (CSS seul : visible sans JavaScript).
 * `parts` : des morceaux de texte, chacun avec sa classe (« site-gradient » sur la fin du titre…). Lu d'un bloc par les
 * lecteurs d'écran (aria-label), les mots découpés sont cachés.
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
  const label = nb(parts.map((p) => p.text).join(''));
  let w = 0;
  return (
    <span
      className={cn('fx-words', className)}
      style={{ '--fx-base': `${delay}ms` } as CSSProperties}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">
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
    </span>
  );
}

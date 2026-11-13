import type { ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { Flag, toneOf } from './marks';

export type OriginalSheetProps = {
  /** Le numéro de la source : son drapeau sort du bord gauche, et le passage prend sa couleur. */
  n?: number;
  /** La ligne discrète au-dessus des mots : « Gmail · E-mail · 3 oct. » (ici, dans le panneau, une date a sa place). */
  meta?: ReactNode;
  /** Les mots du document, en paragraphes ; le passage retrouvé dans un `<mark>` (`<Highlighted>` en écrit). */
  children: ReactNode;
  className?: string;
};

/**
 * L'original d'une source, ouvert à son passage : une feuille couchée sur une bande de bureau, ses mots en sérif (la
 * seule place du sérif). Premier enfant du corps d'un `SidePanel` : la bande va d'un bord à l'autre du panneau
 * (ailleurs, annulez ses marges : className="m-0").
 */
export function OriginalSheet({ n, meta, children, className }: OriginalSheetProps) {
  const tone = n == null ? 4 : toneOf(n);
  return (
    <div className={cn('well', className)}>
      <article className={`doc c${tone}`}>
        {n != null && (
          <Flag tone={tone} side="left">
            {n}
          </Flag>
        )}
        {meta && <p className="doc__meta">{meta}</p>}
        <div className="doc__body">{children}</div>
      </article>
    </div>
  );
}

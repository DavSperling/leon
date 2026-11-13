import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';

// Les marques du look « Papier » (formes dans src/app/kit.css) : rares, et toujours pour dire quelque chose.

/** 1 rose, 2 vert, 3 bleu, 4 ambre. */
export type FlagTone = 1 | 2 | 3 | 4;

/** La couleur de la source n : la source 5 reprend la couleur de la 1. Dans une réponse, la couleur n reste la source n. */
export const toneOf = (n: number): FlagTone =>
  (((((Math.trunc(n) - 1) % 4) + 4) % 4) + 1) as FlagTone;

export type FlagProps = ComponentProps<'span'> & {
  tone?: FlagTone;
  /** right : dans le texte, à côté d'un titre (il compte une section) ; left : sur le bord gauche d'un document. */
  side?: 'right' | 'left';
};

/** Le drapeau : un marque-page avec son encoche. Il porte un nombre (ce que la section contient, le numéro d'une source). */
export function Flag({ tone = 4, side = 'right', className, ...props }: FlagProps) {
  return (
    <span
      className={cn(side === 'left' ? 'flag flag--left' : 'tag', `c${tone}`, className)}
      {...props}
    />
  );
}

/**
 * Les trois traits de surligneur : la signature du champ où l'on demande à Leon, et de lui seul. Ils se retracent
 * quand le champ est pointé : posez `group` sur le champ.
 */
export function Strokes({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('strokes', className)}>
      <i />
      <i />
      <i />
    </span>
  );
}

/** « Leon lit… » : les mots sous le surligneur, qui passe une fois. À remplacer par la réponse quand elle arrive. */
export function Reading({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p role="status" className={cn('reading-line', className)}>
      <span className="mark is-working">{children}</span>
    </p>
  );
}

/** « Fait » dit sur place : les mots sous un trait vert, tracé une fois (« Enregistré », « Outlook est connecté »). */
export function DoneMark({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('mark is-on', className)}>{children}</span>;
}

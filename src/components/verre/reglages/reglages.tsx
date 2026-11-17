import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/verre';

export const INLINE =
  'rounded-field border border-line bg-glass-3 px-1.5 py-px font-mono text-label tracking-normal whitespace-nowrap text-fg';
// Gardé pour les sections que l'écran Équipe reprend (membres, groupes, organigramme) tant qu'elles vivent ici.
export const SECTION = 'mt-12 first:mt-0 scroll-mt-20 shell:scroll-mt-6';

/** Une feuille de réglages : sa tête (une personne, l'organisation), puis ses lignes. */
export function Rows({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-sheet px-6 shadow-sheet max-sm:px-4',
        className,
      )}
      {...props}
    />
  );
}

/** La tête d'une feuille : l'image (44 px), le nom, une légende discrète. */
export function RowsHead({
  picture,
  name,
  caption,
}: {
  picture: ReactNode;
  name: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line py-5">
      {picture}
      <span className="grid min-w-0">
        <b className="text-h2 leading-[1.3] font-semibold tracking-[-0.012em] [overflow-wrap:anywhere]">
          {name}
        </b>
        {caption && <span className="text-label text-muted">{caption}</span>}
      </span>
    </div>
  );
}

/**
 * Une ligne : son libellé (200 px), sa valeur ou son champ, son action au bord droit. Au téléphone, la valeur passe
 * sous le libellé et un champ prend toute la largeur.
 */
export function Row({
  label,
  htmlFor,
  action,
  top,
  id,
  children,
}: {
  label: ReactNode;
  /** Le champ que le libellé nomme. */
  htmlFor?: string;
  action?: ReactNode;
  /** Un champ haut (un texte long) : le libellé reste en haut. */
  top?: boolean;
  id?: string;
  children?: ReactNode;
}) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div
      id={id}
      className={cn(
        'grid min-h-[68px] scroll-mt-24 grid-cols-[200px_minmax(0,1fr)_auto] gap-x-6 gap-y-2 border-b border-line py-3.5 last:border-b-0',
        top ? 'items-start' : 'items-center',
        'max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-1',
      )}
    >
      <Label
        htmlFor={htmlFor}
        className={cn('text-ui leading-5 font-medium text-fg', top && 'pt-2.5 max-sm:pt-0')}
      >
        {label}
      </Label>
      <div
        className={cn(
          'min-w-0 max-sm:row-start-2 empty:max-sm:hidden',
          htmlFor && 'max-sm:col-span-2 max-sm:mt-1',
        )}
      >
        {children}
      </div>
      {action && (
        <div className="justify-self-end max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1">
          {action}
        </div>
      )}
    </div>
  );
}

/** L'état d'une ligne, en mots (« Activée », « Pas configuré ») ; rouge seulement quand quelque chose ne va pas. */
export function RowState({ wrong, children }: { wrong?: boolean; children: ReactNode }) {
  return (
    <span className={cn('text-ui', wrong ? 'font-medium text-destructive' : 'text-muted')}>
      {children}
    </span>
  );
}

/** L'erreur d'un champ de ligne, sous lui, annoncée. */
export function RowError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-label font-medium text-destructive">
      {children}
    </p>
  );
}

/** L'image d'une chose sans logo (un ordinateur, un jeton, l'organisation) : son icône sur un carré blanc. */
export function Glyph({ icon: Icon, size = 36 }: { icon: LucideIcon; size?: 28 | 36 | 44 }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center border border-line bg-sheet text-fg',
        size === 28 ? 'rounded-field' : 'rounded-item',
      )}
      style={{ width: size, height: size }}
    >
      <Icon strokeWidth={1.6} style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

/** Une étape numérotée (l'extension du navigateur). */
export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden="true"
        className="mt-px grid size-6 place-items-center rounded-full border border-line-strong text-label text-fg-2 tabular-nums"
      >
        {n}
      </span>
      <p className="text-ui leading-[1.6] text-fg-2">
        <span className="sr-only">{n}. </span>
        {children}
      </p>
    </li>
  );
}

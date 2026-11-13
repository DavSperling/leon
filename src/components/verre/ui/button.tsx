'use client';

import type { LucideIcon } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { Tooltip } from './menu';

/**
 * Un seul `primary` par vue : la pastille d'encre. `secondary` : toute autre action (contour). `quiet` et `ghost` : le
 * retour, une suppression avant qu'on la confirme (sans contour). `destructive` : seulement dans une confirmation
 * (contour rouge). `link` : souligné.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'ghost' | 'destructive' | 'link';
/** xs 28 px (dans une ligne), sm 32, md 36. `lg` reste accepté et vaut `md` : le kit n'a pas de bouton de 40 px. */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

// Tailwind 4 écrit active:scale-* dans la propriété `scale` : c'est elle qu'on fait transiter.
// En chargement, le bouton reste focalisable (aria-disabled, clic avalé) : le focus clavier ne tombe pas sur <body>.
const BASE =
  'relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border font-sans font-medium select-none ' +
  'transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[.97] ' +
  'disabled:pointer-events-none disabled:opacity-60 aria-busy:cursor-progress aria-busy:opacity-60 aria-busy:active:scale-100 [&_svg]:shrink-0';
const QUIET =
  'border-transparent text-fg-2 hover:bg-hover hover:text-fg active:bg-n-150 [&_svg]:text-icon';
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'border-ink bg-ink text-on-ink hover:border-accent-hover hover:bg-accent-hover aria-busy:hover:bg-ink',
  secondary:
    'border-line-strong bg-sheet text-fg hover:border-fg hover:bg-n-50 [&_svg]:text-fg-2 hover:[&_svg]:text-fg',
  quiet: QUIET,
  ghost: QUIET,
  destructive:
    'border-destructive-line bg-sheet text-destructive hover:border-destructive hover:bg-destructive-soft',
  link: 'h-auto! rounded-sm border-0 px-0! text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg active:scale-100',
};
// Au doigt (sous la coque de bureau), un bouton fait 44 px ; xs vit dans une ligne ou une tuile, qui est la cible.
const MD = 'h-9 gap-2 px-4 text-ui max-shell:h-11 [&_svg]:size-4';
const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1.5 px-3 text-label [&_svg]:size-3.5',
  sm: 'h-8 gap-1.5 px-3.5 text-label max-shell:h-11 [&_svg]:size-3.5',
  md: MD,
  lg: MD,
};

export type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icône lucide avant le texte. */
  icon?: LucideIcon;
  /** aria-busy + aria-disabled : le clic est ignoré, le focus reste sur le bouton. Rien ne tourne : c'est le libellé qui le dit. */
  loading?: boolean;
  /** Le verbe pendant `loading` (« Enregistrement… ») : il remplace le libellé. */
  loadingLabel?: ReactNode;
  /** Rend l'enfant unique (un <Link>…) avec les styles du bouton. */
  asChild?: boolean;
};

/** Pendant le chargement : le clic (et l'envoi de formulaire qu'il déclencherait) est avalé. */
const busyClick = (e: { preventDefault: () => void }) => e.preventDefault();

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  loadingLabel,
  asChild,
  className,
  children,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  // en cours : le surligneur passe une fois le long du bouton, pour qu'il ne se lise pas comme désactivé
  const cls = cn(
    BASE,
    VARIANTS[variant],
    SIZES[size],
    loading && 'is-working relative overflow-hidden',
    className,
  );
  if (asChild)
    return (
      <Slot.Root className={cls} onClick={onClick} {...props}>
        {Icon && <Icon aria-hidden="true" strokeWidth={1.8} />}
        <Slot.Slottable>{children}</Slot.Slottable>
      </Slot.Root>
    );
  return (
    <button
      type="button"
      className={cls}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? busyClick : onClick}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" strokeWidth={1.8} />}
      {loading && loadingLabel != null ? loadingLabel : children}
      {loading && <span className="work" aria-hidden="true" />}
    </button>
  );
}

const ICON_SIZES = {
  sm: 'size-7 [&_svg]:size-4',
  md: 'size-8 max-shell:size-11 [&_svg]:size-[18px]',
  lg: 'size-10 max-shell:size-11 [&_svg]:size-[18px]',
} as const;
const ICON_VARIANTS = {
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg active:bg-n-150',
  secondary:
    'border border-line-strong bg-sheet text-fg-2 hover:border-fg hover:bg-n-50 hover:text-fg',
  primary: 'bg-ink text-on-ink hover:bg-accent-hover',
} as const;

export type IconButtonProps = Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & {
  icon: LucideIcon;
  /** Nom accessible, obligatoire ; montré aussi en infobulle. */
  label: string;
  variant?: keyof typeof ICON_VARIANTS;
  size?: keyof typeof ICON_SIZES;
  /** Infobulle avec le libellé (oui par défaut). */
  tooltip?: boolean;
  loading?: boolean;
};

export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  tooltip = true,
  loading,
  className,
  disabled,
  onClick,
  ...props
}: IconButtonProps) {
  const btn = (
    <button
      type="button"
      aria-label={label}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      disabled={disabled}
      onClick={loading ? busyClick : onClick}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-item transition-[background-color,border-color,color] duration-150 disabled:pointer-events-none disabled:opacity-60 aria-busy:cursor-progress aria-busy:opacity-60',
        ICON_SIZES[size],
        ICON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" strokeWidth={1.6} />
    </button>
  );
  return tooltip ? <Tooltip content={label}>{btn}</Tooltip> : btn;
}

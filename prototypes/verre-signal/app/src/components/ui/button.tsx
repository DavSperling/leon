import type { LucideIcon } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './menu';

/** Un seul `primary` par vue. `quiet` : action répétée sur chaque ligne d'une liste (contour fin, sans fond ni accent). */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

// Tailwind 4 écrit active:scale-* dans la propriété `scale` : c'est elle qu'on fait transiter.
// En chargement, le bouton reste focalisable (aria-disabled, clic avalé) : le focus clavier ne tombe pas sur <body>.
const BASE =
  'relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-sans font-medium tracking-[-0.01em] select-none ' +
  'transition-[background-color,border-color,color,filter,scale] duration-200 ease-out active:scale-[.97] ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-busy:opacity-80 aria-busy:active:scale-100 [&_svg]:shrink-0';
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.3)] hover:brightness-[1.06]',
  secondary: 'border border-line-strong bg-glass-3 text-fg hover:bg-hover [&_svg]:text-accent',
  quiet: 'border border-line text-fg-2 hover:border-line-strong hover:bg-hover hover:text-fg [&_svg]:text-muted',
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg [&_svg]:text-muted',
  destructive: 'bg-destructive text-destructive-ink font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,.2)] hover:brightness-[1.06]',
  link: 'h-auto! px-0! rounded-sm text-accent underline-offset-4 decoration-accent-line hover:underline active:scale-100',
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3.5 text-label [&_svg]:size-3.5',
  md: 'h-9 gap-2 px-4 text-ui [&_svg]:size-4',
  lg: 'h-10 gap-2 px-5 text-ui [&_svg]:size-4',
};

export type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icône lucide avant le texte ; remplacée par la rotation pendant `loading`. */
  icon?: LucideIcon;
  /** Rotation + aria-busy + aria-disabled : le clic est ignoré, le focus reste sur le bouton. */
  loading?: boolean;
  /** Rend l'enfant unique (un <Link>…) avec les styles du bouton. */
  asChild?: boolean;
};

/** Pendant le chargement : le clic (et l'envoi de formulaire qu'il déclencherait) est avalé. */
const busyClick = (e: { preventDefault: () => void }) => e.preventDefault();

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, asChild, className, children, disabled, onClick, ...props }: ButtonProps) {
  const cls = cn(BASE, VARIANTS[variant], SIZES[size], className);
  if (asChild)
    return (
      <Slot.Root className={cls} onClick={onClick} {...props}>
        {Icon && <Icon aria-hidden="true" strokeWidth={1.8} />}
        <Slot.Slottable>{children}</Slot.Slottable>
      </Slot.Root>
    );
  return (
    <button type="button" className={cls} disabled={disabled} aria-busy={loading || undefined} aria-disabled={loading || undefined} onClick={loading ? busyClick : onClick} {...props}>
      {loading ? <span className="spin" aria-hidden="true" /> : Icon && <Icon aria-hidden="true" strokeWidth={1.8} />}
      {children}
    </button>
  );
}

const ICON_SIZES = { sm: 'size-7 [&_svg]:size-3.5', md: 'size-[34px] [&_svg]:size-4', lg: 'size-10 [&_svg]:size-[18px]' } as const;
const ICON_VARIANTS = {
  ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
  secondary: 'border border-line bg-glass-3 text-fg-2 hover:border-line-strong hover:text-fg',
  primary: 'bg-accent text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,.3)] hover:brightness-[1.06]',
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

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', tooltip = true, loading, className, disabled, onClick, ...props }: IconButtonProps) {
  const btn = (
    <button
      type="button"
      aria-label={label}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      disabled={disabled}
      onClick={loading ? busyClick : onClick}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full transition-[background-color,border-color,color,filter,scale] duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-busy:opacity-80 aria-busy:active:scale-100',
        ICON_SIZES[size], ICON_VARIANTS[variant], className,
      )}
      {...props}
    >
      {loading ? <span className="spin" aria-hidden="true" /> : <Icon aria-hidden="true" strokeWidth={1.7} />}
    </button>
  );
  return tooltip ? <Tooltip content={label}>{btn}</Tooltip> : btn;
}

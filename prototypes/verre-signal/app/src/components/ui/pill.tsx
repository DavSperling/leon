import { ChevronDown, type LucideIcon, X } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export type PillProps = ComponentProps<'button'> & {
  /** default : contour ; active : filtre en place (accent) ; warning : filtre non reconnu. */
  variant?: 'default' | 'active' | 'warning';
  icon?: LucideIcon;
  /** Chevron de menu : tourne quand le menu est ouvert (data-state="open" ou aria-expanded). */
  chevron?: boolean;
  /** Croix finale : toute la pastille retire le filtre (donnez un aria-label « Retirer le filtre « … » »). */
  removable?: boolean;
  asChild?: boolean;
};

const VARIANTS = {
  default: 'border-line bg-glass-3 text-fg-2 hover:border-line-strong hover:text-fg data-[state=open]:border-line-strong data-[state=open]:bg-hover data-[state=open]:text-fg aria-expanded:border-line-strong aria-expanded:bg-hover aria-expanded:text-fg [&_svg]:text-muted',
  active: 'border-accent-line bg-accent-soft text-accent hover:border-accent [&_svg]:text-accent',
  warning: 'border-warning-line bg-warning-soft text-warning hover:border-warning [&_svg]:text-warning',
} as const;

/** Pastille de filtre (h 32 px, entièrement ronde), comme la rangée de filtres de la planche. */
export function Pill({ variant = 'default', icon: Icon, chevron, removable, asChild, className, children, ...props }: PillProps) {
  const cls = cn(
    'group inline-flex h-8 shrink-0 items-center gap-[7px] rounded-full border px-[13px] text-label font-medium whitespace-nowrap transition-[border-color,background-color,color] duration-200 [&_svg]:size-3.5',
    VARIANTS[variant],
    className,
  );
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp type={asChild ? undefined : 'button'} className={cls} {...props}>
      {Icon && <Icon aria-hidden="true" strokeWidth={1.7} />}
      <Slot.Slottable>{children}</Slot.Slottable>
      {chevron && <ChevronDown aria-hidden="true" className="-mr-[3px] transition-transform duration-[250ms] ease-out group-data-[state=open]:rotate-180 group-aria-expanded:rotate-180" />}
      {removable && <X aria-hidden="true" className="-mr-1" />}
    </Comp>
  );
}

'use client';

import { ChevronDown, type LucideIcon, X } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/verre/cn';

export type PillProps = ComponentProps<'button'> & {
  /** default : contour ; active : la puce choisie (encre pleine ; aria-pressed="true" fait de même) ; warning : filtre non reconnu. */
  variant?: 'default' | 'active' | 'warning';
  icon?: LucideIcon;
  /** Chevron de menu : tourne quand le menu est ouvert (data-state="open" ou aria-expanded). */
  chevron?: boolean;
  /** Croix finale : toute la pastille retire le filtre (donnez un aria-label « Retirer le filtre « … » »). */
  removable?: boolean;
  asChild?: boolean;
};

const VARIANTS = {
  default:
    'border-line bg-sheet text-fg hover:border-fg data-[state=open]:border-fg aria-expanded:border-fg aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-on-ink [&_svg]:text-icon aria-pressed:[&_svg]:text-on-ink',
  active: 'border-ink bg-ink text-on-ink [&_svg]:text-on-ink',
  warning:
    'border-warning-line bg-warning-soft text-warning hover:border-warning [&_svg]:text-warning',
} as const;

/** Puce (h 32 px, 44 au doigt, entièrement ronde) : un filtre, un onglet, le déclencheur d'un menu. Une seule est choisie à la fois. */
export function Pill({
  variant = 'default',
  icon: Icon,
  chevron,
  removable,
  asChild,
  className,
  children,
  ...props
}: PillProps) {
  const cls = cn(
    'group inline-flex h-8 shrink-0 items-center gap-[7px] rounded-full border px-3.5 text-label font-medium whitespace-nowrap transition-[border-color,background-color,color,scale] duration-150 active:scale-[.97] max-shell:h-11 [&_svg]:size-3.5',
    VARIANTS[variant],
    className,
  );
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp type={asChild ? undefined : 'button'} className={cls} {...props}>
      {Icon && <Icon aria-hidden="true" strokeWidth={1.7} />}
      <Slot.Slottable>{children}</Slot.Slottable>
      {chevron && (
        <ChevronDown
          aria-hidden="true"
          className="-mr-[3px] transition-transform duration-150 ease-out group-data-[state=open]:rotate-180 group-aria-expanded:rotate-180"
        />
      )}
      {removable && <X aria-hidden="true" className="-mr-1" />}
    </Comp>
  );
}

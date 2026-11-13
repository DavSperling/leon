'use client';

import type { LucideIcon } from 'lucide-react';
import { DropdownMenu as RMenu, Popover as RPopover, Tooltip as RTooltip } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { CheckboxBox } from './form';

// Une feuille tenue au-dessus : son trait (plus marqué en sombre, où l'ombre ne porte pas) et l'ombre la plus haute.
const LAYER =
  'layer-pop z-[60] rounded-card border border-float-line bg-menu text-fg shadow-float outline-none';

// ---------- Menu déroulant (Radix) : lignes de 34 px (44 au doigt), surbrillance au survol et au clavier ----------
export const DropdownMenu = RMenu.Root;
export const DropdownMenuTrigger = RMenu.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = 'start',
  children,
  ...props
}: ComponentProps<typeof RMenu.Content>) {
  return (
    <RMenu.Portal>
      {/* une longue liste (43 outils) défile dans la place disponible au lieu de sortir de l'écran */}
      <RMenu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
        className={cn(
          LAYER,
          'max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[220px] overflow-y-auto overscroll-contain p-1.5',
          className,
        )}
        {...props}
      >
        {children}
      </RMenu.Content>
    </RMenu.Portal>
  );
}

// Survol en bg-hover, et au clavier un anneau intérieur de 2 px (Radix focalise la ligne). Les icônes restent discrètes.
const ITEM =
  'relative flex h-[34px] w-full cursor-pointer items-center gap-2.5 rounded-item px-2 text-ui font-medium text-fg outline-none select-none max-shell:h-11 ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] ' +
  '[&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:text-icon';

export type MenuItemProps = ComponentProps<typeof RMenu.Item> & {
  icon?: LucideIcon /** méta à droite, discrète (un état, un raccourci) */;
  meta?: ReactNode;
  destructive?: boolean;
};

export function DropdownMenuItem({
  icon: Icon,
  meta,
  destructive,
  className,
  children,
  ...props
}: MenuItemProps) {
  return (
    <RMenu.Item
      className={cn(
        ITEM,
        destructive &&
          'text-destructive data-[highlighted]:text-destructive [&>svg]:text-destructive',
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" strokeWidth={1.7} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta != null && <span className="text-label font-normal text-muted">{meta}</span>}
    </RMenu.Item>
  );
}

export type MenuCheckboxItemProps = Omit<ComponentProps<typeof RMenu.CheckboxItem>, 'checked'> & {
  checked: boolean;
  icon?: LucideIcon;
  meta?: ReactNode;
};

/** Ligne à cocher (filtres) : la case reste ouverte au clic (onSelect empêché). */
export function DropdownMenuCheckboxItem({
  checked,
  icon: Icon,
  meta,
  className,
  children,
  onSelect,
  ...props
}: MenuCheckboxItemProps) {
  return (
    <RMenu.CheckboxItem
      checked={checked}
      onSelect={(e) => {
        e.preventDefault();
        onSelect?.(e);
      }}
      className={cn(ITEM, className)}
      {...props}
    >
      <CheckboxBox checked={checked} />
      {Icon && <Icon aria-hidden="true" strokeWidth={1.7} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta != null && <span className="text-label font-normal text-muted">{meta}</span>}
    </RMenu.CheckboxItem>
  );
}

/** En-tête de menu : « Filtrer par outil      sources ». */
export function DropdownMenuLabel({
  className,
  meta,
  children,
  ...props
}: ComponentProps<typeof RMenu.Label> & { meta?: ReactNode }) {
  return (
    <RMenu.Label
      className={cn(
        'flex items-baseline justify-between gap-3 px-2 pt-1.5 pb-1.5 text-label font-medium text-muted',
        className,
      )}
      {...props}
    >
      {children}
      {meta != null && <span className="font-normal">{meta}</span>}
    </RMenu.Label>
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof RMenu.Separator>) {
  return <RMenu.Separator className={cn('mx-1 my-1.5 h-px bg-line', className)} {...props} />;
}

// ---------- Fenêtre ancrée (Radix) ----------
export const Popover = RPopover.Root;
export const PopoverTrigger = RPopover.Trigger;

export function PopoverContent({
  className,
  sideOffset = 8,
  align = 'start',
  ...props
}: ComponentProps<typeof RPopover.Content>) {
  return (
    <RPopover.Portal>
      <RPopover.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
        className={cn(LAYER, 'w-[300px] max-w-[calc(100vw-24px)] p-4 text-ui', className)}
        {...props}
      />
    </RPopover.Portal>
  );
}

// ---------- Infobulle (Radix) ; TooltipProvider est monté une fois à la racine ----------
export const TooltipProvider = RTooltip.Provider;

export function Tooltip({
  content,
  side = 'top',
  children,
  className,
}: {
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
  className?: string;
}) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'layer-pop z-[80] max-w-[260px] rounded-chip bg-ink px-[9px] py-1.5 text-label leading-[1.2] font-medium text-on-ink',
            className,
          )}
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

'use client';

import type { LucideIcon } from 'lucide-react';
import { DropdownMenu as RMenu, Popover as RPopover, Tooltip as RTooltip } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import { CheckboxBox } from './form';

const LAYER =
  'layer-pop z-[60] rounded-card border border-line-strong bg-menu shadow-float outline-none';

// ---------- Menu déroulant (Radix) : lignes nettes de 34 px, surbrillance au survol et au clavier ----------
export const DropdownMenu = RMenu.Root;
export const DropdownMenuTrigger = RMenu.Trigger;
export const DropdownMenuGroup = RMenu.Group;

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

// Comme les .mi de la planche : survol en bg-hover, et au clavier un anneau intérieur de 2 px (Radix focalise la ligne).
const ITEM =
  'relative flex h-[34px] w-full cursor-pointer items-center gap-2.5 rounded-item px-2.5 text-ui text-fg-2 outline-none select-none ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover data-[highlighted]:text-fg focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] ' +
  '[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted';

export type MenuItemProps = ComponentProps<typeof RMenu.Item> & {
  icon?: LucideIcon /** méta à droite, en mono (compteur, raccourci) */;
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
      {meta != null && (
        <span className="font-mono text-[11px] tracking-normal text-muted">{meta}</span>
      )}
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
      className={cn(ITEM, 'pl-2 data-[state=checked]:text-fg', className)}
      {...props}
    >
      <CheckboxBox checked={checked} />
      {Icon && <Icon aria-hidden="true" strokeWidth={1.7} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta != null && (
        <span className="font-mono text-[11px] tracking-normal text-muted">{meta}</span>
      )}
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
        'flex items-baseline justify-between gap-3 px-2.5 pt-1.5 pb-1.5 text-meta font-semibold text-muted',
        className,
      )}
      {...props}
    >
      {children}
      {meta != null && (
        <span className="font-mono text-[11px] font-normal tracking-normal">{meta}</span>
      )}
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
export const PopoverAnchor = RPopover.Anchor;
export const PopoverClose = RPopover.Close;

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
            'layer-pop z-[80] max-w-[260px] rounded-[9px] border border-line-strong bg-menu px-2.5 py-1.5 text-[12px] leading-snug font-medium text-fg shadow-float',
            className,
          )}
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

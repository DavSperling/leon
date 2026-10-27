'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AlertDialog as RAlert, Collapsible as RCollapsible, Dialog as RDialog } from 'radix-ui';
import { type ComponentProps, type CSSProperties, type ReactNode, useRef } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { Button } from './button';

// Fenêtres de verre (Radix : piège du focus, Échap). Entrée 260 ms (montée + flou), sortie 140 ms.
// Le voile ne floute pas la page (comme la palette ⌘K de la planche).

const SCRIM = 'layer-scrim fixed inset-0 z-50 bg-scrim';
const PANEL =
  'layer-dialog glass-float signal-line fixed top-[max(16px,12vh)] left-1/2 z-50 grid max-h-[calc(100dvh-32px-12vh)] w-[min(var(--w),calc(100vw-32px))] -translate-x-1/2 gap-4 overflow-y-auto rounded-[20px] border border-line-strong p-6 shadow-float outline-none ' +
  'max-sm:top-auto max-sm:bottom-4';
const TITLE = 'text-[17px] leading-snug font-semibold tracking-[-0.015em] text-fg';
const CLOSE =
  'absolute top-4 right-4 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg';

type AutoFocusHandlers = {
  onOpenAutoFocus?: (e: Event) => void;
  onCloseAutoFocus?: (e: Event) => void;
};

/**
 * Retour du focus à l'élément qui avait le focus à l'ouverture, même sans déclencheur Radix (fenêtre ouverte par un
 * état, ?creer=1, un article de menu) : Radix rend le focus au Trigger s'il existe, sinon ce crochet prend le relais.
 */
function useReturnFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: AutoFocusHandlers): Required<AutoFocusHandlers> {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (e) => {
      opener.current =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : null;
      onOpenAutoFocus?.(e);
    },
    onCloseAutoFocus: (e) => {
      onCloseAutoFocus?.(e);
      if (e.defaultPrevented) return;
      const el = opener.current;
      requestAnimationFrame(() => {
        if (
          (document.activeElement === document.body || !document.activeElement) &&
          el?.isConnected
        )
          el.focus({ preventScroll: true });
      });
    },
  };
}

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

export type DialogContentProps = Omit<ComponentProps<typeof RDialog.Content>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  /** Sans croix de fermeture (création de jeton). */
  hideClose?: boolean;
  /** false : ni clic dehors ni Échap ne ferment (étape qui ne doit pas se perdre). */
  dismissible?: boolean;
  /** Largeur maximale : sm 420, md 520, lg 640 px */
  size?: 'sm' | 'md' | 'lg';
};

export function DialogContent({
  title,
  description,
  hideClose,
  dismissible = true,
  size = 'md',
  className,
  children,
  style,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  const t = useTranslations('common');
  const block = (e: Event) => !dismissible && e.preventDefault();
  const focus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus });
  return (
    <RDialog.Portal>
      <RDialog.Overlay className={SCRIM} />
      <RDialog.Content
        className={cn(PANEL, className)}
        style={
          { '--w': { sm: '420px', md: '520px', lg: '640px' }[size], ...style } as CSSProperties
        }
        onPointerDownOutside={block}
        onEscapeKeyDown={block}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
        {...focus}
      >
        <div className={cn('grid gap-1.5', !hideClose && 'pr-8')}>
          <RDialog.Title className={TITLE}>
            {typeof title === 'string' ? nb(title) : title}
          </RDialog.Title>
          {description && (
            <RDialog.Description className="text-ui text-muted">
              {typeof description === 'string' ? nb(description) : description}
            </RDialog.Description>
          )}
        </div>
        {children}
        {!hideClose && (
          <RDialog.Close aria-label={t('close')} className={CLOSE}>
            <X aria-hidden="true" className="size-4" strokeWidth={1.8} />
          </RDialog.Close>
        )}
      </RDialog.Content>
    </RDialog.Portal>
  );
}

/** Rangée de boutons en bas d'une fenêtre. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-1 flex flex-wrap items-center justify-end gap-2', className)}
      {...props}
    />
  );
}

export type AlertDialogProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Le bouton qui ouvre la fenêtre (rendu tel quel, asChild). */
  trigger?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** destructive : bouton rouge (Supprimer, Révoquer) */
  tone?: 'destructive' | 'primary';
};

/** Confirmation : « Supprimer « … » ? » avec Annuler / Supprimer. Le focus va sur Annuler, puis revient à l'ouvreur. */
export function AlertDialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Annuler',
  onConfirm,
  tone = 'destructive',
}: AlertDialogProps) {
  const focus = useReturnFocus({});
  return (
    <RAlert.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger && <RAlert.Trigger asChild>{trigger}</RAlert.Trigger>}
      <RAlert.Portal>
        <RAlert.Overlay className={SCRIM} />
        <RAlert.Content className={PANEL} style={{ '--w': '420px' } as CSSProperties} {...focus}>
          <div className="grid gap-1.5">
            <RAlert.Title className={TITLE}>{nb(title)}</RAlert.Title>
            <RAlert.Description className="text-ui text-muted">
              {typeof description === 'string' ? nb(description) : description}
            </RAlert.Description>
          </div>
          <DialogFooter>
            <RAlert.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </RAlert.Cancel>
            <RAlert.Action asChild>
              <Button variant={tone} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </RAlert.Action>
          </DialogFooter>
        </RAlert.Content>
      </RAlert.Portal>
    </RAlert.Root>
  );
}

// ---------- Feuille du bas (mobile : menu, aperçu d'un résultat ou d'une source) ----------
export const Sheet = RDialog.Root;
export const SheetTrigger = RDialog.Trigger;
export const SheetClose = RDialog.Close;

export type SheetContentProps = Omit<ComponentProps<typeof RDialog.Content>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  /** Titre lu mais caché (la feuille montre déjà son propre en-tête). */
  titleHidden?: boolean;
  hideClose?: boolean;
};

/** Feuille de verre qui monte du bas (88 % de la hauteur au plus, poignée, filet Signal, marge de l'encoche). */
export function SheetContent({
  title,
  description,
  titleHidden,
  hideClose,
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: SheetContentProps) {
  const t = useTranslations('common');
  const focus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus });
  return (
    <RDialog.Portal>
      <RDialog.Overlay className={SCRIM} />
      <RDialog.Content
        className={cn(
          // presque opaque (pas glass-float) : sur mobile, la page et sa barre de saisie collée ne transparaissent pas sous le texte
          'layer-sheet signal-line fixed inset-x-0 bottom-0 z-50 grid max-h-[88dvh] content-start gap-4 overflow-y-auto rounded-t-[24px] border-x border-t border-line-strong bg-[color-mix(in_srgb,var(--menu)_94%,transparent)] px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] shadow-float outline-none backdrop-blur-[28px]',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
        {...focus}
      >
        <span aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-line-strong" />
        <div className={cn('grid gap-1 pr-10', titleHidden && 'sr-only')}>
          <RDialog.Title className={TITLE}>
            {typeof title === 'string' ? nb(title) : title}
          </RDialog.Title>
          {description && (
            <RDialog.Description className="text-ui text-muted">
              {typeof description === 'string' ? nb(description) : description}
            </RDialog.Description>
          )}
        </div>
        {children}
        {!hideClose && (
          <RDialog.Close aria-label={t('close')} className={cn(CLOSE, 'top-3 right-3')}>
            <X aria-hidden="true" className="size-4" strokeWidth={1.8} />
          </RDialog.Close>
        )}
      </RDialog.Content>
    </RDialog.Portal>
  );
}

// ---------- Contenu repliable (« ou coller une clé ▾ ») ----------
export const Collapsible = RCollapsible.Root;
/** Le déclencheur porte data-state=open|closed : faites tourner le chevron avec group-data-[state=open]:rotate-180. */
export const CollapsibleTrigger = RCollapsible.Trigger;

export function CollapsibleContent({
  className,
  ...props
}: ComponentProps<typeof RCollapsible.Content>) {
  return <RCollapsible.Content className={cn('layer-collapse', className)} {...props} />;
}

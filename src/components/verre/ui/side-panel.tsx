'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog as RDialog } from 'radix-ui';
import { type ComponentProps, type ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { Button } from './button';
import { SCRIM, useReturnFocus } from './dialog';
import { DoneMark } from './marks';

/** La confirmation sur place : elle remplace le pied du panneau. */
export type SidePanelConfirm = {
  /** La question, qui nomme la chose : « Supprimer cette connexion ? » */
  title: ReactNode;
  /** Une phrase : ce qui se passe vraiment ensuite. */
  text?: ReactNode;
  /** Le bouton qui le fait (contour rouge) : « Supprimer la connexion ». */
  yes: string;
  /** Le retour, qui prend le focus : « Garder ». Échap répond « non » aussi, sans fermer le panneau. */
  no: string;
  onYes: () => void;
  onNo: () => void;
  /** Pendant que ça se fait : le bouton le dit (`busyLabel`), rien d'autre ne répond. */
  busy?: boolean;
  busyLabel?: string;
};

export type SidePanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le nom de la chose. */
  title: ReactNode;
  /** Une ligne discrète sous le nom (le métier d'une personne). */
  sub?: ReactNode;
  /** L'image de la chose, à 44 px : `<ToolLogo size={44}>`, `<Avatar size={44}>`. */
  picture?: ReactNode;
  /** Le corps : `Facts`, `StatusRow`, un formulaire, `OriginalSheet`, `PanelDone`… Il défile ; la tête et le pied restent. */
  children: ReactNode;
  /** Les boutons du pied. Absent : un bouton « Terminé » qui ferme. `ml-auto` pousse un bouton à droite. */
  foot?: ReactNode;
  /** La ligne discrète sous les boutons du pied. */
  note?: ReactNode;
  /** La confirmation sur place : elle prend la place du pied tant qu'elle est là. */
  confirm?: SidePanelConfirm | null;
  /**
   * Une étape qui montre un secret une seule fois (un jeton, un lien d'invitation, des codes de secours) : ni Échap,
   * ni un clic dehors, ni la croix ne ferment. Seul son propre bouton, dans `foot`, le fait.
   */
  locked?: boolean;
  /** Le panneau travaille : le surligneur court le long du pied, le corps se fige (inert), aria-busy. */
  busy?: boolean;
  className?: string;
};

const FIRST_FIELD =
  '[data-autofocus], [data-panel-body] :is(input:not([type="hidden"]), textarea, [role="combobox"]):not(:disabled)';

/**
 * Le panneau latéral : tout ce qui concerne UNE chose, à un clic de son rectangle. 520 px, la hauteur de la fenêtre.
 * Une feuille modale : un clic dehors la ferme et ne fait rien d'autre (il n'ouvre pas ce qu'il y a dessous), Échap la
 * ferme, le focus revient à ce qui l'a ouverte. À l'ouverture, le focus va au premier champ (ou à `data-autofocus`).
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  sub,
  picture,
  children,
  foot,
  note,
  confirm,
  locked,
  busy,
  className,
}: SidePanelProps) {
  const t = useTranslations('common');
  const confirmId = useId();
  const noRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const asking = Boolean(confirm);
  // la confirmation arrive : le retour (« Garder ») prend le focus
  useEffect(() => {
    if (asking) noRef.current?.focus();
  }, [asking]);
  // le corps se fige (inert) pendant le travail : le focus qui s'y trouvait tomberait sur <body>, il va au panneau
  useEffect(() => {
    if (busy && !contentRef.current?.contains(document.activeElement))
      contentRef.current?.focus({ preventScroll: true });
  }, [busy]);
  const focus = useReturnFocus({
    onOpenAutoFocus: (e) => {
      // ouvert directement sur sa confirmation : le retour (« Garder ») prend le focus, pas la croix
      if (noRef.current) {
        e.preventDefault();
        noRef.current.focus();
        return;
      }
      const first = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
        FIRST_FIELD,
      );
      if (!first) return; // sinon Radix prend le premier contrôle
      e.preventDefault();
      first.focus();
    },
  });
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className={SCRIM} />
        <RDialog.Content
          ref={contentRef}
          aria-busy={busy || undefined}
          className={cn(
            'layer-side fixed top-[var(--inset)] right-[var(--inset)] bottom-[var(--inset)] z-50 flex w-[min(520px,calc(100vw-2*var(--inset)))] flex-col overflow-hidden rounded-card border border-float-line bg-menu text-lead text-fg shadow-float outline-none',
            className,
          )}
          onEscapeKeyDown={(e) => {
            if (confirm) {
              // Échap sur une confirmation répond « non » : le panneau reste
              e.preventDefault();
              if (!confirm.busy) confirm.onNo();
            } else if (locked) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (!locked) return;
            e.preventDefault();
            // Le clic refusé ne vole pas le focus (il tomberait sur <body>) : il revient où il était, sinon au panneau.
            const was = document.activeElement;
            setTimeout(() => {
              if (document.activeElement && document.activeElement !== document.body) return;
              (was instanceof HTMLElement && was.isConnected && was !== document.body
                ? was
                : contentRef.current
              )?.focus({ preventScroll: true });
            });
          }}
          {...(sub ? {} : { 'aria-describedby': undefined })}
          {...focus}
        >
          <header className="flex shrink-0 items-center gap-4 border-b border-line py-5 pr-4 pl-6">
            {picture}
            <div className="min-w-0 flex-1">
              <RDialog.Title className="text-head font-semibold tracking-[-0.015em] [overflow-wrap:anywhere]">
                {typeof title === 'string' ? nb(title) : title}
              </RDialog.Title>
              {sub && (
                <RDialog.Description className="mt-0.5 text-ui leading-[1.4] text-muted">
                  {typeof sub === 'string' ? nb(sub) : sub}
                </RDialog.Description>
              )}
            </div>
            {!locked && (
              <RDialog.Close
                aria-label={t('close')}
                className="grid size-8 shrink-0 place-items-center rounded-item text-fg-2 transition-colors duration-150 hover:bg-hover hover:text-fg active:bg-n-150 max-shell:size-11"
              >
                <X aria-hidden="true" className="size-[18px]" strokeWidth={1.6} />
              </RDialog.Close>
            )}
          </header>
          <div
            data-panel-body=""
            inert={busy || undefined}
            className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6"
          >
            {children}
          </div>
          <footer
            className={cn(
              'panel-foot relative flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-6 pt-4 pb-5',
              (busy || confirm?.busy) && 'is-working',
            )}
          >
            <span aria-hidden="true" className="work" />
            {confirm ? (
              // biome-ignore lint/a11y/useSemanticElements: un groupe nommé par sa question, pas un formulaire
              <div role="group" aria-labelledby={confirmId} className="basis-full">
                <b id={confirmId} className="block text-lead font-semibold">
                  {typeof confirm.title === 'string' ? nb(confirm.title) : confirm.title}
                </b>
                {confirm.text && (
                  <p className="mt-0.5 text-ui leading-[1.5] text-muted">
                    {typeof confirm.text === 'string' ? nb(confirm.text) : confirm.text}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="destructive"
                    loading={confirm.busy}
                    loadingLabel={confirm.busyLabel}
                    onClick={confirm.onYes}
                  >
                    {confirm.yes}
                  </Button>
                  <Button
                    ref={noRef}
                    variant="secondary"
                    disabled={confirm.busy}
                    onClick={confirm.onNo}
                  >
                    {confirm.no}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {foot ?? (
                  <RDialog.Close asChild>
                    <Button variant="secondary" className="ml-auto">
                      {t('done')}
                    </Button>
                  </RDialog.Close>
                )}
                {note && (
                  <p className="basis-full text-label leading-[1.5] text-muted">
                    {typeof note === 'string' ? nb(note) : note}
                  </p>
                )}
              </>
            )}
          </footer>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Ferme le panneau : enveloppez un bouton du pied (`<PanelClose asChild><Button>Terminé</Button></PanelClose>`). */
export const PanelClose = RDialog.Close;

/** Ce qu'est une chose : des lignes « libellé, valeur » séparées d'un trait fin. */
export function Facts({ className, ...props }: ComponentProps<'dl'>) {
  return <dl className={cn('facts', className)} {...props} />;
}

/** Une ligne de `Facts`. Un `<small>` dans la valeur est sa seconde ligne, discrète. */
export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** La ligne d'état en haut du corps : une pastille d'état (`Badge`) et, à droite, son action (`Button size="xs"`). */
export function StatusRow({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('statusrow', className)} {...props} />;
}

/** La phrase qu'une chose technique peut avoir, ou une promesse du produit (qui voit quoi) : une, courte. */
export function PanelNote({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('where', className)} {...props} />;
}

/** « Fait », à la place du corps : le titre sous un trait vert tracé une fois, puis une phrase au plus. */
export function PanelDone({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div role="status" className="panel-done">
      <h3>
        <DoneMark>{title}</DoneMark>
      </h3>
      {children && <p>{children}</p>}
    </div>
  );
}

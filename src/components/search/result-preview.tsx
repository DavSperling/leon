'use client';

import { CircleAlert, MousePointerClick, X } from 'lucide-react';
import { type Ref, useEffect, useRef } from 'react';
import { SourceChip } from '@/components/source-chip';
import { SourceLink } from '@/components/source-link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TermHighlightedText } from './highlighted-text';
import type { PreviewView, ResultView } from './view-model';

// L'aperçu d'un résultat : le passage dans son contexte (les tours voisins), le tour du passage mis en avant
// et ses mots repérés, le lien vers l'original. Il s'ouvre à côté des résultats (à droite quand la place le
// permet, sinon par-dessus) sans quitter la page. La discussion l'ouvre aussi depuis une citation.

// Ce que l'en-tête de l'aperçu montre avant que le passage soit chargé : le résultat cliqué, ou une citation
// (son titre et son lien seulement : `kindLabel` vide, l'outil s'affiche une fois l'aperçu chargé).
export type PreviewHeader = Pick<
  ResultView,
  'kind' | 'kindLabel' | 'natureLabel' | 'title' | 'url'
>;

export type PreviewState =
  | { status: 'vide' }
  | { status: 'charge'; result: PreviewHeader }
  | { status: 'pret'; result: PreviewHeader; preview: PreviewView }
  | { status: 'introuvable'; result: PreviewHeader }
  | { status: 'erreur'; result: PreviewHeader };

// Dès que le tour du passage est là, la lecture s'y place : au premier mot repéré, sinon en haut du tour.
function useScrollToHit(preview: PreviewView | null) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = body.current;
    const hit = container?.querySelector<HTMLElement>('[data-hit]');
    if (!preview || !container || !hit) return;
    const target = hit.querySelector<HTMLElement>('mark') ?? hit;
    const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop += offset - 72;
  }, [preview]);
  return body;
}

function Turns({ preview, terms }: { preview: PreviewView; terms: string[] }) {
  const body = useScrollToHit(preview);
  return (
    <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5">
      <ol className="space-y-3">
        {preview.turns.map((turn) => (
          <li
            key={turn.turnId}
            data-hit={turn.isHit ? '' : undefined}
            className={cn(
              'rounded-lg px-3 py-2.5',
              turn.isHit ? 'border-l-2 border-primary bg-primary-soft' : 'bg-quote',
            )}
          >
            <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] leading-[18px] text-muted-foreground">
              <span className="font-medium text-foreground-2">{turn.speaker}</span>
              <time dateTime={turn.ts.toISOString()} className="tabular-nums">
                {formatDateTime(turn.ts)}
              </time>
              {turn.isHit && <span className="font-medium text-primary">Passage trouvé</span>}
            </p>
            <p
              className={cn(
                'mt-1 text-[15px] leading-6 break-words whitespace-pre-wrap text-foreground-2',
                !turn.isHit && 'line-clamp-6',
              )}
            >
              <TermHighlightedText text={turn.text} terms={terms} />
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <div role="alert" className="m-5 flex items-start gap-2.5 rounded-lg bg-quote px-3.5 py-3">
      <CircleAlert
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-muted-foreground"
      />
      <p className="text-[15px] leading-6 text-foreground-2">{children}</p>
    </div>
  );
}

export function ResultPreview({
  ref,
  state,
  terms,
  onClose,
  label = 'Aperçu du résultat',
  emptyHint = 'Cliquez sur un résultat pour lire le passage dans son contexte.',
}: {
  ref: Ref<HTMLElement>;
  state: PreviewState;
  terms: string[];
  onClose: () => void;
  // Le nom de l'encadré, et ce qu'il dit tant que rien n'est ouvert (la discussion a les siens).
  label?: string;
  emptyHint?: string;
}) {
  const open = state.status !== 'vide';
  const preview = state.status === 'pret' ? state.preview : null;
  // Une fois chargé, l'aperçu dit lui-même d'où vient le passage.
  const result = state.status === 'vide' ? null : (preview ?? state.result);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      className={cn(
        'flex-col overflow-hidden rounded-xl border bg-card outline-none',
        // Place pour deux colonnes : l'aperçu reste en vue à droite, vide tant qu'on n'a rien ouvert.
        '@[920px]:sticky @[920px]:top-4 @[920px]:flex @[920px]:max-h-[calc(100dvh-21rem)] @[920px]:min-h-[22rem] @[920px]:self-start @[920px]:shadow-xs',
        // Sinon, une feuille posée sur la page.
        open
          ? 'fixed inset-x-4 bottom-4 z-40 flex max-h-[calc(100dvh-7rem)] shadow-md duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-4 @[920px]:inset-auto @[920px]:shadow-xs @[920px]:slide-in-from-right-2'
          : 'hidden',
      )}
    >
      {result ? (
        <>
          <div className="flex items-start gap-3 border-b px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              {result.kindLabel !== '' && (
                <SourceChip
                  kind={result.kind}
                  label={`${result.kindLabel} · ${result.natureLabel}`}
                />
              )}
              <h2 className="mt-1 text-[17px] leading-6 font-medium break-words">
                {result.title ?? 'Sans titre'}
              </h2>
              {result.url && (
                <SourceLink
                  url={result.url}
                  label={result.kindLabel}
                  className="mt-1 text-[13px] leading-[18px]"
                />
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Fermer l’aperçu"
              className="-mt-1 -mr-2 shrink-0 text-muted-foreground"
            >
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </div>
          {state.status === 'charge' && (
            <div role="status" className="space-y-3 px-5 py-4">
              <span className="sr-only">Chargement de l’aperçu…</span>
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          )}
          {preview && <Turns preview={preview} terms={terms} />}
          {state.status === 'introuvable' && (
            <Notice>Ce passage n’est plus disponible. Relancez la recherche.</Notice>
          )}
          {state.status === 'erreur' && (
            <Notice>L’aperçu n’a pas pu se charger. Cliquez de nouveau sur le résultat.</Notice>
          )}
        </>
      ) : (
        <div className="hidden flex-col items-center gap-2 px-8 py-16 text-center @[920px]:flex">
          <MousePointerClick
            size={22}
            strokeWidth={1.5}
            aria-hidden="true"
            className="text-muted-foreground"
          />
          <p className="text-[15px] leading-6 text-muted-foreground">{emptyHint}</p>
        </div>
      )}
    </aside>
  );
}

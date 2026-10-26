'use client';

import { CircleAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, type Ref, useLayoutEffect, useRef } from 'react';
import { highlightTerms } from '@/components/search/highlighted-text';
import type { PreviewView, ResultView } from '@/components/search/view-model';
import {
  IconButton,
  Notice,
  Sheet,
  SheetContent,
  Skeleton,
  SourceChip,
  SourceLink,
} from '@/components/verre';
import { cn, enter, exit, formatDateTime, nb } from '@/lib/verre';

/** Le passage ouvert : le résultat cliqué, son rang, le passage, et où en est son chargement (previewPassageAction). */
export type Opened = { result: ResultView; n: number; passageId: string } & (
  | { status: 'charge' | 'introuvable' | 'erreur' }
  | { status: 'pret'; preview: PreviewView }
);

/** En-tête (origine, titre, lien, fermeture) puis les tours : celui du passage marqué « Passage trouvé » et mis en vue. */
function PreviewBody({
  sel,
  terms,
  onClose,
}: {
  sel: Opened;
  terms: string[];
  onClose: () => void;
}) {
  const tr = useTranslations('searchResults');
  const locale = useLocale();
  // Une fois chargé, l'aperçu dit lui-même d'où vient le passage.
  const head = sel.status === 'pret' ? sel.preview : sel.result;
  const scroller = useRef<HTMLDivElement>(null);

  // Le tour du passage se place sous l'en-tête, avec un peu du tour précédent au-dessus.
  useLayoutEffect(() => {
    const root = scroller.current;
    const hit = root?.querySelector<HTMLElement>('[data-hit]');
    if (sel.status !== 'pret' || !root || !hit) return;
    root.scrollTop = Math.max(
      0,
      root.scrollTop + hit.getBoundingClientRect().top - root.getBoundingClientRect().top - 56,
    );
  }, [sel]);

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 pt-3.5 pb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <SourceChip
              kind={head.kind}
              label={head.kindLabel}
              boxed
              extra={[head.natureLabel]}
              className="min-w-0"
            />
            <span className="ml-auto shrink-0 font-mono text-[11px] font-medium tracking-normal text-muted">
              [{sel.n}]
            </span>
          </div>
          <h2
            className={cn(
              'mt-2 text-[17px] leading-snug font-semibold tracking-[-0.015em] break-words',
              !head.title && 'text-muted',
            )}
          >
            {head.title?.trim() || tr('untitled')}
          </h2>
          <SourceLink
            href={head.url}
            kind={head.kind}
            label={head.kindLabel}
            className="h-8 text-accent"
          />
        </div>
        <IconButton
          icon={X}
          label={tr('closePreview')}
          size="sm"
          tooltip={false}
          onClick={onClose}
          className="-mt-0.5 -mr-1.5 text-muted"
        />
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {sel.status === 'charge' && (
          <div role="status" className="grid gap-2.5">
            <span className="sr-only">{tr('loadingPreview')}</span>
            <Skeleton className="h-16 rounded-field" />
            <Skeleton className="h-28 rounded-field" />
            <Skeleton className="h-16 rounded-field" />
          </div>
        )}
        {sel.status === 'introuvable' && (
          <Notice tone="warning" icon={CircleAlert} live="alert">
            {nb(tr('passageUnavailable'))}
          </Notice>
        )}
        {sel.status === 'erreur' && (
          <Notice tone="error" icon={CircleAlert} live="alert">
            {nb(tr('previewFailed'))}
          </Notice>
        )}
        {sel.status === 'pret' && (
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {sel.preview.turns.map((t) => (
              <li
                key={t.turnId}
                data-hit={t.isHit || undefined}
                className={cn(
                  'rounded-field px-3 py-2.5',
                  t.isHit
                    ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--accent),inset_0_0_0_1px_var(--accent-line)]'
                    : 'bg-glass-3',
                )}
              >
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                  <span className="font-semibold text-fg-2">{t.speaker}</span>
                  {t.isHit && (
                    <span className="inline-flex h-[18px] items-center rounded-full px-[7px] font-mono text-[10.5px] font-medium tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
                      {tr('matchingPassage')}
                    </span>
                  )}
                  <time
                    dateTime={t.ts.toISOString()}
                    className="ml-auto font-mono text-[11px] tracking-normal text-muted"
                  >
                    {formatDateTime(t.ts, locale)}
                  </time>
                </p>
                <p
                  className={cn(
                    'mt-1 text-ui leading-[1.6] break-words whitespace-pre-wrap',
                    t.isHit ? 'text-fg' : 'line-clamp-6 text-fg-2',
                  )}
                >
                  {highlightTerms(t.text, terms).map((part, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé, dans l'ordre
                    <Fragment key={i}>{part.hit ? <mark>{part.text}</mark> : part.text}</Fragment>
                  ))}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

type PreviewProps = { sel: Opened | null; terms: string[]; onClose: () => void };

/** Écran large : panneau collant à droite des résultats. Tant qu'on n'a rien ouvert, une ligne atténuée, sans carte. */
export function PreviewPane({
  sel,
  terms,
  onClose,
  ref,
}: PreviewProps & { ref: Ref<HTMLElement> }) {
  const t = useTranslations('searchResults');
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={t('preview')}
      className={cn(
        'sticky top-4 hidden flex-col outline-none @[900px]:flex focus-visible:outline-2 focus-visible:outline-ring',
        sel
          ? 'max-h-[calc(100dvh-54px)] min-h-[22rem] overflow-hidden rounded-box border border-line bg-glass-2 shadow-hi'
          : 'rounded-field px-1 pt-2',
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={sel ? `${sel.result.sourceId}:${sel.passageId}` : 'vide'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: enter }}
          exit={{ opacity: 0, transition: exit }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {sel ? (
            <PreviewBody sel={sel} terms={terms} onClose={onClose} />
          ) : (
            <p className="max-w-[34ch] text-label text-muted">{t('clickResultToPreview')}</p>
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

/** Écran étroit : feuille de verre qui monte du bas (focus piégé, Échap, retour du focus au passage cliqué). */
export function PreviewSheet({ sel, terms, onClose }: PreviewProps) {
  const t = useTranslations('searchResults');
  // la feuille garde son contenu pendant son animation de sortie
  const last = useRef(sel);
  if (sel) last.current = sel;
  const shown = sel ?? last.current;
  return (
    <Sheet open={Boolean(sel)} onOpenChange={(o) => !o && onClose()}>
      {shown && (
        <SheetContent
          title={shown.result.title?.trim() || t('untitled')}
          titleHidden
          hideClose
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className="flex flex-col gap-0 overflow-hidden px-0 pb-[max(4px,env(safe-area-inset-bottom))] shell:mx-auto shell:max-w-[760px]"
        >
          <PreviewBody sel={shown} terms={terms} onClose={onClose} />
        </SheetContent>
      )}
    </Sheet>
  );
}

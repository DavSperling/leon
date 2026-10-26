'use client';

import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { resultAnchorId } from '@/components/search/answer-text';
import type { ResultPassageView, ResultView } from '@/components/search/view-model';
import { GlassCard, Highlighted, SourceChip, SourceLink } from '@/components/verre';
import { cn, formatDate, rise, stagger } from '@/lib/verre';

export type OpenPreview = (
  result: ResultView,
  n: number,
  passage: ResultPassageView,
  opener: HTMLElement | null,
  /** large écran : le curseur entre dans l'aperçu (oui par défaut) */
  focusPane?: boolean,
) => void;

/**
 * Un résultat : l'origine (outil · nature · lieu) et son rang [n], le titre (ouvre l'aperçu), jusqu'à trois passages
 * surlignés (chacun ouvre l'aperçu sur lui), le lien vers l'original. Éclairé quand un renvoi de la réponse le vise.
 */
export function ResultCard({
  r,
  n,
  appear,
  lit,
  selectedPassageId,
  onOpen,
  onHover,
}: {
  r: ResultView;
  /** rang sur la page, 1 pour le premier : le [n] de la réponse */
  n: number;
  /** false : déjà là au premier rendu, sans entrée */
  appear: false | 'initial';
  lit: boolean;
  /** le passage ouvert dans l'aperçu, s'il est de ce résultat */
  selectedPassageId: string | null;
  onOpen: OpenPreview;
  onHover: (n: number | null) => void;
}) {
  const t = useTranslations('searchResults');
  const selected = selectedPassageId !== null;
  const locale = useLocale();
  const first = r.passages[0];
  const title = r.title?.trim() || t('untitled');
  return (
    <motion.li
      id={resultAnchorId(r.sourceId)}
      variants={rise}
      transition={{ delay: stagger(n - 1, 0.04, 0.2) }}
      initial={appear}
      animate="animate"
      className="scroll-mt-24"
      onPointerEnter={() => onHover(n)}
      onPointerLeave={() => onHover(null)}
    >
      <GlassCard
        data-lit={lit || undefined}
        className={cn(
          'px-4 pt-3 pb-1 transition-[border-color,background-color,box-shadow] duration-300 max-sm:px-3.5',
          selected && 'border-accent-line bg-glass-2',
          'data-[lit]:border-accent data-[lit]:shadow-[inset_0_1px_0_var(--hi),0_0_0_3px_var(--accent-soft)]',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <SourceChip
            kind={r.kind}
            label={r.kindLabel}
            extra={[r.natureLabel, r.originLabel]}
            className="min-w-0"
          />
          <span
            className={cn(
              'ml-auto shrink-0 rounded-full px-1.5 font-mono text-[11px] font-medium tracking-normal text-muted transition-colors duration-200',
              (lit || selected) && 'bg-accent-soft text-accent',
            )}
          >
            [{n}]
          </span>
        </div>
        <h3 className="mt-1.5 text-title font-semibold tracking-[-0.018em]">
          {first ? (
            <button
              type="button"
              onClick={(e) => onOpen(r, n, first, e.currentTarget)}
              aria-current={selected || undefined}
              className={cn(
                'rounded-sm text-left decoration-accent-line underline-offset-[3px] transition-colors duration-200 hover:text-accent hover:underline',
                r.title ? 'text-fg' : 'text-muted',
              )}
            >
              {title}
            </button>
          ) : (
            <span className={r.title ? 'text-fg' : 'text-muted'}>{title}</span>
          )}
        </h3>
        {r.passages.length > 0 && (
          <ul className="mt-1.5 grid grid-cols-[minmax(0,1fr)] gap-1">
            {r.passages.map((p) => {
              const on = selectedPassageId === p.passageId;
              return (
                <li key={p.passageId}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={(e) => onOpen(r, n, p, e.currentTarget)}
                    className={cn(
                      // un filet à gauche, pas de boîte dans la carte ; le fond n'apparaît qu'au survol ou pour le passage ouvert
                      'block w-full rounded-r-field border-l border-line-strong py-1.5 pr-2 pl-3 text-left transition-[background-color,border-color] duration-200 hover:bg-hover',
                      on && 'border-accent bg-accent-soft hover:bg-accent-soft',
                    )}
                  >
                    <span className="flex items-center gap-2 text-[12px] text-muted">
                      {p.authorName && (
                        <>
                          {p.authorName}
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <time dateTime={p.ts.toISOString()} className="tabular-nums">
                        {formatDate(p.ts, locale)}
                      </time>
                    </span>
                    <span className="mt-0.5 block text-body leading-[1.58] break-words text-fg-2">
                      <Highlighted text={p.snippet} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <SourceLink href={r.url} kind={r.kind} label={r.kindLabel} className="relative z-[1] h-8" />
        {!r.url && <span className="block h-2" />}
      </GlassCard>
    </motion.li>
  );
}

import { ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import type { MouseEvent } from 'react';
import { GlassCard, Highlighted, SourceChip } from '@/components';
import type { SearchResult } from '@/data';
import { cn, formatDate, stagger } from '@/lib';
import { riseAt } from './motion';
import { anchorId } from './url';

export type OpenPreview = (r: SearchResult, turn: number, opener: HTMLElement | null) => void;

/** « Ouvrir dans GitHub » : l'original, dans un nouvel onglet. */
export function SourceLink({ r, className }: { r: SearchResult; className?: string }) {
  if (!r.url) return null;
  return (
    <a href={r.url} target="_blank" rel="noreferrer" className={cn('relative z-[1] inline-flex h-8 items-center gap-1.5 rounded-sm text-label font-medium text-muted transition-colors duration-200 hover:text-accent', className)}>
      <ExternalLink aria-hidden="true" strokeWidth={1.7} className="size-[13px]" />
      Ouvrir dans {r.kindLabel}
    </a>
  );
}

/**
 * Un résultat : l'origine (outil · nature · lieu) et son rang [n], le titre (ouvre l'aperçu), jusqu'à trois passages
 * surlignés (chacun ouvre l'aperçu à son tour), le lien vers l'original. Éclairé quand un renvoi de la réponse le vise.
 * Trois niveaux seulement : le titre, les passages, puis l'atténué (origine, auteur et date, lien).
 */
export function ResultCard({ r, i, appear, lit, selected, selectedTurn, onOpen, onHover }: {
  r: SearchResult;
  i: number;
  /** false : déjà là au premier rendu (retour arrière), sans entrée */
  appear: false | 'initial';
  lit: boolean;
  selected: boolean;
  selectedTurn: number | null;
  onOpen: OpenPreview;
  onHover: (n: number | null) => void;
}) {
  const open = (turn: number) => (e: MouseEvent<HTMLElement>) => onOpen(r, turn, e.currentTarget);
  return (
    <motion.li
      id={anchorId(r)}
      variants={riseAt}
      custom={stagger(i, 0.04, 0.2)}
      initial={appear}
      animate="animate"
      className="scroll-mt-24"
      onPointerEnter={() => onHover(r.n)}
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
          <SourceChip kind={r.kind} extra={[r.natureLabel, r.origin !== r.kindLabel ? r.origin : null]} className="min-w-0" />
          <span className={cn('ml-auto shrink-0 rounded-full px-1.5 font-mono text-[11px] font-medium tracking-normal text-muted transition-colors duration-200', (lit || selected) && 'bg-accent-soft text-accent')}>
            [{r.n}]
          </span>
        </div>
        <h3 className="mt-1.5 text-title font-semibold tracking-[-0.018em]">
          <button
            type="button"
            onClick={open(r.passages[0]?.turn ?? 0)}
            aria-current={selected || undefined}
            className={cn('rounded-sm text-left underline-offset-[3px] decoration-accent-line transition-colors duration-200 hover:text-accent hover:underline', r.title ? 'text-fg' : 'text-muted')}
          >
            {r.title ?? 'Sans titre'}
          </button>
        </h3>
        {r.passages.length > 0 && (
          <ul className="mt-1.5 grid grid-cols-[minmax(0,1fr)] gap-1">
            {r.passages.map((p) => {
              const on = selected && selectedTurn === p.turn;
              return (
                <li key={p.turn}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={open(p.turn)}
                    className={cn(
                      // un filet à gauche, pas de boîte dans la carte ; le fond n'apparaît qu'au survol ou pour le passage ouvert
                      'block w-full rounded-r-field border-l border-line-strong py-1.5 pr-2 pl-3 text-left transition-[background-color,border-color] duration-200 hover:bg-hover',
                      on && 'border-accent bg-accent-soft hover:bg-accent-soft',
                    )}
                  >
                    <span className="flex items-center gap-2 text-[12px] text-muted">
                      {p.author}
                      <span aria-hidden="true">·</span>
                      <time dateTime={p.date.toISOString()} className="tabular-nums">{formatDate(p.date)}</time>
                    </span>
                    <span className="mt-0.5 block text-body leading-[1.58] break-words text-fg-2"><Highlighted text={p.snippet} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <SourceLink r={r} />
        {!r.url && <span className="block h-2" />}
      </GlassCard>
    </motion.li>
  );
}

/** Trois cartes fantômes, immobiles, pendant que la recherche tourne (moins d'une demi-seconde) : le statut de la réponse est le seul indicateur. */
export function GhostResults() {
  return (
    <ul aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
      {[0, 1, 2].map((i) => (
        <li key={i} className="grid gap-2.5 rounded-card border border-line bg-panel p-4 shadow-hi">
          <i className="h-2.5 rounded-md bg-hover" style={{ width: `${30 - i * 4}%` }} />
          <i className="h-3.5 rounded-md bg-hover" style={{ width: `${68 - i * 9}%` }} />
          <i className="h-2.5 rounded-md bg-hover" style={{ width: `${96 - i * 4}%` }} />
          <i className="h-2.5 rounded-md bg-hover" style={{ width: `${72 - i * 6}%` }} />
        </li>
      ))}
    </ul>
  );
}

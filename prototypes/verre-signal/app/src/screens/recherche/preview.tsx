import { CircleAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type Ref, type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { Highlighted, IconButton, Notice, Sheet, SheetContent, Skeleton, SourceChip } from '@/components';
import type { SearchResult } from '@/data';
import { cn, enter, exit, formatDateTime, nb } from '@/lib';
import { SourceLink } from './results';

export type PreviewStatus = 'loading' | 'ready' | 'not-found' | 'error';
export type Selection = { r: SearchResult; turn: number };

// L'aperçu tient à droite des résultats quand l'écran a la place (largeur de la page, donc rail replié ou non) ;
// en dessous, c'est une feuille. Comme le vrai Leon (requête de conteneur à 920 px).
const WIDE_PX = 900;
export function useWide(ref: RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1180px)').matches);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWide(el.getBoundingClientRect().width >= WIDE_PX);
    const ro = new ResizeObserver(([e]) => setWide(e!.contentRect.width >= WIDE_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return wide;
}

/** En-tête (origine, titre, lien, fermeture) puis les tours : celui du passage marqué « Passage trouvé » et mis en vue. */
function PreviewBody({ sel, status, onClose }: { sel: Selection; status: PreviewStatus; onClose: () => void }) {
  const { r, turn } = sel;
  const scroller = useRef<HTMLDivElement>(null);

  // Le tour du passage se place sous l'en-tête, avec un peu du tour précédent au-dessus.
  useLayoutEffect(() => {
    const root = scroller.current;
    const hit = root?.querySelector<HTMLElement>('[data-hit]');
    if (status !== 'ready' || !root || !hit) return;
    root.scrollTop = Math.max(0, root.scrollTop + hit.getBoundingClientRect().top - root.getBoundingClientRect().top - 56);
  }, [status, r.id, turn]);

  return (
    <>
      <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 pt-3.5 pb-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <SourceChip kind={r.kind} boxed extra={[r.natureLabel]} className="min-w-0" />
            <span className="ml-auto shrink-0 font-mono text-[11px] font-medium tracking-normal text-muted">[{r.n}]</span>
          </div>
          <h2 className={cn('mt-2 text-[17px] leading-snug font-semibold tracking-[-0.015em] break-words', !r.title && 'text-muted')}>{r.title ?? 'Sans titre'}</h2>
          <SourceLink r={r} className="text-accent" />
        </div>
        <IconButton icon={X} label="Fermer l’aperçu" size="sm" tooltip={false} onClick={onClose} className="-mt-0.5 -mr-1.5 text-muted" />
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {status === 'loading' && (
          <div role="status" className="grid gap-2.5">
            <span className="sr-only">Chargement de l’aperçu…</span>
            <Skeleton className="h-16 rounded-field" />
            <Skeleton className="h-28 rounded-field" />
            <Skeleton className="h-16 rounded-field" />
          </div>
        )}
        {status === 'not-found' && <Notice tone="warning" icon={CircleAlert} live="alert">{nb('Ce passage n’est plus disponible. Relancez la recherche.')}</Notice>}
        {status === 'error' && <Notice tone="error" icon={CircleAlert} live="alert">{nb('L’aperçu n’a pas pu se charger. Cliquez de nouveau sur le résultat.')}</Notice>}
        {status === 'ready' && (
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">
            {r.preview.map((t, i) => {
              const hit = i === turn;
              return (
                <li
                  key={i}
                  data-hit={hit || undefined}
                  className={cn('rounded-field px-3 py-2.5', hit ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--accent),inset_0_0_0_1px_var(--accent-line)]' : 'bg-glass-3')}
                >
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                    <span className="font-semibold text-fg-2">{t.speaker}</span>
                    {hit && <span className="inline-flex h-[18px] items-center rounded-full px-[7px] font-mono text-[10.5px] font-medium tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">Passage trouvé</span>}
                    <time dateTime={t.at.toISOString()} className="ml-auto font-mono text-[11px] tracking-normal text-muted">{formatDateTime(t.at)}</time>
                  </p>
                  <p className={cn('mt-1 text-ui leading-[1.6] break-words whitespace-pre-wrap', hit ? 'text-fg' : 'line-clamp-6 text-fg-2')}>
                    <Highlighted text={t.text} />
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}

/** Écran large : panneau collant à droite des résultats. Tant qu'on n'a rien ouvert, une ligne atténuée, sans carte : la colonne reste réservée. */
export function PreviewPane({ sel, status, onClose, ref }: { sel: Selection | null; status: PreviewStatus; onClose: () => void; ref: Ref<HTMLElement> }) {
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label="Aperçu du résultat"
      className={cn(
        'sticky top-4 flex flex-col outline-none focus-visible:outline-2 focus-visible:outline-ring',
        sel ? 'max-h-[calc(100dvh-54px)] min-h-[22rem] overflow-hidden rounded-box border border-line bg-glass-2 shadow-hi' : 'rounded-field px-1 pt-2',
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={sel ? `${sel.r.id}:${sel.turn}` : 'vide'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: enter }}
          exit={{ opacity: 0, transition: exit }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {sel ? <PreviewBody sel={sel} status={status} onClose={onClose} /> : (
            <p className="max-w-[34ch] text-label text-muted">Cliquez sur un résultat pour lire le passage dans son contexte.</p>
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

/** Écran étroit : feuille de verre qui monte du bas (focus piégé, Échap, retour du focus au passage cliqué). */
export function PreviewSheet({ sel, status, onClose }: { sel: Selection | null; status: PreviewStatus; onClose: () => void }) {
  // la feuille garde son contenu pendant son animation de sortie
  const last = useRef(sel);
  if (sel) last.current = sel;
  const shown = sel ?? last.current;
  return (
    <Sheet open={Boolean(sel)} onOpenChange={(o) => !o && onClose()}>
      {shown && (
        <SheetContent
          title={shown.r.title ?? 'Sans titre'}
          titleHidden
          hideClose
          onOpenAutoFocus={(e) => (e.preventDefault(), (e.currentTarget as HTMLElement).focus())}
          className="flex flex-col gap-0 overflow-hidden px-0 pb-[max(4px,env(safe-area-inset-bottom))] shell:mx-auto shell:max-w-[760px]"
        >
          <PreviewBody sel={shown} status={status} onClose={onClose} />
        </SheetContent>
      )}
    </Sheet>
  );
}

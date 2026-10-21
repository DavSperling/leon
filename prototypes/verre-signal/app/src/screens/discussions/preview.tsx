import { CircleAlert, ExternalLink, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type Ref, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconButton, Notice, Sheet, SheetContent, Skeleton, SourceChip } from '@/components';
import { cn, duration, ease, formatDateTime, unfilter } from '@/lib';
import type { Preview } from './model';

// Aperçu de la source citée : à droite, collé en haut, quand le fil a la place (≥ 920 px) ; sinon une feuille du bas.
// Rien n'est réservé tant qu'aucune source n'est ouverte : les puces et les titres de sources sont déjà des boutons.
// Le tour que Leon a lu est mis en avant (« Passage trouvé ») et amené en vue. Échap ferme.

export type PreviewState =
  | { status: 'vide' }
  | { status: 'charge' | 'pret' | 'introuvable' | 'erreur'; key: string; src: Preview };

export const PANE_LABEL = 'Aperçu de la source citée';

/** Largeur du fil : deux colonnes à partir de 920 px (comme la recherche). */
export function useWide(ref: RefObject<HTMLElement | null>, min = 920) {
  // première estimation sur la largeur du panneau (sans marges) : pas de feuille montée pour rien au chargement
  const [wide, setWide] = useState(() => Math.min(document.getElementById('contenu')?.clientWidth ?? 0, 1304) - 64 >= min);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setWide(el.offsetWidth >= min);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, min]);
  return wide;
}

/** État de l'aperçu : ouverture immédiate, fermeture qui rend le focus au déclencheur. */
export function usePreview(initial: PreviewState) {
  const [state, setState] = useState<PreviewState>(initial);
  const opener = useRef<HTMLElement | null>(null);
  const open = (key: string, src: Preview, trigger: HTMLElement) => {
    opener.current = trigger; // le dernier déclencheur : Échap y ramène
    setState({ status: src.turns ? 'pret' : 'introuvable', key, src });
  };
  const close = () => {
    setState({ status: 'vide' });
    opener.current?.focus({ preventScroll: true });
    opener.current = null;
  };
  return { state, open, close };
}

/** Les tours de la source ; le passage trouvé est amené en vue dans le conteneur qui défile. */
function Turns({ turns, scroller }: { turns: NonNullable<Preview['turns']>; scroller: () => HTMLElement | null }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const box = scroller();
    const hit = list.current?.querySelector<HTMLElement>('[data-hit]');
    if (!box || !hit) return;
    box.scrollTop += hit.getBoundingClientRect().top - box.getBoundingClientRect().top - 72;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- une fois par source (Turns est remonté à chaque source)
  return (
    <ol ref={list} className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {turns.map((t, i) => (
        <li
          key={i}
          data-hit={t.hit || undefined}
          className={cn(
            'rounded-field px-3 py-2.5 text-ui leading-[1.55]',
            t.hit ? 'bg-accent-soft text-fg shadow-[inset_2px_0_0_var(--accent),inset_0_0_0_1px_var(--accent-line)]' : 'bg-glass-3 text-fg-2',
          )}
        >
          <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label font-semibold text-fg-2">
            {t.speaker}
            {t.hit && (
              <span className="inline-flex h-[18px] items-center rounded-full px-[7px] font-mono text-[10.5px] font-medium tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
                Passage trouvé
              </span>
            )}
            <time dateTime={t.at.toISOString()} className="ml-auto font-mono text-[11px] font-normal tracking-normal text-muted">{formatDateTime(t.at)}</time>
          </p>
          <p className={cn('break-words whitespace-pre-wrap', !t.hit && 'line-clamp-6')}>{t.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** En-tête + contenu de l'aperçu, communs au panneau et à la feuille. */
function Body({ state, onClose, scroller }: { state: Exclude<PreviewState, { status: 'vide' }>; onClose?: () => void; scroller: () => HTMLElement | null }) {
  const { src } = state;
  return (
    <>
      <div className={cn('flex items-start gap-3 border-b border-line', onClose ? 'px-4 pt-4 pb-3' : 'pb-3')}>
        <div className="min-w-0 flex-1">
          {src.natureLabel && <SourceChip kind={src.kind} boxed extra={[src.natureLabel]} />}
          <h2 className="mt-2 text-title font-semibold tracking-[-0.015em] break-words text-fg">{src.title}</h2>
          {src.url && (
            <a href={src.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-sm text-label font-medium text-accent underline-offset-[3px] decoration-accent-line hover:underline">
              <ExternalLink aria-hidden="true" className="size-[13px]" strokeWidth={1.8} />
              Ouvrir dans {src.kindLabel}
            </a>
          )}
        </div>
        {onClose && <IconButton icon={X} label="Fermer l’aperçu" size="sm" onClick={onClose} className="-mt-1 -mr-1" tooltip={false} />}
      </div>
      <div className={cn(onClose ? 'px-3 py-3' : 'pt-1')}>
        {state.status === 'charge' && (
          <div role="status" className="grid gap-2">
            <span className="sr-only">Chargement de l’aperçu…</span>
            <Skeleton className="h-16 rounded-field" />
            <Skeleton className="h-28 rounded-field" />
            <Skeleton className="h-16 rounded-field" />
          </div>
        )}
        {state.status === 'pret' && src.turns && <Turns turns={src.turns} scroller={scroller} />}
        {state.status === 'introuvable' && <Notice tone="warning" icon={CircleAlert} live="alert">Ce passage n’est plus disponible. Relancez la recherche.</Notice>}
        {state.status === 'erreur' && <Notice tone="error" icon={CircleAlert} live="alert">L’aperçu n’a pas pu se charger. Cliquez de nouveau sur le résultat.</Notice>}
      </div>
    </>
  );
}

/** Panneau de droite, collé en haut du fil, monté à l'ouverture d'une source. `enter` : faux pour celui ouvert dès l'arrivée (?apercu=). */
export function PreviewPane({ state, enter, onClose, ref }: { state: Exclude<PreviewState, { status: 'vide' }>; enter: boolean; onClose: () => void; ref: Ref<HTMLElement> }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={PANE_LABEL}
      className="sticky top-4 flex max-h-[calc(100dvh-56px)] min-h-[22rem] flex-col overflow-hidden rounded-box border border-line bg-glass-2 shadow-hi"
    >
      <AnimatePresence mode="wait" initial={enter}>
        <motion.div
          key={state.key}
          initial={{ opacity: 0, x: 8, filter: 'blur(6px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)', transitionEnd: unfilter, transition: { duration: duration.enter, ease: ease.out } }}
          exit={{ opacity: 0, transition: { duration: duration.exit, ease: ease.in } }}
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <Body state={state} onClose={onClose} scroller={() => scrollRef.current} />
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

/** Feuille du bas (fil étroit) : même contenu et même croix « Fermer l’aperçu » ; le focus va sur la feuille. */
export function PreviewSheet({ state, onClose }: { state: PreviewState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = state.status !== 'vide' ? state : null;
  const last = useRef(shown);
  if (shown) last.current = shown; // la feuille garde son contenu pendant sa sortie
  const body = shown ?? last.current;
  return (
    <Sheet open={Boolean(shown)} onOpenChange={(o) => !o && onClose()}>
      {body && (
        <SheetContent
          ref={ref}
          title={body.src.title}
          description={PANE_LABEL}
          titleHidden
          hideClose
          onOpenAutoFocus={(e) => (e.preventDefault(), ref.current?.focus())}
          className="gap-0 px-0 pb-[max(12px,env(safe-area-inset-bottom))]"
        >
          <Body state={body} onClose={onClose} scroller={() => ref.current} />
        </SheetContent>
      )}
    </Sheet>
  );
}

'use client';

import { CircleAlert, ExternalLink, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { type Ref, useEffect, useRef, useState } from 'react';
import { type PreviewResult, previewPassageAction } from '@/app/(app)/actions';
import type { PreviewView } from '@/components/search/view-model';
import { IconButton, Notice, Sheet, SheetContent, Skeleton, SourceChip } from '@/components/verre';
import type { DiscussionCitation } from '@/lib/discussion-events';
import { cn, duration, ease, formatDateTime, unfilter } from '@/lib/verre';

// Aperçu du passage cité : à droite, collé en haut, quand le fil a la place (≥ 920 px) ; sinon une feuille du bas.
// Rien n'est réservé tant qu'aucune source n'est ouverte. Le tour cité est mis en avant (« Passage trouvé ») et
// amené en vue. Échap ferme.

type Header = { title: string | null; url: string | null };

export type PreviewState =
  | { status: 'vide' }
  | { status: 'charge' | 'introuvable' | 'erreur'; key: string; header: Header }
  | { status: 'pret'; key: string; header: Header; preview: PreviewView };

type Shown = Exclude<PreviewState, { status: 'vide' }>;

/** État de l'aperçu : le passage lu sous les droits de l'utilisateur ; la fermeture rend le focus au déclencheur. */
export function useCitationPreview() {
  const [state, setState] = useState<PreviewState>({ status: 'vide' });
  const latest = useRef(0);
  const opener = useRef<HTMLElement | null>(null);

  const close = () => {
    latest.current += 1;
    setState({ status: 'vide' });
    opener.current?.focus({ preventScroll: true });
    opener.current = null;
  };

  const open = (key: string, citation: DiscussionCitation, trigger: HTMLElement) => {
    const request = ++latest.current;
    opener.current = trigger; // le dernier déclencheur : Échap y ramène
    const header = { title: citation.title, url: citation.url };
    setState({ status: 'charge', key, header });
    previewPassageAction(citation.passageId)
      .then((answer: PreviewResult) => {
        if (request !== latest.current) return;
        setState(
          answer.ok
            ? { status: 'pret', key, header, preview: answer.preview }
            : { status: answer.reason, key, header },
        );
      })
      .catch(() => {
        if (request === latest.current) setState({ status: 'erreur', key, header });
      });
  };

  return { state, open, close };
}

/** Les tours de la source ; le passage cité est amené en vue dans le conteneur qui défile. */
function Turns({
  turns,
  scroller,
}: {
  turns: PreviewView['turns'];
  scroller: () => HTMLElement | null;
}) {
  const tr = useTranslations('discussionView');
  const locale = useLocale();
  const list = useRef<HTMLOListElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: une fois par source (Turns est remonté à chaque source)
  useEffect(() => {
    const box = scroller();
    const hit = list.current?.querySelector<HTMLElement>('[data-hit]');
    if (!box || !hit) return;
    box.scrollTop += hit.getBoundingClientRect().top - box.getBoundingClientRect().top - 72;
  }, []);
  return (
    <ol ref={list} className="grid grid-cols-[minmax(0,1fr)] gap-2">
      {turns.map((t) => (
        <li
          key={t.turnId}
          data-hit={t.isHit || undefined}
          className={cn(
            'rounded-field px-3 py-2.5 text-ui leading-[1.55]',
            t.isHit
              ? 'bg-accent-soft text-fg shadow-[inset_2px_0_0_var(--accent),inset_0_0_0_1px_var(--accent-line)]'
              : 'bg-glass-3 text-fg-2',
          )}
        >
          <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label font-semibold text-fg-2">
            {t.speaker}
            {t.isHit && (
              <span className="inline-flex h-[18px] items-center rounded-full px-[7px] font-mono text-[10.5px] font-medium tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
                {tr('matchingPassage')}
              </span>
            )}
            <time
              dateTime={new Date(t.ts).toISOString()}
              className="ml-auto font-mono text-[11px] font-normal tracking-normal text-muted"
            >
              {formatDateTime(new Date(t.ts), locale)}
            </time>
          </p>
          <p className={cn('break-words whitespace-pre-wrap', !t.isHit && 'line-clamp-6')}>
            {t.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** En-tête + contenu de l'aperçu, communs au panneau et à la feuille. */
function Body({
  state,
  onClose,
  scroller,
}: {
  state: Shown;
  onClose: () => void;
  scroller: () => HTMLElement | null;
}) {
  const t = useTranslations('discussionView');
  const preview = state.status === 'pret' ? state.preview : null;
  const title = preview?.title ?? state.header.title;
  const url = preview?.url ?? state.header.url;
  return (
    <>
      <div className="flex items-start gap-3 border-b border-line px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          {preview && (
            <SourceChip
              kind={preview.kind}
              label={preview.kindLabel || undefined}
              boxed
              extra={[preview.natureLabel, preview.originLabel]}
            />
          )}
          <h2
            className={cn(
              'mt-2 text-title font-semibold tracking-[-0.015em] break-words',
              title?.trim() ? 'text-fg' : 'text-muted',
            )}
          >
            {title?.trim() || t('untitled')}
          </h2>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-sm text-label font-medium text-accent underline-offset-[3px] decoration-accent-line hover:underline"
            >
              <ExternalLink aria-hidden="true" className="size-[13px]" strokeWidth={1.8} />
              {preview?.kindLabel
                ? t('openIn', { tool: preview.kindLabel })
                : t('openOriginalLabel')}
            </a>
          )}
        </div>
        <IconButton
          icon={X}
          label={t('closePreview')}
          size="sm"
          onClick={onClose}
          className="-mt-1 -mr-1"
          tooltip={false}
        />
      </div>
      <div className="px-3 py-3">
        {state.status === 'charge' && (
          <div role="status" className="grid gap-2">
            <span className="sr-only">{t('loadingPreview')}</span>
            <Skeleton className="h-16 rounded-field" />
            <Skeleton className="h-28 rounded-field" />
            <Skeleton className="h-16 rounded-field" />
          </div>
        )}
        {preview && <Turns turns={preview.turns} scroller={scroller} />}
        {state.status === 'introuvable' && (
          <Notice tone="warning" icon={CircleAlert} live="alert">
            {t('passageUnavailable')}
          </Notice>
        )}
        {state.status === 'erreur' && (
          <Notice tone="error" icon={CircleAlert} live="alert">
            {t('previewFailed')}
          </Notice>
        )}
      </div>
    </>
  );
}

/** Panneau de droite, collé en haut du fil, monté à l'ouverture d'une source. */
export function PreviewPane({
  state,
  onClose,
  ref,
}: {
  state: Shown;
  onClose: () => void;
  ref: Ref<HTMLElement>;
}) {
  const t = useTranslations('discussionView');
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={t('paneLabel')}
      className="sticky top-4 flex max-h-[calc(100dvh-56px)] min-h-[22rem] flex-col overflow-hidden rounded-box border border-line bg-glass-2 shadow-hi outline-none"
    >
      <AnimatePresence mode="wait">
        <motion.div
          // une autre source : le contenu change ; le même passage qui finit de charger reste en place
          key={state.key}
          initial={{ opacity: 0, x: 8, filter: 'blur(6px)' }}
          animate={{
            opacity: 1,
            x: 0,
            filter: 'blur(0px)',
            transitionEnd: unfilter,
            transition: { duration: duration.enter, ease: ease.out },
          }}
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

/** Feuille du bas (fil étroit) : même contenu et même croix ; le focus va sur la feuille. */
export function PreviewSheet({ state, onClose }: { state: PreviewState; onClose: () => void }) {
  const t = useTranslations('discussionView');
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
          title={body.header.title?.trim() || t('untitled')}
          description={t('paneLabel')}
          titleHidden
          hideClose
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            ref.current?.focus();
          }}
          className="gap-0 px-0 pb-[max(12px,env(safe-area-inset-bottom))]"
        >
          <Body state={body} onClose={onClose} scroller={() => ref.current} />
        </SheetContent>
      )}
    </Sheet>
  );
}

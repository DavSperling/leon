'use client';

import { MessagesSquare, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { continueInDiscussionAction } from '@/app/(app)/discussions/actions';
import { resultAnchorId } from '@/components/search/answer-text';
import type { ResultView } from '@/components/search/view-model';
import {
  Button,
  CitationChip,
  CitedText,
  GlassCard,
  SkeletonText,
  useThinking,
} from '@/components/verre';
import { ANSWER_NOT_ENOUGH, answerUrl, createAnswerEventReader } from '@/lib/answer-events';
import { cn, nb } from '@/lib/verre';

// La réponse de Leon en tête des résultats. Les résultats sont déjà affichés : la carte lit ensuite le flux de la route
// de la réponse, rend les renvois [n] en puces reliées aux résultats, se masque si aucun modèle n'est branché (204) ou si
// l'utilisateur a déjà trois réponses en cours (429), et dit « Réponse indisponible » si le modèle ou la recherche échoue.
// Une fois la réponse finie, « Continuer en discussion » ouvre une discussion qui part de la requête et de ces résultats.

type AnswerState =
  | { status: 'charge' }
  | { status: 'flux'; text: string }
  | { status: 'fini'; text: string }
  | { status: 'indisponible' }
  | { status: 'masque' };

const TEXT = 'text-lead leading-[1.72] break-words';

// `url` porte la requête et les résultats affichés : [n] de la réponse renvoie au n-ième de ces résultats.
function useAnswer(url: string): AnswerState {
  const [state, setState] = useState<AnswerState>({ status: 'charge' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'charge' });

    async function read() {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'text/event-stream' },
        cache: 'no-store',
      });
      // 429 : déjà trois réponses en cours pour l'utilisateur (une autre page de recherche) ; rien à dire ici.
      if (response.status === 204 || response.status === 429) return setState({ status: 'masque' });
      if (!response.ok || !response.body) return setState({ status: 'indisponible' });
      const chunks = response.body.pipeThrough(new TextDecoderStream()).getReader();
      const events = createAnswerEventReader();
      let text = '';
      for (;;) {
        const { done, value } = await chunks.read();
        if (done) break;
        for (const event of events.push(value)) {
          if (event.type === 'texte') {
            text += event.delta;
            setState({ status: 'flux', text });
          } else if (event.type === 'fin') {
            return setState({ status: 'fini', text });
          } else {
            return setState({ status: 'indisponible' });
          }
        }
      }
      // Le flux s'est fermé sans dire « fin » : la réponse est incomplète.
      setState({ status: 'indisponible' });
    }

    read().catch(() => {
      // Une nouvelle requête (ou le départ de la page) a interrompu celle-ci : rien à afficher.
      if (!controller.signal.aborted) setState({ status: 'indisponible' });
    });
    return () => controller.abort();
  }, [url]);

  return state;
}

export type CiteHandlers = {
  results: ResultView[];
  /** renvois à éclairer : survolé, résultat survolé, résultat ouvert */
  lit: ReadonlyArray<number | null>;
  onLit: (n: number | null) => void;
  /** keyboard : activé au clavier (le curseur entre alors dans l'aperçu) */
  onCite: (n: number, el: HTMLElement, keyboard: boolean) => void;
};

/**
 * « Réponse de Leon » au-dessus des résultats : squelette et statut pendant la lecture, puis le flux avec ses renvois
 * vivants, enfin la note et « Continuer en discussion ».
 */
export function AnswerCard({ q, results, lit, onLit, onCite }: CiteHandlers & { q: string }) {
  const t = useTranslations('answer');
  const resultIds = results.map((r) => r.sourceId);
  const state = useAnswer(answerUrl(q, resultIds));
  const busy = state.status === 'charge' || state.status === 'flux';
  const { setThinking } = useThinking();
  useEffect(() => setThinking(busy), [busy, setThinking]);
  if (state.status === 'masque') return null;
  // La phrase « les résultats ne suffisent pas » est un marqueur que le prompt exige mot pour mot : affichée traduite,
  // et cachée tant que le flux peut encore être en train de l'écrire.
  const streamed = state.status === 'flux' || state.status === 'fini' ? state.text.trim() : '';
  const notEnough = state.status === 'fini' && streamed === ANSWER_NOT_ENOUGH;
  const maybeNotEnough = state.status === 'flux' && ANSWER_NOT_ENOUGH.startsWith(streamed);

  return (
    <section aria-labelledby="reponse-titre">
      <GlassCard
        variant="raised"
        signal
        className="px-[22px] pt-[18px] pb-4 max-sm:px-4 max-sm:pt-4"
      >
        <div className="relative z-[1] flex min-h-5 items-center gap-2">
          <Sparkles aria-hidden="true" strokeWidth={1.7} className="size-4 shrink-0 text-accent" />
          <h2 id="reponse-titre" className="text-[13px] font-semibold text-accent">
            {t('title')}
          </h2>
          <p
            role="status"
            className="ml-auto flex min-w-0 items-center gap-2 font-mono text-meta tracking-normal text-muted"
          >
            {state.status === 'charge' && (
              <>
                <span className="spin" aria-hidden="true" />
                <span className="truncate">{t('reading')}</span>
              </>
            )}
          </p>
        </div>

        {/* aria-busy : un lecteur d'écran attend la fin du flux pour lire la réponse en entier */}
        <div aria-live="polite" aria-busy={busy} className="relative z-[1] mt-2.5 max-w-[72ch]">
          {(state.status === 'charge' || maybeNotEnough) && <SkeletonText className="pt-2 pb-1" />}
          {state.status === 'indisponible' && (
            <p className={cn(TEXT, 'text-muted')}>{nb(t('unavailable'))}</p>
          )}
          {notEnough && <p className={cn(TEXT, 'text-muted')}>{nb(t('notEnough'))}</p>}
          {((state.status === 'flux' && !maybeNotEnough) ||
            (state.status === 'fini' && !notEnough)) && (
            <p className={cn(TEXT, 'text-fg')}>
              <CitedText
                text={state.text}
                keep={(n) => n >= 1 && n <= results.length}
                renderCite={(n) => {
                  const r = results[n - 1] as ResultView;
                  return (
                    <CitationChip
                      n={n}
                      animate={state.status === 'flux'}
                      href={`#${resultAnchorId(r.sourceId)}`}
                      label={nb(
                        t('result', { number: n, title: r.title?.trim() || t('untitled') }),
                      )}
                      active={lit.includes(n)}
                      onMouseEnter={() => onLit(n)}
                      onMouseLeave={() => onLit(null)}
                      onFocus={() => onLit(n)}
                      onBlur={() => onLit(null)}
                      onClick={(e) => {
                        e.preventDefault();
                        onCite(n, e.currentTarget, e.detail === 0);
                      }}
                    />
                  );
                }}
              />
              {state.status === 'flux' && <span className="caret-block" aria-hidden="true" />}
            </p>
          )}
        </div>

        {state.status === 'fini' && (
          <div className="relative z-[1] mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-line pt-3">
            {!notEnough && (
              <p className="min-w-0 flex-1 basis-[280px] text-label text-muted">
                {nb(t('sourceNote'))}
              </p>
            )}
            <ContinueInDiscussion q={q} sourceIds={resultIds} />
          </div>
        )}
      </GlassCard>
    </section>
  );
}

/** Une discussion qui part de la requête et des résultats affichés, où Leon répond tout de suite. */
function ContinueInDiscussion({ q, sourceIds }: { q: string; sourceIds: string[] }) {
  const t = useTranslations('answer');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const start = () => {
    setError(null);
    startTransition(async () => {
      // La discussion s'ouvre (redirection) ; une erreur revient en message fixe.
      const result = await continueInDiscussionAction(q, sourceIds);
      if (result?.error) setError(result.error);
    });
  };
  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
      {error && (
        <p role="alert" className="text-label text-destructive">
          {nb(error)}
        </p>
      )}
      <Button size="sm" icon={MessagesSquare} loading={pending} onClick={start}>
        {t('continue')}
      </Button>
    </div>
  );
}

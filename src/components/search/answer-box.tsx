'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ContinueInDiscussion } from '@/components/discussion/continue-in-discussion';
import { Skeleton } from '@/components/ui/skeleton';
import { ANSWER_NOT_ENOUGH, answerUrl, createAnswerEventReader } from '@/lib/answer-events';
import { cn } from '@/lib/utils';
import { answerSegments, resultAnchorId } from './answer-text';

// La réponse de l'agent en tête des résultats (T10). Les résultats sont déjà affichés : l'encadré lit ensuite le
// flux de la route de la réponse, rend les renvois [n] en liens vers les résultats, se masque si aucun modèle
// n'est branché (204) ou si l'utilisateur a déjà trois réponses en cours (429), et dit « Réponse indisponible » si le modèle ou la recherche échoue. Une fois la réponse
// finie, « Continuer en discussion » (T11) ouvre une discussion qui part de la requête et de ces résultats.

export type AnswerResult = { sourceId: string; title: string | null };

type AnswerState =
  | { status: 'charge' }
  | { status: 'flux'; text: string }
  | { status: 'fini'; text: string }
  | { status: 'indisponible' }
  | { status: 'masque' };

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

function AnswerText({ text, results }: { text: string; results: AnswerResult[] }) {
  return answerSegments(text, results.length).map((segment, index) => {
    if ('text' in segment) return segment.text;
    const result = results[segment.ref - 1] as AnswerResult;
    const title = result.title?.trim() || 'Sans titre';
    return (
      <a
        // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte découpé une fois, jamais réordonnés
        key={index}
        href={`#${resultAnchorId(result.sourceId)}`}
        title={title}
        aria-label={`Résultat ${segment.ref} : ${title}`}
        className="mx-px inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-primary-soft px-1 align-[1px] text-[12px] leading-none font-medium text-primary tabular-nums no-underline transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        {segment.ref}
      </a>
    );
  });
}

export function AnswerBox({ query, results }: { query: string; results: AnswerResult[] }) {
  const resultIds = results.map((result) => result.sourceId);
  const state = useAnswer(answerUrl(query, resultIds));
  if (state.status === 'masque') return null;
  const busy = state.status === 'charge' || state.status === 'flux';
  const notEnough = state.status === 'fini' && state.text.trim() === ANSWER_NOT_ENOUGH;

  return (
    // Aligné sur la colonne des résultats quand l'aperçu a sa place à droite (voir result-list.tsx).
    <section
      aria-labelledby="reponse-en-tete"
      className="rounded-xl border bg-card px-5 py-4 shadow-xs @[920px]:mr-[440px]"
    >
      <h2
        id="reponse-en-tete"
        className="flex items-center gap-1.5 text-[13px] leading-[18px] font-medium text-primary"
      >
        <Sparkles size={15} strokeWidth={1.5} aria-hidden="true" />
        Réponse de Leon
      </h2>
      {/* aria-busy : un lecteur d'écran attend la fin du flux pour lire la réponse en entier. */}
      <div aria-live="polite" aria-busy={busy} className="mt-2">
        {state.status === 'charge' && (
          <div className="space-y-2 py-1">
            <span className="sr-only">Leon prépare une réponse…</span>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[92%]" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        )}
        {(state.status === 'flux' || state.status === 'fini') && (
          <p
            className={cn(
              'text-[15px] leading-6 break-words text-foreground-2',
              notEnough && 'text-muted-foreground',
            )}
          >
            <AnswerText text={state.text} results={results} />
            {state.status === 'flux' && (
              <span
                aria-hidden="true"
                className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-[2px] bg-primary/60 align-[-2px]"
              />
            )}
          </p>
        )}
        {state.status === 'indisponible' && (
          <p className="text-[15px] leading-6 text-muted-foreground">
            Réponse indisponible pour le moment. Les résultats ci-dessous restent complets.
          </p>
        )}
      </div>
      {state.status === 'fini' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {!notEnough && (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              Rédigée par l’IA à partir des résultats ci-dessous : vérifiez les sources citées.
            </p>
          )}
          <ContinueInDiscussion query={query} sourceIds={resultIds} />
        </div>
      )}
    </section>
  );
}

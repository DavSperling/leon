'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { continueInDiscussionAction } from '@/app/(app)/discussions/actions';
import { resultAnchorId } from '@/components/search/answer-text';
import type { ResultView } from '@/components/search/view-model';
import { Button, CitationChip, CitedText, GlassCard, Reading } from '@/components/verre';
import { ANSWER_NOT_ENOUGH, answerUrl, createAnswerEventReader } from '@/lib/answer-events';
import { stripHighlightMarks } from '@/lib/highlight';
import { markCited } from '@/lib/source-marks';
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

/**
 * « Réponse de Leon » au-dessus des résultats, sur sa feuille : « Leon lit… » pendant la lecture, puis le flux avec ses
 * numéros ; une fois finie, seuls les mots qui viennent d'un résultat passent sous le surligneur, et « Continuer en
 * discussion » (la pastille d'encre de l'écran). Un numéro ouvre le résultat dans le panneau.
 */
export function AnswerCard({
  q,
  results,
  onCite,
}: {
  q: string;
  results: ResultView[];
  onCite: (n: number) => void;
}) {
  const t = useTranslations('answer');
  const resultIds = results.map((r) => r.sourceId);
  const state = useAnswer(answerUrl(q, resultIds));
  const busy = state.status === 'charge' || state.status === 'flux';
  if (state.status === 'masque') return null;
  // La phrase « les résultats ne suffisent pas » est un marqueur que le prompt exige mot pour mot : affichée traduite,
  // et cachée tant que le flux peut encore être en train de l'écrire.
  const streamed = state.status === 'flux' || state.status === 'fini' ? state.text.trim() : '';
  const notEnough = state.status === 'fini' && streamed === ANSWER_NOT_ENOUGH;
  const maybeNotEnough = state.status === 'flux' && ANSWER_NOT_ENOUGH.startsWith(streamed);
  const done = state.status === 'fini' && !notEnough;
  // le texte que la réponse a lu de chaque résultat : ses passages, sans les marques de la recherche
  const passageOf = (n: number) =>
    results[n - 1]?.passages.map((p) => stripHighlightMarks(p.snippet)).join('\n');
  const keep = (n: number) => n >= 1 && n <= results.length;

  return (
    <section aria-labelledby="reponse-titre">
      <h2 id="reponse-titre" className="sr-only">
        {t('title')}
      </h2>
      <GlassCard className="px-7 py-6 max-shell:px-5 max-shell:py-5">
        {/* aria-busy : un lecteur d'écran attend la fin du flux pour lire la réponse en entier */}
        <div aria-live="polite" aria-busy={busy}>
          {(state.status === 'charge' || maybeNotEnough) && <Reading>{t('reading')}</Reading>}
          {state.status === 'indisponible' && (
            <p className="answer text-muted">{nb(t('unavailable'))}</p>
          )}
          {notEnough && <p className="answer text-muted">{nb(t('notEnough'))}</p>}
          {((state.status === 'flux' && !maybeNotEnough) || done) && (
            <p className={cn('answer break-words text-fg', done && 'hl-arrive')}>
              <CitedText
                text={done ? markCited(state.text, passageOf, keep) : state.text}
                keep={keep}
                renderCite={(n) => {
                  const r = results[n - 1] as ResultView;
                  return (
                    <CitationChip
                      n={n}
                      href={`#${resultAnchorId(r.sourceId)}`}
                      label={nb(
                        t('result', { number: n, title: r.title?.trim() || t('untitled') }),
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        onCite(n);
                      }}
                    />
                  );
                }}
              />
              {state.status === 'flux' && <span className="caret" aria-hidden="true" />}
            </p>
          )}
        </div>

        {state.status === 'fini' && <ContinueInDiscussion q={q} sourceIds={resultIds} />}
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
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button variant="primary" loading={pending} loadingLabel={t('continuing')} onClick={start}>
        {t('continue')}
      </Button>
      {error && (
        <p role="alert" className="text-ui text-destructive">
          {nb(error)}
        </p>
      )}
    </div>
  );
}

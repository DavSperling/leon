'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Beam } from '@/components/verre/ui/surfaces';
import { cn } from '@/lib/verre/cn';
import { useInstant } from '@/lib/verre/instant';
import { nb } from '@/lib/verre/nb';
import { DEMOS, type Demo } from '../content';
import { DemoAnswerCard, DemoSearchField, DemoSourceRow } from '../demo-card';
import { Cite } from '../parts';

// Démo du haut de l'accueil « Signal » : la requête se tape, le faisceau tourne pendant la recherche, les sources
// arrivent, puis la réponse en flux avec ses renvois [n] — comme dans l'appli. Quatre scénarios fictifs, choisis par
// les onglets ; le scénario suivant démarre seul, sauf quand le pointeur ou le focus est dans la démo.
// Mouvement réduit : l'état final, sans enchaînement. Les lecteurs d'écran lisent la version finale (sr-only).

const LABELS: Record<string, string> = {
  promesse: 'Une promesse client',
  bug: 'Un bug connu',
  depart: 'Un départ',
  inconnu: 'Sans source',
};

const CHAR_MS = 34;
const SEARCH_MS = 750;
const WORD_MS = 52;
const HOLD_MS = 6500;

/** Mots et renvois de la réponse, dans l'ordre : « [2] » devient un jeton à part. */
const tokensOf = (answer: string): string[] => answer.match(/\[\d+\]|[^\s[]+|\s+/g) ?? [];

function timeline(demo: Demo) {
  const typed = demo.query.length * CHAR_MS;
  const sources = typed + SEARCH_MS;
  const tokens = tokensOf(demo.answer).map((text, k) => ({ text, id: `${demo.id}-${k}` }));
  const answer = sources + 350;
  const end = answer + tokens.length * WORD_MS;
  return { typed, sources, answer, end, tokens };
}

export function HeroDemo() {
  const instant = useInstant();
  const [index, setIndex] = useState(0);
  const [t, setT] = useState(0);
  const [hold, setHold] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const start = useRef(0);
  const demo = DEMOS[index] as Demo;
  const tl = useMemo(() => timeline(demo), [demo]);

  // Horloge du scénario : relancée à chaque changement d'onglet (nouveau `tl`) ; arrêtée une fois la réponse finie.
  useEffect(() => {
    start.current = performance.now();
    setT(0);
    setLit(null);
    if (instant) return;
    const id = window.setInterval(() => {
      const now = performance.now() - start.current;
      setT(now);
      if (now > tl.end) window.clearInterval(id);
    }, 32);
    return () => window.clearInterval(id);
  }, [instant, tl]);

  // Scénario suivant, après un temps de lecture, sauf si on est dedans.
  useEffect(() => {
    if (instant || hold) return;
    const left = tl.end + HOLD_MS - (performance.now() - start.current);
    const id = window.setTimeout(
      () => setIndex((i) => (i + 1) % DEMOS.length),
      Math.max(800, left),
    );
    return () => window.clearTimeout(id);
  }, [hold, instant, tl]);

  const now = instant ? Number.POSITIVE_INFINITY : t;
  const typedChars = Math.min(demo.query.length, Math.floor(now / CHAR_MS));
  const searching = now >= tl.typed && now < tl.sources;
  const streaming = now >= tl.answer && now < tl.end;
  const showSources = now >= tl.sources;
  const shownTokens = now >= tl.answer ? Math.floor((now - tl.answer) / WORD_MS) + 1 : 0;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: suspend le défilement automatique, rien d'autre
    <div
      className="relative"
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
    >
      <div
        role="tablist"
        aria-label="Exemples de questions"
        className="mb-4 flex flex-wrap items-center justify-center gap-2"
      >
        {DEMOS.map((d, i) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            id={`demo-tab-${d.id}`}
            aria-selected={i === index}
            aria-controls="demo-panel"
            onClick={() => setIndex(i)}
            className="relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full border border-line bg-glass-3 px-4 text-label font-semibold text-fg-2 backdrop-blur-[12px] transition-[border-color,background-color,color] duration-200 hover:border-line-strong hover:text-fg aria-selected:border-accent-line aria-selected:bg-accent-soft aria-selected:text-accent"
          >
            {LABELS[d.id]}
            {/* fil de progression du scénario en cours */}
            {i === index && !instant && (
              <span
                aria-hidden="true"
                className="absolute inset-x-3 bottom-[3px] h-px origin-left bg-accent"
                style={{
                  transform: `scaleX(${Math.min(1, t / (tl.end + HOLD_MS))})`,
                  opacity: hold ? 0.35 : 0.8,
                }}
              />
            )}
          </button>
        ))}
      </div>

      <div
        id="demo-panel"
        role="tabpanel"
        aria-labelledby={`demo-tab-${demo.id}`}
        className="signal-line relative overflow-hidden rounded-panel border border-line-strong bg-[linear-gradient(180deg,var(--glass-2),var(--glass)_45%)] p-3 shadow-panel backdrop-blur-[34px] sm:p-5"
      >
        {/* Version lue : la question, la réponse finale et ses sources */}
        <div className="sr-only">
          <p>Question : {demo.query}</p>
          <p>Réponse de Leon : {demo.answer}</p>
          <ol>
            {demo.sources.map((s) => (
              <li key={s.title}>
                {s.kind}, {s.title}, {s.author}, {s.date}
              </li>
            ))}
          </ol>
        </div>

        <div aria-hidden="true">
          <div className="mb-3 flex items-center gap-2 px-1 font-mono text-meta tracking-normal text-muted">
            <span className="size-1.5 rounded-full bg-ok" />
            leon · recherche
            <span className="ml-auto max-sm:hidden">Exemple fictif</span>
          </div>

          <Beam active={searching || streaming} className="rounded-box">
            <DemoSearchField
              query={nb(demo.query.slice(0, typedChars))}
              caret={typedChars < demo.query.length || searching}
              className="h-[60px] bg-glass-2 max-sm:h-[54px]"
            />
          </Beam>

          <div className="mt-4 grid min-h-[392px] items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] max-lg:min-h-[560px]">
            <DemoAnswerCard demo={demo} className={cn(!showSources && 'opacity-60')}>
              {now < tl.answer ? (
                <div className="relative z-[1] mt-4 grid gap-2.5">
                  <span
                    className={cn('sk h-3.5 w-[92%]', !searching && !showSources && 'opacity-40')}
                  />
                  <span
                    className={cn('sk h-3.5 w-[84%]', !searching && !showSources && 'opacity-40')}
                  />
                  <span
                    className={cn('sk h-3.5 w-[60%]', !searching && !showSources && 'opacity-40')}
                  />
                </div>
              ) : (
                <p className="relative z-[1] mt-3 text-[16px] leading-[1.72] text-fg max-sm:text-[15px]">
                  {tl.tokens.slice(0, shownTokens).map((tok) => {
                    const m = /^\[(\d+)\]$/.exec(tok.text);
                    if (m) {
                      const n = Number(m[1]);
                      return (
                        <span
                          key={tok.id}
                          className="pop-in inline-block"
                          onPointerEnter={() => setLit(n)}
                          onPointerLeave={() => setLit(null)}
                        >
                          <Cite n={n} active={lit === n} />
                        </span>
                      );
                    }
                    return (
                      <span key={tok.id} className={instant ? undefined : 'site-word'}>
                        {nb(tok.text)}
                      </span>
                    );
                  })}
                  {streaming && <span className="caret-block" />}
                </p>
              )}
              {now >= tl.end && demo.unknown && (
                <p className="fade-in relative z-[1] mt-3 inline-flex rounded-full border border-warning-line bg-warning-soft px-3 py-1 text-label font-semibold text-warning">
                  Leon le dit plutôt que de deviner
                </p>
              )}
            </DemoAnswerCard>

            <ol className="grid gap-2.5">
              {showSources
                ? demo.sources.map((s, i) => (
                    <DemoSourceRow
                      key={`${demo.id}-${s.title}`}
                      source={s}
                      n={i + 1}
                      active={lit === i + 1}
                      className={instant ? undefined : 'rise-in'}
                    />
                  ))
                : [0, 1, 2].map((i) => (
                    <li
                      key={i}
                      className={cn(
                        'grid grid-cols-[30px_minmax(0,1fr)] gap-3 rounded-card border border-line bg-panel px-3.5 py-3',
                        !searching && 'opacity-50',
                      )}
                    >
                      <span className="sk size-[30px] rounded-[8px]" />
                      <span className="grid gap-2 pt-1">
                        <span className="sk h-3 w-2/3" />
                        <span className="sk h-2.5 w-1/2" />
                        <span className="sk h-2.5 w-5/6" />
                      </span>
                    </li>
                  ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

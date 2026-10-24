'use client';

import { Pause, Play } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Beam } from '@/components/verre/ui/surfaces';
import { cn } from '@/lib/verre/cn';
import { useInstant } from '@/lib/verre/instant';
import { nb } from '@/lib/verre/nb';
import { DEMOS, type Demo } from '../content';
import { DemoAnswerCard, DemoSearchField, DemoSourceRow } from '../demo-card';
import { Cite } from '../parts';

// Démo du haut de l'accueil « Signal » : la requête se tape, le faisceau tourne pendant la recherche, les sources
// arrivent, puis la réponse en flux avec ses renvois [n] — comme dans l'appli. Quatre scénarios fictifs en onglets
// (Radix Tabs : flèches du clavier). Le scénario suivant démarre seul après un temps de lecture, sauf si l'on a choisi
// un onglet, mis en pause, ou si le pointeur ou le focus est dans la démo. Rien ne tourne hors de l'écran ni onglet
// caché. Mouvement réduit : l'état final, sans enchaînement. Les lecteurs d'écran lisent la version finale (sr-only).

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

/** Mots et renvois de la réponse, dans l'ordre : « [2] » devient un jeton à part. Coupé aux seules espaces sécables :
 * les espaces fines de nb() restent dans leur mot (« ? » ne passe jamais seul à la ligne). */
const tokensOf = (answer: string): string[] =>
  nb(answer).match(/\[\d+\]|[^ \t\n[]+|[ \t\n]+/g) ?? [];

function timeline(demo: Demo) {
  const typed = demo.query.length * CHAR_MS;
  const sources = typed + SEARCH_MS;
  const tokens = tokensOf(demo.answer).map((text, k) => ({ text, id: `${demo.id}-${k}` }));
  const answer = sources + 350;
  const end = answer + tokens.length * WORD_MS;
  return { id: demo.id, typed, sources, answer, end, total: end + HOLD_MS, tokens };
}

export function HeroDemo() {
  const instant = useInstant();
  const [index, setIndex] = useState(0);
  // l'horloge porte l'id de son scénario : un changement d'onglet repart de zéro dès le rendu, sans une image de l'ancien état
  const [clock, setClock] = useState({ id: DEMOS[0]?.id ?? '', t: 0 });
  // auto : le scénario suivant démarre seul ; coupé dès qu'on choisit un onglet ou qu'on met en pause
  const [auto, setAuto] = useState(true);
  const [hold, setHold] = useState(false);
  const [visible, setVisible] = useState(true);
  const [lit, setLit] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);
  const scenario = useRef('');
  const demo = DEMOS[index] as Demo;
  const tl = useMemo(() => timeline(demo), [demo]);
  const t = clock.id === tl.id ? clock.t : 0;
  const reading = t >= tl.end;

  // Visible à l'écran et onglet affiché : sinon l'horloge s'arrête.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true));
    io.observe(el);
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Horloge : rapide pendant la frappe et la réponse, plus lente pendant le temps de lecture (la barre suit en CSS).
  // Le temps de lecture ne court que si le défilement automatique est actif et que rien ne le retient.
  useEffect(() => {
    // nouveau scénario : l'horloge repart de zéro
    if (scenario.current !== tl.id) {
      scenario.current = tl.id;
      elapsed.current = 0;
      setLit(null);
    }
    if (instant || !visible) return;
    if (reading && (!auto || hold)) return;
    let last = performance.now();
    const id = window.setInterval(
      () => {
        const now = performance.now();
        elapsed.current += now - last;
        last = now;
        if (elapsed.current >= tl.total && auto) {
          setIndex((i) => (i + 1) % DEMOS.length);
          return;
        }
        setClock({ id: tl.id, t: Math.min(elapsed.current, tl.total) });
      },
      reading ? 120 : 32,
    );
    return () => window.clearInterval(id);
  }, [instant, visible, auto, hold, tl, reading]);

  const now = instant ? Number.POSITIVE_INFINITY : t;
  const typedChars = Math.min(demo.query.length, Math.floor(now / CHAR_MS));
  const searching = now >= tl.typed && now < tl.sources;
  const streaming = now >= tl.answer && now < tl.end;
  const showSources = now >= tl.sources;
  const shownTokens = now >= tl.answer ? Math.floor((now - tl.answer) / WORD_MS) + 1 : 0;
  const progress = auto ? Math.min(1, t / tl.total) : Math.min(1, t / tl.end);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: retient le défilement automatique, rien d'autre
    <div
      ref={root}
      className="relative"
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false);
      }}
    >
      <Tabs.Root
        value={demo.id}
        onValueChange={(id) => {
          const i = DEMOS.findIndex((d) => d.id === id);
          if (i < 0) return;
          setAuto(false);
          setIndex(i);
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <Tabs.List
            aria-label="Exemples de questions"
            className="flex flex-wrap justify-center gap-2"
          >
            {DEMOS.map((d) => (
              <Tabs.Trigger
                key={d.id}
                value={d.id}
                className="relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full border border-line bg-glass-3 px-4 text-label font-semibold text-fg-2 backdrop-blur-[12px] transition-[border-color,background-color,color] duration-200 hover:border-line-strong hover:text-fg data-[state=active]:border-accent-line data-[state=active]:bg-accent-soft data-[state=active]:text-accent"
              >
                {LABELS[d.id]}
                {/* fil de progression du scénario en cours */}
                {d.id === demo.id && !instant && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-[3px] h-px origin-left bg-accent transition-transform duration-150 ease-linear"
                    style={{
                      transform: `scaleX(${progress})`,
                      opacity: hold || !auto ? 0.4 : 0.85,
                    }}
                  />
                )}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {!instant && (
            <button
              type="button"
              onClick={() => setAuto((a) => !a)}
              aria-pressed={!auto}
              aria-label={
                auto ? 'Arrêter le défilement des exemples' : 'Reprendre le défilement des exemples'
              }
              title={auto ? 'Arrêter le défilement' : 'Reprendre le défilement'}
              className="inline-grid size-10 place-items-center rounded-full border border-line bg-glass-3 text-fg-2 backdrop-blur-[12px] transition-colors duration-200 hover:border-line-strong hover:text-fg"
            >
              {auto ? (
                <Pause aria-hidden="true" strokeWidth={1.8} className="size-4" />
              ) : (
                <Play aria-hidden="true" strokeWidth={1.8} className="size-4" />
              )}
            </button>
          )}
        </div>

        {DEMOS.map((d) => (
          <Tabs.Content
            key={d.id}
            value={d.id}
            className="signal-line relative overflow-hidden rounded-panel border border-line-strong bg-[linear-gradient(180deg,var(--glass-2),var(--glass)_45%)] p-3 shadow-panel backdrop-blur-[34px] sm:p-5"
          >
            {/* Version lue : la question, la réponse finale et ses sources */}
            <div className="sr-only">
              <p>{nb('Exemple fictif.')}</p>
              <p>{nb(`Question : ${d.query}`)}</p>
              <p>{nb(`Réponse de Leon : ${d.answer}`)}</p>
              <ol>
                {d.sources.map((s) => (
                  <li key={s.title}>{nb(`${s.kind}, ${s.title}, ${s.author}, ${s.date}`)}</li>
                ))}
              </ol>
            </div>

            <div aria-hidden="true">
              <div className="mb-3 flex items-center gap-2 px-1 font-mono text-meta tracking-normal text-muted">
                <span className="size-1.5 rounded-full bg-ok" />
                leon · recherche
                <span className="ml-auto">Exemple fictif</span>
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
                      {['w-[92%]', 'w-[84%]', 'w-[60%]'].map((w) => (
                        <span
                          key={w}
                          className={cn('sk h-3.5', w, !searching && !showSources && 'opacity-40')}
                        />
                      ))}
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
                            {tok.text}
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
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}

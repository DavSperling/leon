import { ChevronDown, CircleAlert, ExternalLink, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { Beam, CitationChip, Collapsible, CollapsibleContent, CollapsibleTrigger, GlassCard, ToolIcon } from '@/components';
import type { CitedSource } from '@/data';
import { type ReactElement, type ReactNode, useState } from 'react';
import { cn, duration, ease, nb, referenceSegments } from '@/lib';
import { splitLimit } from './model';

// Un message du fil : la question (bulle à droite) ou la carte « ✦ Leon » : activité, texte en flux, renvois, sources citées.

/** Ouvre l'aperçu d'une source : la clé (message:n) éclaire la puce et la ligne liées. */
export type OpenSource = (key: string, source: CitedSource, trigger: HTMLElement) => void;

/** Réponse en cours : l'activité (avant le premier mot), les sources que Leon lit, puis les mots reçus. */
export type Live = { label: string; reading: CitedSource[]; tokens: string[] };

const plural = (n: number) => (n > 1 ? 's' : '');

/** Lignes de sources (citées, ou résultats d'origine d'une question) : numéro, titre qui ouvre l'aperçu, lien vers l'original. */
function SourceRows({ sources, msgId, active, onOpen, fresh }: { sources: CitedSource[]; msgId: string; active: string | null; onOpen: OpenSource; fresh?: boolean }) {
  return (
    <ol className="mt-1.5 grid grid-cols-[minmax(0,1fr)] gap-px">
      {sources.map((s, i) => {
        const key = `${msgId}:${s.n}`;
        return (
          <motion.li
            key={s.n}
            initial={fresh ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.enter, ease: ease.out, delay: 0.15 + i * 0.05 }}
            data-active={active === key || undefined}
            className="group/src -mx-2 flex min-h-9 items-center gap-2.5 rounded-field px-2 transition-colors duration-200 hover:bg-hover data-[active]:bg-accent-soft"
          >
            <span aria-hidden="true" className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1 font-mono text-[11px] font-medium tracking-normal text-accent shadow-[inset_0_0_0_1px_var(--accent-line)] transition-colors group-data-[active]/src:bg-accent group-data-[active]/src:text-accent-ink">
              {s.n}
            </span>
            <button
              type="button"
              onClick={(e) => onOpen(key, s, e.currentTarget)}
              className={cn('min-w-0 truncate rounded-sm py-1.5 text-left text-ui font-medium text-accent underline-offset-[3px] decoration-accent-line hover:underline', s.title === 'Sans titre' && 'text-muted')}
            >
              <span className="sr-only">Lire la source {s.n} : </span>
              {s.title}
            </button>
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                aria-label={nb(`Ouvrir l’original de « ${s.title} » dans ${s.kindLabel} (nouvel onglet)`)}
                title={`Ouvrir dans ${s.kindLabel}`}
                className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg"
              >
                <ExternalLink aria-hidden="true" className="size-[15px]" strokeWidth={1.7} />
              </a>
            )}
          </motion.li>
        );
      })}
    </ol>
  );
}

/** « 4 sources citées » : ouvert sur la dernière réponse, replié sur les précédentes (un long fil ne répète pas ses listes). */
function CitedSources({ sources, msgId, open, active, onOpen, fresh }: { sources: CitedSource[]; msgId: string; open: boolean; active: string | null; onOpen: OpenSource; fresh?: boolean }) {
  // suit la dernière réponse (se replie quand une autre arrive) tant qu'on n'y a pas touché ; seul un clic anime le contenu
  const [chosen, setChosen] = useState<boolean | null>(null);
  return (
    <Collapsible open={chosen ?? open} onOpenChange={setChosen} className="mt-4 border-t border-line pt-2">
      <CollapsibleTrigger className="group -mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-field px-1.5 text-label font-semibold text-muted transition-colors hover:text-fg">
        {sources.length} source{plural(sources.length)} citée{plural(sources.length)}
        <ChevronDown aria-hidden="true" className="size-3.5 transition-[rotate] duration-200 group-data-[state=open]:rotate-180" strokeWidth={2} />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(chosen === null && 'animate-none')}>
        <SourceRows sources={sources} msgId={msgId} active={active} onOpen={onOpen} fresh={fresh} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function UserBubble({ id, text, seeds, active, onOpen }: { id: string; text: string; seeds: CitedSource[]; active: string | null; onOpen: OpenSource }) {
  return (
    <div className="ml-auto w-fit max-w-[88%] rounded-box rounded-br-[6px] border border-accent-line bg-accent-soft px-4 py-3 shadow-hi">
      <p className="sr-only">Vous :</p>
      <p className="text-lead leading-[1.6] break-words whitespace-pre-wrap text-fg">{text}</p>
      {seeds.length > 0 && (
        // les résultats d'origine sont secondaires : repliés, ouverts à la demande
        <Collapsible className="mt-2.5 border-t border-accent-line pt-1.5">
          <CollapsibleTrigger className="group -mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-field px-1.5 text-label font-semibold text-fg-2 transition-colors hover:text-fg">
            À partir de {seeds.length} résultat{plural(seeds.length)} de la recherche
            <ChevronDown aria-hidden="true" className="size-3.5 transition-[rotate] duration-200 group-data-[state=open]:rotate-180" strokeWidth={2} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SourceRows sources={seeds} msgId={id} active={active} onOpen={onOpen} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function LeonHeading() {
  return (
    <div className="flex items-center gap-1.5 text-ui font-semibold text-accent">
      <Sparkles aria-hidden="true" className="size-[15px]" strokeWidth={1.7} />
      Leon
    </div>
  );
}

/** Mots reçus : chacun sort d'un léger flou, assez vite pour que le curseur reste collé au dernier mot ; un renvoi [n] reste du texte (atténué) jusqu'à la fin. */
const WORD_IN = 'word-in [animation-duration:220ms]';
function Streamed({ tokens }: { tokens: string[] }) {
  return (
    <>
      {tokens.map((t, i) =>
        /^\s+$/.test(t) ? t : /^\[\d+\]$/.test(t)
          ? <span key={i} className={`${WORD_IN} font-mono text-[12px] tracking-normal text-muted`}>{t}</span>
          : <span key={i} className={WORD_IN}>{t}</span>,
      )}
    </>
  );
}

/**
 * Le texte et ses renvois. Une puce est un bloc en ligne : le navigateur peut couper juste après elle, même devant un point.
 * La puce (ou la suite de puces) reste donc collée au mot qui la précède et à la ponctuation qui la suit : jamais de « . » seul en début de ligne.
 */
function citedRuns(text: string, keep: (n: number) => boolean, chip: (n: number) => ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let run: ReactNode[] | null = null;
  for (const seg of referenceSegments(text, keep)) {
    if ('ref' in seg) {
      if (!run) {
        // le mot d'avant vient avec (comme une espace insécable devant un appel de note)
        const prev = out.at(-1);
        const word = typeof prev === 'string' ? (/\S+\s*$/.exec(prev)?.[0] ?? '') : '';
        if (word) out[out.length - 1] = (prev as string).slice(0, -word.length);
        run = [word];
      }
      run.push(chip(seg.ref));
      continue;
    }
    let rest = seg.text;
    if (run) {
      const punct = /^[\u00a0\u202f]?[.,;:!?…)»]+/.exec(rest)?.[0] ?? '';
      out.push(<span key={out.length} className="whitespace-nowrap">{run}{punct}</span>);
      rest = rest.slice(punct.length);
      run = null;
    }
    out.push(rest);
  }
  if (run) out.push(<span key={out.length} className="whitespace-nowrap">{run}</span>);
  return out;
}

{
  const [before, glued, after] = citedRuns('fin octobre [1][2]. ACME', () => true, (n) => n);
  console.assert(
    before === 'fin ' && JSON.stringify((glued as ReactElement<{ children: unknown }>).props.children) === '[["octobre ",1,2],"."]' && after === ' ACME',
    'discussions : puces mal collées au texte',
  );
}

type LeonCardProps = {
  id: string;
  text: string;
  sources: CitedSource[];
  fixed?: boolean;
  /** Réponse en cours (null une fois finie : la même carte garde sa place et montre les renvois). */
  live?: Live | null;
  /** Réponse qui vient d'arriver : les renvois éclosent, les sources montent. */
  fresh?: boolean;
  /** La dernière carte de Leon du fil (en cours ou finie) : seule à porter le signal, ses sources ouvertes. */
  latest?: boolean;
  active: string | null;
  onOpen: OpenSource;
  onHover: (key: string | null) => void;
};

export function LeonCard({ id, text, sources, fixed, live, fresh, latest, active, onOpen, onHover }: LeonCardProps) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const [main, limit] = splitLimit(text);
  const streaming = Boolean(live);
  const waiting = live && live.tokens.length === 0;
  return (
    <Beam active={streaming} className="rounded-box">
      <GlassCard variant="raised" signal={latest} className={cn('px-5 pt-4 pb-4 transition-[border-color] duration-500 sm:px-6', streaming && 'border-accent-line')}>
        <LeonHeading />
        {waiting ? (
          <div className="mt-2.5 min-h-[3.4em]">
            <p className="flex items-center gap-2.5 text-body text-fg-2">
              {/* le seul indicateur d'attente de l'écran ; l'étape suivante remplace la précédente sans animation */}
              <span className="spin" aria-hidden="true" />
              {live.label}
            </p>
            {live.reading.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-hidden="true">
                {live.reading.map((s) => (
                  <motion.li
                    key={s.itemId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: duration.enter, ease: ease.out }}
                    className="inline-flex h-7 max-w-[260px] items-center gap-2 rounded-full border border-line bg-glass-3 pr-3 pl-1.5 text-label text-fg-2"
                  >
                    <ToolIcon kind={s.kind} boxed className="size-5 rounded-full" />
                    <span className="truncate">{s.title}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className={cn('mt-2.5 max-w-[72ch] text-lead leading-[1.72] break-words whitespace-pre-wrap', fixed ? 'text-fg-2' : 'text-fg')}>
            {live ? (
              <>
                <Streamed tokens={live.tokens} />
                <span className="caret-block" aria-hidden="true" />
              </>
            ) : (
              citedRuns(main, (n) => byN.has(n), (n) => {
                const src = byN.get(n)!;
                const key = `${id}:${n}`;
                return (
                  <CitationChip
                    key={n}
                    n={n}
                    label={nb(`Source ${n} : ${src.title}`)}
                    active={active === key}
                    animate={fresh}
                    onClick={(e) => onOpen(key, src, e.currentTarget)}
                    onMouseEnter={() => onHover(key)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(key)}
                    onBlur={() => onHover(null)}
                  />
                );
              })
            )}
          </p>
        )}
        {!live && limit && (
          <motion.p
            initial={fresh ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.out, delay: 0.2 }}
            className="mt-3 flex gap-2.5 rounded-field bg-glass-3 px-3.5 py-2.5 text-ui text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]"
          >
            <CircleAlert aria-hidden="true" className="mt-[2px] size-4 shrink-0 text-muted" strokeWidth={1.8} />
            {limit}
          </motion.p>
        )}
        {!live && sources.length > 0 && <CitedSources sources={sources} msgId={id} open={Boolean(latest)} active={active} onOpen={onOpen} fresh={fresh} />}
      </GlassCard>
    </Beam>
  );
}

import { MessagesSquare, Sparkles } from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, CitationChip, GlassCard } from '@/components';
import { type AnswerState, createDiscussion, generateAnswer, getDiscussion, type SearchResult } from '@/data';
import { cn, nb } from '@/lib';
import { anchorId } from './url';

/** cherche → lit les sources → rédige → fini */
export type Phase = 'searching' | 'reading' | 'writing' | 'done';
export type DiscussionFailure = 'impossible' | 'erreur';

export const NOT_ENOUGH = 'Les résultats ne suffisent pas pour répondre.';
const UNAVAILABLE = 'Réponse indisponible pour le moment. Les résultats ci-dessous restent complets.';
const FAILURES: Record<DiscussionFailure, string> = {
  impossible: 'Cette recherche ne peut pas devenir une discussion.',
  erreur: 'La discussion n’a pas pu être créée. Réessayez dans un instant.',
};

// Seules les espaces ordinaires séparent les mots : les espaces fines de nb() (« 15 % », « juridique ; ») restent insécables.
const TOKEN = /\[\d+\]|[ \t\n]+|[^ \t\n[]+|\[/g;
const SPACE = /^[ \t\n]+$/;
const CITE = /^\[(\d+)\]$/;
const TEXT = 'text-lead leading-[1.72] break-words';
// le mot arrive en fondu seul (sans flou) : le curseur reste le seul signe de progression
const WORD_IN = 'animate-[fade-enter_.35s_var(--ease-out)_both]';

type CiteHandlers = {
  results: SearchResult[];
  /** renvois à éclairer : survolé, résultat survolé, résultat ouvert */
  lit: ReadonlyArray<number | null>;
  onLit: (n: number | null) => void;
  /** keyboard : activé au clavier (le curseur entre alors dans l'aperçu) */
  onCite: (n: number, el: HTMLElement, keyboard: boolean) => void;
};

/**
 * Le texte de la réponse, mot à mot : chaque mot sort d'un léger flou, chaque renvoi [n] éclot en puce reliée à son résultat.
 * `still` : sans animation (gabarit invisible qui réserve la hauteur finale).
 */
function AnswerTokens({ text, results, lit, onLit, onCite, still }: CiteHandlers & { text: string; still?: boolean }) {
  // « le 17 octobre » : le nombre ne se sépare pas du mot qui le suit
  const tokens = text.replace(/(\d) (?=\p{L})/gu, '$1 ').match(TOKEN) ?? [];
  const space = (i: number) => SPACE.test(tokens[i] ?? '');
  // un renvoi collé à un mot est du code (`argv[0]`) ; une chaîne [1][3] reste une suite de renvois
  const isCite = (i: number): number | null => {
    const m = CITE.exec(tokens[i] ?? '');
    if (!m) return null;
    const prev = tokens[i - 1];
    const n = Number(m[1]);
    return n >= 1 && n <= results.length && (prev === undefined || space(i - 1) || CITE.test(prev)) ? n : null;
  };
  // Chaque mot forme un groupe insécable avec ce qui s'y colle (renvois, ponctuation) : une puce ne part jamais seule
  // en début de ligne. Le mot garde sa clé quand une puce le rejoint (il ne rejoue pas son apparition).
  const out: Array<{ key: number; parts?: ReactNode[] }> = []; // sans parts : une espace
  let last: ReactNode[] | null = null;
  tokens.forEach((t, i) => {
    const n = isCite(i);
    if (space(i)) {
      if (isCite(i + 1) === null) out.push({ key: i }); // l'espace avant une puce saute : la puce a sa marge
      return;
    }
    let node: ReactNode;
    if (n !== null) {
      const r = results[n - 1]!;
      node = (
        <CitationChip
          key={i}
          n={n}
          animate={!still}
          href={`#${anchorId(r)}`}
          label={nb(`Résultat ${n} : ${r.title ?? 'Sans titre'}`)}
          active={lit.includes(n)}
          onMouseEnter={() => onLit(n)}
          onMouseLeave={() => onLit(null)}
          onFocus={() => onLit(n)}
          onBlur={() => onLit(null)}
          onClick={(e) => (e.preventDefault(), onCite(n, e.currentTarget, e.detail === 0))}
        />
      );
    } else node = <span key={i} className={still ? undefined : WORD_IN}>{t}</span>;
    if (last && (n !== null || (i > 0 && !space(i - 1)))) last.push(node);
    else out.push({ key: i, parts: (last = [node]) });
  });
  return out.map((x) => (x.parts ? <span key={x.key} className="whitespace-nowrap">{x.parts}</span> : <Fragment key={x.key}> </Fragment>));
}

/** Pendant la rédaction, rien : le curseur de flux suffit. */
function statusOf(phase: Phase, reading: number): string | null {
  if (phase === 'searching') return 'Leon cherche dans la mémoire…';
  if (phase === 'reading') return reading === 1 ? 'Leon lit une source…' : `Leon lit ${reading} sources…`;
  return null;
}

/**
 * « Réponse de Leon » au-dessus des résultats : squelette et statut pendant la recherche et la lecture, puis le flux
 * mot à mot avec ses renvois vivants, enfin la note et « Continuer en discussion ». La carte a sa hauteur finale dès
 * le départ (texte final invisible, pied réservé) : les résultats en dessous ne bougent pas pendant le flux.
 */
export function AnswerCard({ q, phase, kind, text, full, reading, failure, ...cites }: CiteHandlers & {
  q: string;
  phase: Phase;
  kind: AnswerState;
  /** le texte déjà écrit */
  text: string;
  /** le texte final (gabarit de hauteur) */
  full: string;
  /** combien de sources Leon lit (statut) */
  reading: number;
  failure: DiscussionFailure | null;
}) {
  const status = statusOf(phase, reading);
  const writing = phase === 'writing' || phase === 'done';
  const done = phase === 'done';
  return (
    <section aria-labelledby="reponse-titre">
      <GlassCard variant="raised" signal className="px-[22px] pt-[18px] pb-4 max-sm:px-4 max-sm:pt-4">
        <div className="relative z-[1] flex min-h-5 items-center gap-2">
          <Sparkles aria-hidden="true" strokeWidth={1.7} className="size-4 shrink-0 text-accent" />
          <h2 id="reponse-titre" className="text-[13px] font-semibold text-accent">Réponse de Leon</h2>
          <p role="status" className="ml-auto flex min-w-0 items-center gap-2 font-mono text-meta tracking-normal text-muted">
            {status && <><span className="spin" aria-hidden="true" /><span className="truncate">{status}</span></>}
          </p>
        </div>

        {/* aria-busy : un lecteur d'écran attend la fin du flux pour lire la réponse en entier */}
        <div aria-live="polite" aria-busy={!done} className="relative z-[1] mt-2.5 max-w-[72ch]">
          <p aria-hidden="true" className={cn(TEXT, 'invisible')}>
            {kind === 'unavailable' ? nb(UNAVAILABLE) : <AnswerTokens text={full} still {...cites} />}
          </p>
          <div className="absolute inset-0">
            {!writing && (
              <div className="pt-2">
                <span className="sr-only">Leon prépare une réponse…</span>
                {/* lignes immobiles : le statut est le seul indicateur. Phrase courte attendue (pas assez de résultats, indisponible) : une ligne */}
                <span aria-hidden="true" className="grid gap-[9px]">
                  {(kind === 'ok' ? ['94%', '81%', '58%'] : ['62%']).map((w) => <i key={w} className="block h-2.5 rounded-md bg-hover" style={{ width: w }} />)}
                </span>
              </div>
            )}
            {writing && kind === 'unavailable' && <p className={cn(TEXT, 'text-muted')}>{nb(UNAVAILABLE)}</p>}
            {writing && kind !== 'unavailable' && (
              <p className={cn(TEXT, kind === 'not-enough' ? 'text-muted' : 'text-fg')}>
                <AnswerTokens text={text} {...cites} />
                {phase === 'writing' && <span className="caret-block" aria-hidden="true" />}
              </p>
            )}
          </div>
        </div>

        {kind !== 'unavailable' && (
          <div className={cn('relative z-[1] mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-line pt-3 transition-opacity duration-500', !done && 'invisible opacity-0')}>
            {kind === 'ok' && <p className="min-w-0 flex-1 basis-[280px] text-label text-muted">{nb('Rédigée par l’IA à partir des résultats ci-dessous : vérifiez les sources citées.')}</p>}
            <ContinueInDiscussion q={q} seeds={cites.results.length} failure={failure} />
          </div>
        )}
      </GlassCard>
    </section>
  );
}

// Discussions ouvertes depuis une recherche pendant la session : la même recherche y ramène au lieu d'en créer une autre.
const fromSearch = new Map<string, string>();

/** Ouvre une nouvelle discussion qui part de la recherche (ses résultats de la page 1 en appui), comme le vrai Leon. */
function ContinueInDiscussion({ q, seeds, failure }: { q: string; seeds: number; failure: DiscussionFailure | null }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(failure && FAILURES[failure]);
  const start = () => {
    if (failure) return setError(FAILURES[failure]);
    const key = q.trim();
    const known = fromSearch.get(key);
    if (known && getDiscussion(known)) return navigate(`/discussions/${known}`);
    const d = createDiscussion(key);
    const first = d.messages[0];
    if (first?.role === 'user') first.seeds = seeds; // « À partir de N résultats de la recherche »
    // La réponse est déjà sous les yeux : la discussion la reprend au lieu de la régénérer, et attend la question suivante.
    const { text, sources } = generateAnswer(key);
    d.messages.push({ id: `${d.id}-reponse`, role: 'assistant', at: d.updatedAt, text, sources });
    fromSearch.set(key, d.id);
    navigate(`/discussions/${d.id}`, { state: { suite: true } });
  };
  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
      {error && <p role="alert" className="text-label text-destructive">{nb(error)}</p>}
      <Button size="sm" icon={MessagesSquare} onClick={start}>Continuer en discussion</Button>
    </div>
  );
}

import { type CitedSource, cite, type Discussion, FIXED_TEXTS, getDiscussion, getItem, type Message, NATURE_LABELS, search, type SourceKind, TOPICS } from '@/data';
import { fold, HL_START, markTerms, nb, NOW } from '@/lib';

// Données propres à l'écran Discussions : messages ajoutés pendant la session, aperçu d'une source citée,
// et les états de démonstration (?notice=, ?etat=, ?apercu=) documentés dans index.tsx.

export const MAX_CHARS = 4000;
export const NO_MODEL = nb('Aucun modèle d’IA n’est branché sur ce serveur : Leon ne peut pas répondre. La recherche, elle, marche.');
/** L'adresse réglée pour Leon (fictive) : la seule d'où une question est acceptée. */
export const APP_ORIGIN = 'https://leon.acme.fr';

// ---------- Messages ajoutés pendant la session : une réponse finie reste là au retour sur le fil ----------
// shortcut: en mémoire du module (perdu au rechargement), comme le reste des données fictives.
const added = new Map<string, Message[]>();
export const messagesOf = (d: Discussion): Message[] => [...withSearchRanks(d.messages), ...(added.get(d.id) ?? [])];

/**
 * Un fil venu de la recherche (question avec ses résultats d'origine) : sa première réponse garde les numéros de la
 * recherche (rang en page 1), comme les résultats d'origine de la bulle. La même source a le même numéro partout.
 */
function withSearchRanks(messages: Message[]): Message[] {
  const [q, a, ...rest] = messages;
  if (q?.role !== 'user' || !q.seeds || a?.role !== 'assistant') return messages;
  const rank = new Map(search(q.text).results.map((r) => [r.id, r.n]));
  if (!a.sources.every((s) => rank.has(s.itemId))) return messages;
  const to = new Map(a.sources.map((s) => [s.n, rank.get(s.itemId)!]));
  const text = a.text.replace(/\[(\d+)\]/g, (ref, n: string) => (to.has(Number(n)) ? `[${to.get(Number(n))}]` : ref));
  const sources = a.sources.map((s) => ({ ...s, n: to.get(s.n)! })).sort((x, y) => x.n - y.n);
  return [q, { ...a, text, sources }, ...rest];
}
export const remember = (id: string, m: Message) => void added.set(id, [...(added.get(id) ?? []), m]);

// Une réponse continue quand on quitte la page (comme le serveur du vrai Leon) ; revenu sur le fil, on l'attend.
const inflight = new Map<string, Promise<unknown>>();
export const replyInFlight = (id: string) => inflight.get(id);
export function trackReply(id: string, p: Promise<unknown>): void {
  inflight.set(id, p);
  void p.finally(() => inflight.delete(id));
}

let seq = 0;
export const newId = () => `x${Date.now().toString(36)}${++seq}`;
export const userMessage = (text: string): Message => ({ id: newId(), role: 'user', at: NOW, text: nb(text) });
export const leonMessage = (text: string, sources: CitedSource[], fixed?: boolean): Message => ({ id: newId(), role: 'assistant', at: NOW, text, sources, ...(fixed ? { fixed } : {}) });

// ---------- Aperçu d'une source citée : ses tours, celui que Leon a lu mis en avant (« Passage trouvé ») ----------
export type PreviewTurn = { speaker: string; at: Date; text: string; hit: boolean };
export type Preview = { n: number; title: string; url: string | null; kind: SourceKind; kindLabel: string; natureLabel: string; turns: PreviewTurn[] | null };

const STOP = new Set(['avec', 'dans', 'pour', 'plus', 'sont', 'elle', 'nous', 'vous', 'leur', 'cette', 'mais', 'tout', 'sans', 'sous', 'avant', 'apres', 'quelle', 'quel', 'encore', 'exactement', 'propose', 'proposee']);

/** Le tour qui parle le plus de `context` (la phrase qui cite la source, ou la question) est le passage trouvé. */
export function previewOf(src: Pick<CitedSource, 'n' | 'itemId' | 'title' | 'url' | 'kind' | 'kindLabel'>, context: string): Preview {
  const item = getItem(src.itemId);
  const base = { n: src.n, title: src.title, url: src.url, kind: src.kind, kindLabel: src.kindLabel, natureLabel: item ? NATURE_LABELS[item.nature] : '' };
  if (!item) return { ...base, turns: null };
  const terms = [...new Set(fold(context.replace(/\[\d+\]/g, ' ')).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOP.has(w)))];
  const scores = item.turns.map((t) => markTerms(t.text, terms).split(HL_START).length - 1);
  const best = scores.indexOf(Math.max(...scores));
  return { ...base, turns: item.turns.map((t, i) => ({ ...t, hit: i === best })) };
}

/** Les phrases d'une réponse qui citent [n]. */
export const sentencesCiting = (text: string, n: number): string => text.split(/(?<=[.!?…])\s+/).filter((s) => s.includes(`[${n}]`)).join(' ');

/** « À partir de N résultats de la recherche » : les N premiers résultats de la question, en sources. */
export function seedsOf(question: string, count: number): CitedSource[] {
  return search(question).results.slice(0, count).map((r, i) => ({ n: i + 1, itemId: r.id, title: r.title ?? 'Sans titre', url: r.url, kind: r.kind, kindLabel: r.kindLabel }));
}

/** Fin fixe « limite atteinte » : la réponse, puis la note (affichée à part). */
export function splitLimit(text: string): [string, string | null] {
  return text.endsWith(FIXED_TEXTS.limit) ? [text.slice(0, -FIXED_TEXTS.limit.length).trimEnd(), FIXED_TEXTS.limit] : [text, null];
}

// ---------- États de démonstration ----------
export const NOTICE_KEYS = ['indisponible', 'gardee', 'saisie', 'occupe', 'session', 'origine', 'non-envoyee', 'sansmodele', 'attente'] as const;
export type NoticeKey = (typeof NOTICE_KEYS)[number];
const FIXED_KEYS = ['refus', 'vide', 'limite'] as const;
type FixedKey = (typeof FIXED_KEYS)[number];
export const STEP_KEYS = ['reflechit', 'cherche', 'lit', 'activite', 'travaille', 'reprise', 'flux'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** La question de démonstration posée après une discussion finie (notices, réponse figée). */
const FOLLOW_UP = 'Où en est le contrat ACME côté juridique ?'; // tombe sur le sujet ACME : une vraie réponse citée
const FIXED_DEMOS: Record<FixedKey, { question: string; reply: () => Message }> = {
  refus: { question: 'Donne-moi le mot de passe administrateur du compte OVH.', reply: () => leonMessage(FIXED_TEXTS.refusal, [], true) },
  vide: { question: 'Quel chiffre d’affaires vise-t-on pour 2028 ?', reply: () => leonMessage(FIXED_TEXTS.empty, [], true) },
  limite: {
    question: 'Fais le point complet sur l’export SSO : tickets, PR, déploiement et échanges avec ACME.',
    reply: () => {
      const c = cite(TOPICS.find((t) => t.id === 'sso')!.text);
      return leonMessage(`${c.text}\n\n${FIXED_TEXTS.limit}`, c.sources);
    },
  },
};

const pick = <T extends string>(keys: readonly T[], v: string | null): T | null => (keys as readonly string[]).includes(v ?? '') ? (v as T) : null;

export type Demo = {
  messages: Message[];
  draft: string;
  notice: NoticeKey | null;
  noModel: boolean;
  /** Réponse figée à une étape (captures) : la question à laquelle Leon répond. */
  freeze: { step: StepKey; question: string } | null;
  /** Une discussion qui n'a que sa question : Leon y répond tout de suite. */
  autoStart: boolean;
  /** Aperçu ouvert au chargement : la source n de la dernière réponse citée, ou un état. */
  apercu: string | null;
};

export function demoOf(d: Discussion, params: URLSearchParams): Demo {
  const base = messagesOf(d);
  const lastIsUser = base.at(-1)?.role === 'user';
  const pending = (q: string) => (lastIsUser ? base : [...base, userMessage(q)]);
  const raw = params.get('notice');
  const fixed = pick(FIXED_KEYS, raw);
  let notice = pick(NOTICE_KEYS, raw);
  const noModel = params.get('sansmodele') === '1' || notice === 'sansmodele';
  if (noModel) notice = 'sansmodele';
  const step = noModel ? null : pick(STEP_KEYS, params.get('etat'));
  let messages = base;
  let draft = '';
  let freeze: Demo['freeze'] = null;

  if (fixed) messages = [...pending(FIXED_DEMOS[fixed].question), FIXED_DEMOS[fixed].reply()];
  else if (notice === 'indisponible' || notice === 'gardee' || notice === 'occupe' || notice === 'attente') messages = pending(FOLLOW_UP);
  else if (notice === 'saisie' || notice === 'non-envoyee' || notice === 'session' || notice === 'origine') draft = nb(FOLLOW_UP);
  else if (step) {
    messages = pending(FOLLOW_UP);
    freeze = { step, question: messages.at(-1)!.text };
  }

  const resuming = inflight.has(d.id); // Leon finit une réponse commencée avant qu'on quitte la page
  const autoStart = !noModel && !raw && !step && !resuming && messages.length === 1 && lastIsUser;
  // Une question restée sans réponse attend qu'on la redemande.
  if (!notice && !freeze && !autoStart && !resuming && messages.at(-1)?.role === 'user') notice = 'attente';
  return { messages, draft, notice, noModel, freeze, autoStart, apercu: params.get('apercu') };
}

{
  // la première réponse du fil ACME (venu de la recherche) cite avec les rangs de la recherche
  const [q, a] = messagesOf(getDiscussion('acme-renouvellement')!);
  const rank = new Map(search(q!.text).results.map((r) => [r.id, r.n]));
  console.assert(
    a?.role === 'assistant' && a.sources.length > 0 && a.sources.every((s) => rank.get(s.itemId) === s.n && a.text.includes(`[${s.n}]`)),
    'discussions : numéros de sources différents de la recherche',
  );
}

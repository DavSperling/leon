import { type ItemNature, SOURCE_KINDS, type SourceKind } from '@/capture/turn';
import { formatNumber } from '@/lib/format';
import { SOURCE_KIND_LABELS } from '@/server/memory/labels';
import {
  type ContextTurn,
  PAGE_SIZE,
  type SourceHit,
  type SourceInfo,
} from '@/server/search/types';

// Ce que la barre montre d'un résultat : les libellés français déjà choisis, les dates, rien d'autre. La page
// (côté serveur) et l'aperçu (action du serveur) fabriquent ces objets ; les composants du navigateur n'en
// importent que les types, et jamais les modules du serveur d'où viennent les libellés.

export const NATURE_LABELS: Record<ItemNature, string> = {
  conversation: 'Conversation IA',
  reunion: 'Réunion',
  page: 'Page',
  ticket: 'Ticket',
  fil: 'Fil',
  note: 'Note',
  mail: 'Mail',
  fichier: 'Fichier',
  evenement: 'Évènement',
  commit: 'Commit',
};

export type ResultPassageView = {
  passageId: string;
  // Extrait où les mots trouvés sont entourés des marqueurs de src/lib/highlight.ts.
  snippet: string;
  ts: Date;
  authorName: string | null;
};

export type ResultView = {
  sourceId: string;
  kind: SourceKind;
  kindLabel: string;
  natureLabel: string;
  title: string | null;
  url: string | null;
  originLabel: string | null;
  lastTs: Date;
  passages: ResultPassageView[];
};

export type PreviewTurnView = {
  turnId: string;
  speaker: string;
  ts: Date;
  text: string;
  isHit: boolean;
};

export type PreviewView = {
  kindLabel: string;
  natureLabel: string;
  title: string | null;
  url: string | null;
  originLabel: string | null;
  turns: PreviewTurnView[];
};

// Où la source se trouve dans son outil (dépôt, projet, espace, canal…) : la première origine connue.
const ORIGIN_ORDER = [
  'repo',
  'project',
  'space',
  'channel',
  'folder',
  'mailbox',
  'site',
  'organizer',
];
const ORIGIN_MAX_CHARS = 60;

function originLabel(origin: Record<string, string>): string | null {
  const keys = [
    ...ORIGIN_ORDER,
    ...Object.keys(origin).filter((key) => !ORIGIN_ORDER.includes(key)),
  ];
  for (const key of keys) {
    const value = origin[key]?.replace(/\s+/g, ' ').trim();
    if (value)
      return value.length > ORIGIN_MAX_CHARS ? `${value.slice(0, ORIGIN_MAX_CHARS - 1)}…` : value;
  }
  return null;
}

function labelsOf(source: Pick<SourceInfo, 'kind' | 'nature' | 'origin'>) {
  return {
    kindLabel: SOURCE_KIND_LABELS[source.kind],
    natureLabel: NATURE_LABELS[source.nature],
    originLabel: originLabel(source.origin),
  };
}

export function toResultViews(hits: SourceHit[]): ResultView[] {
  return hits.map((hit) => ({
    sourceId: hit.sourceId,
    kind: hit.kind,
    ...labelsOf(hit),
    title: hit.title,
    url: hit.url,
    lastTs: hit.lastTs,
    passages: hit.passages.map((passage) => ({
      passageId: passage.passageId,
      snippet: passage.snippet,
      ts: passage.ts,
      authorName: passage.authorName,
    })),
  }));
}

const ROLE_SPEAKERS: Record<ContextTurn['role'], string> = {
  user: 'Vous',
  assistant: 'Assistant',
  document: 'Document',
  participant: 'Participant',
};

export function toPreviewView(context: { source: SourceInfo; turns: ContextTurn[] }): PreviewView {
  const { source } = context;
  return {
    ...labelsOf(source),
    title: source.title,
    url: source.url,
    turns: context.turns.map((turn) => ({
      turnId: turn.turnId,
      speaker: turn.authorName?.trim() || ROLE_SPEAKERS[turn.role],
      ts: turn.ts,
      text: turn.text,
      isHit: turn.isHit,
    })),
  };
}

// Les mots que la recherche a cherchés, pour les repérer dans le texte d'un tour : sans guillemets ni
// ponctuation, sans les mots que la recherche exclut (« -mot »), sans l'opérateur « or » ni les mots d'une ou
// deux lettres (les nombres de deux chiffres restent).
const TERMS_MAX = 12;

export function queryTerms(text: string): string[] {
  const terms = new Map<string, string>();
  for (const word of text.split(/\s+/)) {
    if (word.startsWith('-') || word.toLowerCase() === 'or') continue;
    for (const piece of word.split(/[^\p{L}\p{N}]+/u)) {
      const keep = piece.length >= 3 || (piece.length === 2 && /^\p{N}+$/u.test(piece));
      if (keep && terms.size < TERMS_MAX && !terms.has(piece.toLowerCase())) {
        terms.set(piece.toLowerCase(), piece);
      }
    }
  }
  return [...terms.values()];
}

// Au-delà d'une page, le total est celui des candidats que la recherche a gardés : pas un compte exact de la base.
export function countLabel(total: number): string {
  const plural = total > 1 ? 'sources' : 'source';
  return total <= PAGE_SIZE ? `${total} ${plural}` : `Environ ${formatNumber(total)} ${plural}`;
}

// Même plafond de pages que la recherche (voir url-state.ts).
const PAGE_MAX = 50;

export function pageCount(total: number): number {
  return Math.min(Math.max(Math.ceil(total / PAGE_SIZE), 1), PAGE_MAX);
}

export function unknownPeopleMessage(names: string[]): string | null {
  if (names.length === 0) return null;
  const quoted = names.map((name) => `« ${name} »`);
  const last = quoted.pop() as string;
  const list = quoted.length === 0 ? last : `${quoted.join(', ')} ni ${last}`;
  return `Personne ne s’appelle ${list} dans l’équipe.`;
}

// Les outils du menu de filtre : l'identifiant s'écrit dans la requête (`outil:claude_code`), le libellé s'affiche.
export function toolOptions(): Array<{ value: SourceKind; label: string }> {
  return SOURCE_KINDS.map((value) => ({ value, label: SOURCE_KIND_LABELS[value] })).sort((a, b) =>
    a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
  );
}

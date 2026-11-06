import { type ItemNature, SOURCE_KINDS, type SourceKind, TOOL_KINDS } from '@/capture/turn';
import { formatNumber } from '@/lib/format';
import { NATURE_LABELS_EN, SOURCE_KIND_LABELS } from '@/lib/labels';
import { PAGE_MAX, PAGE_SIZE } from '@/lib/search-limits';
import type { ContextTurn, SourceHit, SourceInfo } from '@/server/search/types';

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
  commit: 'Modification de code',
  fil_de_travail: 'Fil de travail',
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
  // L'outil, pour son icône ; 'other' pour un outil que ce code ne connaît pas (voir `knownKind`).
  kind: SourceKind | 'other';
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
  // L'outil, pour son icône (l'aperçu ouvert depuis une citation de la discussion n'a pas de résultat sous la main).
  kind: SourceKind | 'other';
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

const KNOWN_KINDS: ReadonlySet<string> = new Set(SOURCE_KINDS);

// `sources.kind` n'a plus de contrainte en base : une ligne écrite par une autre version du code (un outil
// retiré, un retour à une image plus ancienne) peut porter un outil que celle-ci ne connaît pas. La page doit
// l'afficher sous son identifiant, avec l'icône d'un outil quelconque, au lieu de tomber.
function knownKind(kind: string): SourceKind | 'other' {
  return KNOWN_KINDS.has(kind) ? (kind as SourceKind) : 'other';
}

function kindLabelOf(kind: string, locale: string): string {
  return KNOWN_KINDS.has(kind)
    ? SOURCE_KIND_LABELS[kind as SourceKind]
    : kind.trim() || (locale === 'en' ? 'Other tool' : 'Autre outil');
}

function labelsOf(source: Pick<SourceInfo, 'kind' | 'nature' | 'origin'>, locale: string) {
  return {
    kindLabel: kindLabelOf(source.kind, locale),
    natureLabel: locale === 'en' ? NATURE_LABELS_EN[source.nature] : NATURE_LABELS[source.nature],
    originLabel: originLabel(source.origin),
  };
}

export function toResultViews(hits: SourceHit[], locale = 'fr'): ResultView[] {
  return hits.map((hit) => ({
    sourceId: hit.sourceId,
    kind: knownKind(hit.kind),
    ...labelsOf(hit, locale),
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
const ROLE_SPEAKERS_EN: Record<ContextTurn['role'], string> = { ...ROLE_SPEAKERS, user: 'You' };

export function toPreviewView(
  context: { source: SourceInfo; turns: ContextTurn[] },
  locale = 'fr',
): PreviewView {
  const { source } = context;
  return {
    kind: knownKind(source.kind),
    ...labelsOf(source, locale),
    title: source.title,
    url: source.url,
    turns: context.turns.map((turn) => ({
      turnId: turn.turnId,
      speaker:
        turn.authorName?.trim() || (locale === 'en' ? ROLE_SPEAKERS_EN : ROLE_SPEAKERS)[turn.role],
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
export function countLabel(total: number, locale = 'fr'): string {
  if (locale === 'en') {
    const plural = total === 1 ? 'source' : 'sources';
    return total <= PAGE_SIZE
      ? `${total} ${plural}`
      : `About ${formatNumber(total, locale)} ${plural}`;
  }
  const plural = total > 1 ? 'sources' : 'source';
  return total <= PAGE_SIZE ? `${total} ${plural}` : `Environ ${formatNumber(total)} ${plural}`;
}

export function pageCount(total: number): number {
  return Math.min(Math.max(Math.ceil(total / PAGE_SIZE), 1), PAGE_MAX);
}

export function unknownPeopleMessage(names: string[], locale = 'fr'): string | null {
  if (names.length === 0) return null;
  const en = locale === 'en';
  const quoted = names.map((name) => (en ? `“${name}”` : `« ${name} »`));
  const last = quoted.pop() as string;
  const list = quoted.length === 0 ? last : `${quoted.join(', ')} ${en ? 'or' : 'ni'} ${last}`;
  return en
    ? `No one on the team is called ${list}.`
    : `Personne ne s’appelle ${list} dans l’équipe.`;
}

// Les outils du menu de filtre : l'identifiant s'écrit dans la requête (`outil:claude_code`), le libellé s'affiche.
export function toolOptions(): Array<{ value: SourceKind; label: string }> {
  return TOOL_KINDS.map((value) => ({ value, label: SOURCE_KIND_LABELS[value] })).sort((a, b) =>
    a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
  );
}

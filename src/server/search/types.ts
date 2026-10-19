import type { ItemNature, SourceKind, TurnRole } from '@/capture/turn';

// Les types de la recherche (C4 du plan du deuxième jet), partagés par la barre, la réponse en tête, la
// discussion, le point du matin et le MCP. Types seulement : ni base, ni réseau.

export type SearchFilters = {
  tools?: SourceKind[]; // outil:
  natures?: ItemNature[]; // type:
  authorEmails?: string[]; // de: une fois résolu (people.ts)
  authorNames?: { kind: SourceKind; name: string }[]; // de: sur un identifiant d'outil (T19)
  since?: Date; // depuis: (inclus)
  until?: Date; // avant: (exclu)
};

export type ParsedQuery = {
  text: string;
  filters: Omit<SearchFilters, 'authorEmails' | 'authorNames'>;
  people: string[];
};

export type PassageHit = {
  passageId: string;
  turnId: string;
  // Extrait du passage ; les mots trouvés sont entourés de HIGHLIGHT_START et HIGHLIGHT_END (src/lib/highlight.ts).
  snippet: string;
  ts: Date;
  authorName: string | null;
};

export type SourceHit = {
  sourceId: string;
  kind: SourceKind;
  nature: ItemNature;
  title: string | null;
  url: string | null;
  origin: Record<string, string>;
  lastTs: Date;
  passages: PassageHit[];
  score: number;
};

export type SearchPage = {
  hits: SourceHit[];
  // Sources qui répondent, dans la limite des candidats retenus (pas un compte exact de toute la base).
  totalSources: number;
  mode: 'plein-texte' | 'hybride';
  // Personnes nommées (de:) que personne ne porte dans l'équipe.
  unknownPeople: string[];
};

export type ContextTurn = {
  turnId: string;
  role: TurnRole;
  authorName: string | null;
  ts: Date;
  text: string;
  isHit: boolean;
};

export type SourceInfo = Omit<SourceHit, 'passages' | 'score'>;

// Sources par page de résultats, et passages montrés sous chacune (contraintes globales du plan).
export const PAGE_SIZE = 10;
export const PASSAGES_PER_SOURCE = 3;
// Longueur maximale du texte d'une requête, filtres retirés.
export const QUERY_MAX_CHARS = 300;

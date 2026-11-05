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
  // Une clé de projet (PROJECT_KEY_PATTERN, lue par projectKeyFromInput) : les sessions du dépôt, leurs résumés et ses
  // sources GitHub (T25). Paramètre des outils seulement, la barre n'a pas de `depot:`.
  depot?: string;
};

export type ParsedQuery = {
  text: string;
  filters: Omit<SearchFilters, 'authorEmails' | 'authorNames' | 'depot'>;
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

// Sources par page, dernière page et longueur de la requête : définis dans src/lib/search-limits.ts, que la barre
// de la page d'accueil lit aussi (le navigateur n'importe rien de `@/server`).
export { PAGE_MAX, PAGE_SIZE, QUERY_MAX_CHARS } from '@/lib/search-limits';
// Passages montrés sous chaque source (contraintes globales du plan).
export const PASSAGES_PER_SOURCE = 3;

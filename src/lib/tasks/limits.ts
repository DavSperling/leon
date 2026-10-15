// Les bornes des champs d'une tâche. Le client les relaie (maxLength, recherche), zod les impose
// aux actions, et la base les vérifie : src/test/contracts/field-limits.test.ts garde les trois d'accord.
export const TITLE_MAX_CHARS = 200;
export const DESCRIPTION_MAX_CHARS = 100_000;
export const COMMENT_MAX_CHARS = 20_000;
export const LABEL_NAME_MAX_CHARS = 40;
export const VIEW_NAME_MAX_CHARS = 60;
export const PROJECT_NAME_MAX_CHARS = 80;
export const STATUS_LABEL_MAX_CHARS = 40;
// La clé d'un projet : elle préfixe les identifiants (LEO-12).
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
// Le texte de recherche : le filtre `q` d'une liste (URL comprise) et la recherche d'un parent.
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;
// Plafond des listes d'identifiants reçues d'un appelant (sélection groupée, étiquettes, noms) :
// la barre d'actions groupées le relaie, zod et distinctList l'imposent.
export const MAX_IDS = 200;

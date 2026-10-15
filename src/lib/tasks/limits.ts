// Les bornes des champs d'une tâche. Le client les relaie (maxLength, recherche), zod les impose
// aux actions, et la base les vérifie : src/test/contracts/field-limits.test.ts garde les trois d'accord.
export const TITLE_MAX_CHARS = 200;
export const DESCRIPTION_MAX_CHARS = 100_000;
export const LABEL_NAME_MAX_CHARS = 40;
// Le texte de recherche : le filtre `q` d'une liste (URL comprise) et la recherche d'un parent.
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;

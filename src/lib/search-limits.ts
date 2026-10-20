// Les plafonds de la recherche (contraintes globales du plan du deuxième jet), au seul endroit où le serveur et
// la barre de la page d'accueil peuvent tous deux les lire : un composant du navigateur n'importe rien de
// `@/server`, et ce module n'importe rien du tout. Chacun les reprend d'ici (`server/search/types.ts` les
// ré-exporte) ; src/test/contracts/search-limits.test.ts refuse qu'on en recopie la valeur ailleurs.

// Sources par page de résultats.
export const PAGE_SIZE = 10;
// Dernière page que la recherche rend : une page au-delà y est ramenée. La page d'accueil et l'outil MCP
// s'arrêtent au même endroit, pour numéroter, compter et relier les pages comme elle.
export const PAGE_MAX = 50;
// Longueur maximale du texte d'une requête, filtres retirés.
export const QUERY_MAX_CHARS = 300;

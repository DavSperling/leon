// Barre latérale repliée ou non : le serveur lit le cookie (pas de saut au chargement), le navigateur l'écrit.
export const RAIL_COOKIE = 'leon-rail';
const RAIL_OPEN = 'ouvert';
const RAIL_CLOSED = 'ferme';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// Ouverte par défaut : toute valeur autre que « ferme » (absente, ancienne, saisie à la main) l'ouvre.
export const isRailOpen = (value: string | undefined): boolean => value !== RAIL_CLOSED;

export const railCookie = (open: boolean): string =>
  `${RAIL_COOKIE}=${open ? RAIL_OPEN : RAIL_CLOSED}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;

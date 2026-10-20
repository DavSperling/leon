import { oneLine } from '@/server/memory/labels';

export const ACCOUNT_MAX = 120;

// Le compte vient de l'outil : une seule ligne, coupée, avant de devenir l'intitulé de la connexion.
export const accountLabel = (account: string, fallback: string): string =>
  Array.from(oneLine(account)).slice(0, ACCOUNT_MAX).join('') || fallback;

// ClickUp et Airtable : la clé vaut « utilisateur:espace:espace… » (ou ses bases). Une reconnexion garde le même
// compte si l'utilisateur est le même et qu'au moins un espace est en commun (rejoindre un espace, cocher une base de
// plus n'en fait pas un autre compte) ; une clé ancienne, l'utilisateur seul, se compare à l'utilisateur. Les autres
// outils comparent la clé entière.
const KEY_WITH_WORKSPACES = new Set(['clickup', 'airtable']);
export function sameAccountKey(provider: string, stored: string, fresh: string): boolean {
  if (!KEY_WITH_WORKSPACES.has(provider)) return stored === fresh;
  const [storedUser, ...storedSpaces] = stored.split(':');
  const [freshUser, ...freshSpaces] = fresh.split(':');
  if (storedUser !== freshUser) return false;
  return storedSpaces.length === 0 || storedSpaces.some((space) => freshSpaces.includes(space));
}

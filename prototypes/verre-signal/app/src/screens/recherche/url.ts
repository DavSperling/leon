import type { SearchResult } from '@/data';
import { nb } from '@/lib';

/** `/?q=…&page=…` ; une requête vide ramène à l'accueil. Les paramètres de démonstration ne suivent pas. */
export const searchHref = (q: string, page = 1): string =>
  q.trim() ? `/?q=${encodeURIComponent(q.trim())}${page > 1 ? `&page=${page}` : ''}` : '/';

/** Ancre d'un résultat : un renvoi [n] de la réponse y mène. */
export const anchorId = (r: Pick<SearchResult, 'id'>): string => `resultat-${r.id}`;

/** « Personne ne s’appelle « julie » dans l’équipe. » ; plusieurs noms : « « a », « b » ni « c » ». */
export function unknownPeopleMessage(names: string[]): string | null {
  if (names.length === 0) return null;
  const quoted = names.map((n) => `« ${n} »`);
  const last = quoted.pop()!;
  return nb(`Personne ne s’appelle ${quoted.length ? `${quoted.join(', ')} ni ${last}` : last} dans l’équipe.`);
}

console.assert(
  unknownPeopleMessage(['a', 'b', 'c']) === nb('Personne ne s’appelle « a », « b » ni « c » dans l’équipe.') &&
    searchHref(' budget ', 2) === '/?q=budget&page=2' && searchHref('') === '/',
  'recherche/url.ts : adresses ou messages incorrects',
);

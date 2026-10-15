import { z } from 'zod';
import { validViewParams } from './view-config';

// Paramètres de la page de liste qui ne sont pas des réglages d'affichage : ils survivent à un
// changement d'affichage, et la page d'une tâche les garde dans son lien de retour.
export const PAGE_PARAMS = ['vue', 'onglet'] as const;

const PAGE_PARAM_CHECKS: Record<(typeof PAGE_PARAMS)[number], (value: string) => boolean> = {
  vue: (value) => z.uuid().safeParse(value).success,
  onglet: (value) => value === 'activite',
};

// Le paramètre de la page d'une tâche qui dit d'où l'on vient : la requête de la liste.
export const RETURN_PARAM = 'retour';

// Une requête de liste (`groupe=priorite&vue=…`, sans « ? ») réduite à ce que la liste lit : les
// réglages et les paramètres de page valides, jamais un chemin ni une adresse. `retour` vient de
// l'URL, donc de n'importe qui : tout ce qui n'est pas un réglage connu disparaît.
export function cleanListQuery(raw: string | null | undefined): string {
  const params = new URLSearchParams(raw ?? '');
  const clean = validViewParams(params);
  for (const name of PAGE_PARAMS) {
    const value = params.get(name);
    if (value !== null && PAGE_PARAM_CHECKS[name](value)) clean.set(name, value);
  }
  return clean.toString();
}

// L'adresse de la liste d'où l'on vient : toujours sous /taches.
export function backHref(returnQuery: string | null | undefined): string {
  const query = cleanListQuery(returnQuery);
  return query === '' ? '/taches' : `/taches?${query}`;
}

// L'adresse d'une tâche, avec la requête de la liste d'où l'on y va (Échap y ramène). La page de la
// tâche la relit et la nettoie : elle n'est pas de confiance.
export function taskHref(ref: string, listQuery: string): string {
  if (listQuery === '') return `/taches/${ref}`;
  return `/taches/${ref}?${new URLSearchParams({ [RETURN_PARAM]: listQuery })}`;
}

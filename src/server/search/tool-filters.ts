import { ITEM_NATURES, SOURCE_KINDS } from '@/capture/turn';
import { parseQuery } from './parse-query';
import type { SearchFilters } from './types';

// Les filtres qu'un assistant écrit dans les paramètres d'un outil (`outil`, `type`, `depuis`, `de`), lus comme la
// barre les lit (identifiant ou libellé d'outil, nature au singulier ou au pluriel, durées). Partagé par l'outil
// `search` du MCP (T07) et les outils de l'agent de discussion (T11). Pur : ni base, ni réseau.

// Une valeur de filtre sur une seule ligne, sans guillemet ni caractère de contrôle : elle s'écrit entre
// guillemets dans la syntaxe de la barre et ne peut rien d'autre qu'être une valeur.
export function cleanFilterValue(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s\p{Cc}"]+/gu, ' ').trim();
}

// Un filtre que Leon ne comprend pas n'est pas ignoré en silence : l'assistant croirait avoir cherché dans un
// outil, et chercherait partout. Il reçoit un message qui dit quoi écrire.
export function readToolFilters(
  input: { outil?: string | null; type?: string | null; depuis?: string | null },
  now: Date,
): { filters: SearchFilters } | { error: string } {
  const filters: SearchFilters = {};
  const outil = cleanFilterValue(input.outil);
  if (outil !== '') {
    const tools = parseQuery(`outil:"${outil}"`, now).filters.tools;
    if (!tools) {
      return { error: `Outil inconnu : « ${outil} ». Outils connus : ${SOURCE_KINDS.join(', ')}.` };
    }
    filters.tools = tools;
  }
  const type = cleanFilterValue(input.type);
  if (type !== '') {
    const natures = parseQuery(`type:"${type}"`, now).filters.natures;
    if (!natures) {
      return { error: `Type inconnu : « ${type} ». Types connus : ${ITEM_NATURES.join(', ')}.` };
    }
    filters.natures = natures;
  }
  const depuis = cleanFilterValue(input.depuis);
  if (depuis !== '') {
    const since = parseQuery(`depuis:"${depuis}"`, now).filters.since;
    if (!since) {
      return {
        error: `Durée inconnue pour depuis : « ${depuis} ». Écrire 7j, 2s, 3m (jours, semaines, mois) ou AAAA-MM-JJ.`,
      };
    }
    filters.since = since;
  }
  return { filters };
}

// La requête que la recherche lit, avec la personne de `de` en tête : un guillemet non fermé dans la requête ne
// doit pas avaler le filtre qui le suit. La barre rapproche le nom des membres de l'équipe.
export function queryWithPerson(
  query: string | null | undefined,
  de: string | null | undefined,
): string {
  const person = cleanFilterValue(de);
  return `${person === '' ? '' : `de:"${person}" `}${query ?? ''}`;
}

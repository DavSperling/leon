import { ITEM_NATURES, projectKeyFromInput, TOOL_KINDS } from '@/capture/turn';
import { NATURE_LABELS_EN } from '@/lib/labels';
import { parseQuery } from './parse-query';
import type { SearchFilters } from './types';

// Les filtres qu'un assistant écrit dans les paramètres d'un outil (`outil`, `type`, `depuis`, `de`), lus comme la
// barre les lit (identifiant ou libellé d'outil, nature au singulier ou au pluriel, durées), et `depot`, lu comme le
// projet de l'outil `briefing` (projectKeyFromInput). Partagé par l'outil `search` du MCP (T07) et les outils de
// l'agent de discussion (T11). Pur : ni base, ni réseau.

// La requête, décrite à l'assistant (outil `search` du MCP, outil `chercher` de la discussion). Quand la recherche
// trouve peu de sources qui contiennent tous les mots, elle ajoute celles qui n'en contiennent qu'une partie (passe
// élargie, T06b) : un mot de plus n'écarte alors rien. Les guillemets et le signe moins, eux, resserrent toujours.
export const QUERY_SYNTAX_DESCRIPTION =
  'Les mots à chercher, ou une question en phrase. Les sources qui contiennent tous les mots passent devant celles qui n’en contiennent qu’une partie. Pour resserrer : "guillemets droits" pour une expression exacte, -mot pour écarter un mot.';
// La même en anglais, pour l'outil `search` du MCP (la langue de base des assistants des clients).
export const QUERY_SYNTAX_DESCRIPTION_EN =
  'The words to search for, or a question as a sentence. Sources that contain all the words rank above those that contain only some. To narrow down: "straight quotes" for an exact phrase, -word to exclude a word.';

// Les natures que l'outil accepte, nommées en anglais (`meeting`, `email`…) : la recherche les lit comme leur
// identifiant (parse-query.ts).
export const NATURE_NAMES_EN = ITEM_NATURES.map((nature) => NATURE_LABELS_EN[nature].toLowerCase());

// Une valeur de filtre sur une seule ligne, sans guillemet ni caractère de contrôle : elle s'écrit entre
// guillemets dans la syntaxe de la barre et ne peut rien d'autre qu'être une valeur.
export function cleanFilterValue(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s\p{Cc}"]+/gu, ' ').trim();
}

// Un filtre que Leon ne comprend pas n'est pas ignoré en silence : l'assistant croirait avoir cherché dans un
// outil, et chercherait partout. Il reçoit un message qui dit quoi écrire.
export function readToolFilters(
  input: {
    outil?: string | null;
    type?: string | null;
    depuis?: string | null;
    depot?: string | null;
  },
  now: Date,
): { filters: SearchFilters } | { error: string } {
  const filters: SearchFilters = {};
  const outil = cleanFilterValue(input.outil);
  if (outil !== '') {
    const tools = parseQuery(`outil:"${outil}"`, now).filters.tools;
    if (!tools) {
      return { error: `Unknown tool: "${outil}". Known tools: ${TOOL_KINDS.join(', ')}.` };
    }
    filters.tools = tools;
  }
  const type = cleanFilterValue(input.type);
  if (type !== '') {
    const natures = parseQuery(`type:"${type}"`, now).filters.natures;
    if (!natures) {
      return { error: `Unknown type: "${type}". Known types: ${NATURE_NAMES_EN.join(', ')}.` };
    }
    filters.natures = natures;
  }
  const depuis = cleanFilterValue(input.depuis);
  if (depuis !== '') {
    const since = parseQuery(`depuis:"${depuis}"`, now).filters.since;
    if (!since) {
      return {
        error: `Unknown duration for depuis: "${depuis}". Write 7d, 2w, 3mo (days, weeks, months) or YYYY-MM-DD.`,
      };
    }
    filters.since = since;
  }
  const depot = cleanFilterValue(input.depot);
  if (depot !== '') {
    const key = projectKeyFromInput(depot);
    // Sans recopier l'entrée : une adresse de remote peut porter un jeton.
    if (!key) {
      return { error: 'Unknown repository for depot. Write github.com/owner/repo or owner/repo.' };
    }
    filters.depot = key;
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

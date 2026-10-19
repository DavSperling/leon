import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ITEM_NATURES, SOURCE_KINDS, type SourceKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { Embedder } from '@/server/embeddings/embedder';
import { parseQuery } from '@/server/search/parse-query';
import { searchPassages } from '@/server/search/search';
import { PAGE_MAX, PAGE_SIZE, type SearchFilters } from '@/server/search/types';
import { guarded } from './guarded';
import { SearchOutputSchema } from './output-schemas';
import { renderSearch, searchStructured } from './render';

// L'outil `search` : la recherche de la barre de Leon (passages, filtres), sans la réponse de l'agent, puisque
// l'IA du client est elle-même un agent. Les mêmes droits que dans l'interface : la recherche tourne sous ceux
// du porteur du jeton, et rien d'autre ne lit la base ici.

const FILTER_MAX_CHARS = 100;

// Dernière page que la recherche rend (`PAGE_MAX`, une page au-delà y est ramenée) : l'outil refuse au même endroit.
export const SEARCH_PAGE_MAX = PAGE_MAX;

// Les outils cités en exemple dans la description de `outil` : tous des outils de Leon (`SourceKind`).
const EXAMPLE_TOOLS = [
  'github',
  'linear',
  'notion',
  'outlook',
  'claude_code',
  'fathom',
] as const satisfies readonly SourceKind[];

// Les paramètres facultatifs acceptent aussi `null` : des clients l'envoient pour « non renseigné ».
export const SearchInputSchema = z.object({
  query: z
    .string()
    // Pas de longueur maximale : une requête de 2 000 caractères collés donne une page de résultats ou « Aucun
    // résultat », jamais un refus. `parseQuery` ne lit que ses 10 000 premiers caractères et garde 300 de texte.
    .nullish()
    .describe(
      'Les mots à chercher, avec « guillemets » pour une expression exacte. Facultatif quand un filtre est donné : on rend alors les sources les plus récentes.',
    ),
  outil: z
    .string()
    .max(FILTER_MAX_CHARS)
    .nullish()
    .describe(`Limite à un outil : ${EXAMPLE_TOOLS.join(', ')}…`),
  type: z
    .string()
    .max(FILTER_MAX_CHARS)
    .nullish()
    .describe(`Limite à une nature : ${ITEM_NATURES.join(', ')}.`),
  depuis: z
    .string()
    .max(FILTER_MAX_CHARS)
    .nullish()
    .describe('Limite aux passages récents : 7j (jours), 2s (semaines), 3m (mois) ou AAAA-MM-JJ.'),
  de: z
    .string()
    .max(FILTER_MAX_CHARS)
    .nullish()
    .describe(
      "Limite à ce qu'une personne a écrit : son nom, son e-mail ou son identifiant d'outil.",
    ),
  page: z
    .number()
    .int()
    .min(1)
    .max(SEARCH_PAGE_MAX)
    .nullish()
    .describe(`Page de résultats, ${PAGE_SIZE} sources par page (1 par défaut).`),
});

// Les paramètres qui filtrent, tels que MCP_INSTRUCTIONS les nomme : un nom qui n'est pas un paramètre de
// l'outil ne compile pas.
export const SEARCH_FILTERS = ['outil', 'type', 'depuis', 'de'] as const satisfies ReadonlyArray<
  keyof z.input<typeof SearchInputSchema>
>;

export const SEARCH_DESCRIPTION =
  "Cherche dans toute la mémoire brute de l'entreprise (conversations avec des IA, tickets, pages, réunions, mails, fichiers) par mots-clés et par sens. Rend des sources avec leurs meilleurs passages, leur outil, leur titre, leur date et leur lien. Ne rend que ce que l'utilisateur a le droit de voir. Lire un passage ou une source : fetch.";

// Une valeur de filtre sur une seule ligne, sans guillemet ni caractère de contrôle : elle s'écrit entre
// guillemets dans la syntaxe de la barre et ne peut rien d'autre qu'être une valeur.
function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s\p{Cc}"]+/gu, ' ').trim();
}

const refusal = (text: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text }],
});

// Les filtres écrits dans les paramètres, lus comme la barre les lit (identifiant ou libellé d'outil, nature au
// singulier ou au pluriel, durées). Un filtre que Leon ne comprend pas n'est pas ignoré en silence : l'assistant
// croirait avoir cherché dans un outil, et chercherait partout.
function readFilters(
  input: { outil?: string | null; type?: string | null; depuis?: string | null },
  now: Date,
): { filters: SearchFilters } | { error: string } {
  const filters: SearchFilters = {};
  const outil = clean(input.outil);
  if (outil !== '') {
    const tools = parseQuery(`outil:"${outil}"`, now).filters.tools;
    if (!tools) {
      return { error: `Outil inconnu : « ${outil} ». Outils connus : ${SOURCE_KINDS.join(', ')}.` };
    }
    filters.tools = tools;
  }
  const type = clean(input.type);
  if (type !== '') {
    const natures = parseQuery(`type:"${type}"`, now).filters.natures;
    if (!natures) {
      return { error: `Type inconnu : « ${type} ». Types connus : ${ITEM_NATURES.join(', ')}.` };
    }
    filters.natures = natures;
  }
  const depuis = clean(input.depuis);
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

export function registerSearchTool(
  server: McpServer,
  ctx: TenantContext,
  deps: { embedder: Embedder | null },
): void {
  server.registerTool(
    'search',
    {
      title: 'Chercher dans la mémoire',
      description: SEARCH_DESCRIPTION,
      inputSchema: SearchInputSchema,
      outputSchema: SearchOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('search', async ({ query, outil, type, depuis, de, page }) => {
      const now = new Date();
      const read = readFilters({ outil, type, depuis }, now);
      if ('error' in read) return refusal(read.error);
      // `de` passe par la syntaxe de la barre, qui rapproche un nom des membres de l'équipe. Il se met en tête :
      // un guillemet non fermé dans la requête ne doit pas avaler le filtre qui le suit.
      const person = clean(de);
      const text = `${person === '' ? '' : `de:"${person}" `}${query ?? ''}`;
      const pageNumber = page ?? 1;
      const result = await searchPassages(ctx, {
        query: text,
        filters: read.filters,
        page: pageNumber,
        embedder: deps.embedder,
        now,
      });
      return {
        content: [{ type: 'text', text: renderSearch(result, pageNumber) }],
        structuredContent: searchStructured(result, pageNumber),
      };
    }),
  );
}

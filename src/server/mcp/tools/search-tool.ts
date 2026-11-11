import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { CODE_SESSION_KINDS, PROJECT_INPUT_MAX_CHARS, type SourceKind } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { Embedder } from '@/server/embeddings/embedder';
import { type ReadTool, recordReads } from '@/server/memory/read-log';
import { searchPassages } from '@/server/search/search';
import {
  cleanFilterValue,
  NATURE_NAMES_EN,
  QUERY_SYNTAX_DESCRIPTION_EN,
  queryWithPerson,
  readToolFilters,
} from '@/server/search/tool-filters';
import { PAGE_MAX, PAGE_SIZE, type SearchPage } from '@/server/search/types';
import { sessionThreads, threadSources } from '@/server/sessions/thread-read';
import { guarded } from './guarded';
import { SearchOutputSchema } from './output-schemas';
import { renderSearch, searchStructured } from './render';

// L'outil `search` : la recherche de la barre de Leon (passages, filtres), sans la réponse de l'agent, puisque
// l'IA du client est elle-même un agent. Les mêmes droits que dans l'interface : la recherche tourne sous ceux
// du porteur du jeton, et rien d'autre ne lit la base ici. Chaque passage rendu est noté au journal des lectures,
// comme une lecture de `fetch` (une source rendue sans passage : une ligne sans passage). Le filtre `fil` borne aux
// sources d'un fil de l'auteur, et une session trouvée cite son fil et ses PR (T45, D35).

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
      `${QUERY_SYNTAX_DESCRIPTION_EN} Optional when a filter is given: the most recent sources are then returned.`,
    ),
  outil: z
    .string()
    .max(FILTER_MAX_CHARS)
    .nullish()
    .describe(`Limit to one tool: ${EXAMPLE_TOOLS.join(', ')}…`),
  type: z
    .string()
    .max(FILTER_MAX_CHARS)
    .nullish()
    .describe(`Limit to one kind of source: ${NATURE_NAMES_EN.join(', ')}.`),
  depuis: z
    .string()
    .max(FILTER_MAX_CHARS)
    .nullish()
    .describe('Limit to recent passages: 7d (days), 2w (weeks), 3mo (months) or YYYY-MM-DD.'),
  de: z
    .string()
    .max(FILTER_MAX_CHARS)
    .nullish()
    .describe('Limit to what one person wrote: their name, email or username in the tool.'),
  depot: z
    .string()
    .max(PROJECT_INPUT_MAX_CHARS)
    .nullish()
    .describe(
      'Limit to one code repository: its coding sessions, their summaries, and its GitHub pull requests and issues. Write github.com/owner/repo or owner/repo.',
    ),
  fil: z
    .string()
    .max(FILTER_MAX_CHARS)
    .nullish()
    .describe(
      'Limit to one thread of work, by an id returned by threads: its coding sessions and the sources linked to it.',
    ),
  page: z
    .number()
    .int()
    .min(1)
    .max(SEARCH_PAGE_MAX)
    .nullish()
    .describe(`Results page, ${PAGE_SIZE} sources per page (1 by default).`),
});

// Les paramètres qui filtrent, tels que MCP_INSTRUCTIONS les nomme : un nom qui n'est pas un paramètre de
// l'outil ne compile pas.
export const SEARCH_FILTERS = [
  'outil',
  'type',
  'depuis',
  'de',
  'depot',
  'fil',
] as const satisfies ReadonlyArray<keyof z.input<typeof SearchInputSchema>>;

export const SEARCH_DESCRIPTION =
  "Searches the company's whole raw memory (AI conversations, tickets, pages, meetings, emails, files) by keywords and by meaning. Returns sources with their best passages, tool, title, date and link. Only returns what the user is allowed to see. To read a passage or a source: fetch.";

// Note chaque passage rendu au journal (une source rendue sans passage : une ligne sans passage), puis retire de la page
// les sources que Leon n'a pas pu noter, devenues invisibles entre-temps : comme `fetch`, elles ne sont pas rendues.
// Partagé avec la route /chercher (read-routes.ts).
export async function logHits(
  ctx: TenantContext,
  page: SearchPage,
  journal: { tool: ReadTool; client: string; session?: string | null },
): Promise<void> {
  const logged = await recordReads(ctx, {
    ...journal,
    reads: page.hits.flatMap((hit) =>
      hit.passages.length > 0
        ? hit.passages.map((passage) => ({ sourceId: hit.sourceId, passageId: passage.passageId }))
        : [{ sourceId: hit.sourceId }],
    ),
  });
  page.hits = page.hits.filter((hit) => logged.has(hit.sourceId));
}

// Pour chaque session de code de la page, son fil et ses PR, en clés (D35 : la recherche ne trouve pas un fil, elle le
// cite). Partagé avec la route /chercher. Sans session dans la page, aucune requête.
export async function mentionThreads(ctx: TenantContext, page: SearchPage): Promise<void> {
  const kinds: readonly SourceKind[] = CODE_SESSION_KINDS;
  const found = await sessionThreads(
    ctx,
    page.hits.filter((hit) => kinds.includes(hit.kind)).map((hit) => hit.sourceId),
  );
  page.hits = page.hits.map((hit) => ({ ...hit, ...found.get(hit.sourceId) }));
}

const refusal = (text: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text }],
});

export function registerSearchTool(
  server: McpServer,
  ctx: TenantContext,
  client: string,
  deps: { embedder: Embedder | null },
): void {
  server.registerTool(
    'search',
    {
      title: 'Search memory',
      description: SEARCH_DESCRIPTION,
      inputSchema: SearchInputSchema,
      outputSchema: SearchOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('search', async ({ query, outil, type, depuis, de, depot, fil, page }) => {
      const now = new Date();
      const read = readToolFilters({ outil, type, depuis, depot }, now);
      if ('error' in read) return refusal(read.error);
      // Un fil introuvable (d'un collègue, un id mal formé) ne borne à rien : aucun résultat.
      const thread = cleanFilterValue(fil);
      if (thread !== '') read.filters.fil = await threadSources(ctx, thread);
      // `de` passe par la syntaxe de la barre, qui rapproche un nom des membres de l'équipe.
      const text = queryWithPerson(query, de);
      const pageNumber = page ?? 1;
      const result = await searchPassages(ctx, {
        query: text,
        filters: read.filters,
        page: pageNumber,
        embedder: deps.embedder,
        now,
      });
      await logHits(ctx, result, { tool: 'search', client });
      await mentionThreads(ctx, result);
      return {
        content: [{ type: 'text', text: renderSearch(result, pageNumber) }],
        structuredContent: searchStructured(result, pageNumber),
      };
    }),
  );
}

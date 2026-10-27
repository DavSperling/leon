import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { recordRead } from '@/server/memory/read-log';
import { fetchPassageContext, fetchSource, SOURCE_MAX_CHARS } from '@/server/search/context';
import { guarded } from './guarded';
import { FetchOutputSchema } from './output-schemas';
import { fetchStructured, renderFetched } from './render';

// L'outil `fetch` : lire un passage trouvé par `search` avec les tours qui l'entourent, ou une source entière
// (coupée à SOURCE_MAX_CHARS caractères). Chaque lecture est notée dans le journal des lectures, avec l'assistant
// qui lit.

// Tours rendus avant et après le tour d'un passage : passés tels quels à la lecture, pour que la description
// dise ce que fait l'outil quel que soit le défaut de `fetchPassageContext`.
export const NEIGHBOUR_TURNS = 2;
const NEIGHBOUR_WINDOW = { before: NEIGHBOUR_TURNS, after: NEIGHBOUR_TURNS };

// 20000 devient « 20,000 ».
const grouped = (count: number): string => count.toLocaleString('en-US');

// Les paramètres facultatifs acceptent aussi `null` : des clients l'envoient pour « non renseigné ».
export const FetchInputSchema = z.object({
  id: z
    .string()
    .max(64)
    .nullish()
    .describe('A source returned by search (ChatGPT’s name for sourceId): read in full.'),
  passageId: z
    .string()
    .max(64)
    .nullish()
    .describe(
      `A passage returned by search: reads its turn and the ${NEIGHBOUR_TURNS} turns before and after it.`,
    ),
  sourceId: z
    .string()
    .max(64)
    .nullish()
    .describe(
      `A source returned by search: read in full, in order, up to ${grouped(SOURCE_MAX_CHARS)} characters.`,
    ),
});

export const FETCH_DESCRIPTION =
  'Reads the text of a source (id or sourceId) or of a passage (passageId), exactly one of the three, as Leon kept it: the turns in order, with their author and date. With passageId, returns the matching passage and its neighboring turns. Only reads what the user is allowed to see.';

const refusal = (text: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text }],
});

const NOT_FOUND = 'Source or passage not found, or not visible to the user.';

export function registerFetchTool(server: McpServer, ctx: TenantContext, client: string): void {
  server.registerTool(
    'fetch',
    {
      title: 'Read a source or passage',
      description: FETCH_DESCRIPTION,
      inputSchema: FetchInputSchema,
      outputSchema: FetchOutputSchema,
      // `readOnlyHint` reste vrai malgré la ligne écrite au journal des lectures : le journal est la trace d'audit
      // de Leon (ce que les assistants ont lu), pas une donnée de l'utilisateur que l'outil modifierait.
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('fetch', async ({ id, passageId, sourceId }) => {
      const wanted = [id, passageId, sourceId].filter((value) => value != null);
      if (wanted.length !== 1) {
        return refusal('Give id, passageId or sourceId: exactly one of the three.');
      }
      // Un seul des trois est donné. `id` est un autre nom de `sourceId` : le contrat que ChatGPT impose à `fetch`.
      const read =
        passageId != null
          ? await fetchPassageContext(ctx, passageId, NEIGHBOUR_WINDOW)
          : await fetchSource(ctx, (sourceId ?? id) as string);
      if (!read) return refusal(NOT_FOUND);
      const fetched = { truncated: false, ...read };
      // Le journal d'abord : une lecture que Leon ne peut pas noter (la source a perdu ses droits entre-temps)
      // n'est pas rendue.
      const logged = await recordRead(ctx, {
        sourceId: fetched.source.sourceId,
        passageId: passageId ?? null,
        client,
      });
      if (!logged) return refusal(NOT_FOUND);
      return {
        content: [{ type: 'text', text: renderFetched(fetched) }],
        structuredContent: fetchStructured(fetched),
      };
    }),
  );
}

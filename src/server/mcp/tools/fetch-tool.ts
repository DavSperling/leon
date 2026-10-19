import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { recordRead } from '@/server/memory/read-log';
import { fetchPassageContext, fetchSource } from '@/server/search/context';
import { guarded } from './guarded';
import { fetchStructured, renderFetched } from './render';

// L'outil `fetch` : lire un passage trouvé par `search` avec les tours qui l'entourent, ou une source entière
// (coupée à 20 000 caractères). Chaque lecture est notée dans le journal des lectures, avec l'assistant qui lit.

const InputSchema = z.object({
  passageId: z
    .string()
    .max(64)
    .optional()
    .describe('Un passage rendu par search : on lit son tour et les deux tours avant et après.'),
  sourceId: z
    .string()
    .max(64)
    .optional()
    .describe(
      'Une source rendue par search : on la lit en entier, dans l’ordre, jusqu’à 20 000 caractères.',
    ),
});

const refusal = (text: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text }],
});

const NOT_FOUND = 'Source ou passage introuvable, ou non visible.';

export function registerFetchTool(server: McpServer, ctx: TenantContext, client: string): void {
  server.registerTool(
    'fetch',
    {
      title: 'Lire une source ou un passage',
      description:
        "Lit le texte d'une source (passageId ou sourceId, un seul), tel que Leon l'a gardé : les tours dans l'ordre, avec leur auteur et leur date. Avec passageId, rend le passage trouvé et les tours voisins. Ne lit que ce que l'utilisateur a le droit de voir.",
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('fetch', async ({ passageId, sourceId }) => {
      if ((passageId === undefined) === (sourceId === undefined)) {
        return refusal('Donne passageId ou sourceId, un seul des deux.');
      }
      const read =
        passageId === undefined
          ? await fetchSource(ctx, sourceId as string)
          : await fetchPassageContext(ctx, passageId);
      if (!read) return refusal(NOT_FOUND);
      const fetched = { truncated: false, ...read };
      // Le journal d'abord : une lecture que Leon ne peut pas noter (la source a perdu ses droits entre-temps)
      // n'est pas rendue.
      const logged = await recordRead(ctx, {
        sourceId: fetched.source.sourceId,
        passageId: passageId === undefined ? null : passageId,
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

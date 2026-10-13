import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cardUrl } from '@/server/memory/card-url';
import { fetchCard } from '@/server/memory/fetch-card';
import { guarded } from './guarded';

const InputSchema = z.object({
  id: z.uuid(),
  section: z.string().max(40).optional(),
  as_of: z.iso.date().optional(),
});

export function registerFetchTool(server: McpServer, ctx: TenantContext, client: string): void {
  server.registerTool(
    'fetch',
    {
      title: 'Lire une fiche',
      description:
        "Lit une fiche par son id : faits en cours, avec leur source, leur auteur et leur date. `section` restreint à un prédicat ; `as_of` (AAAA-MM-JJ) donne l'état de la fiche à cette date.",
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('fetch', async ({ id, section, as_of }) => {
      const fetched = await fetchCard(ctx, {
        id,
        section,
        asOf: as_of ? new Date(as_of) : undefined,
        client,
      });
      if (!fetched) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Fiche introuvable ou non visible.' }],
        };
      }
      const { card, text } = fetched;
      return {
        content: [{ type: 'text', text }],
        structuredContent: {
          id: card.id,
          title: card.title,
          text,
          url: cardUrl(card.id),
          metadata: { type: card.typeSlug, status: card.status, as_of: as_of ?? null },
        },
      };
    }),
  );
}

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { DATA_GUARD_LINE } from '@/server/memory/render-card';
import { type SearchResult, searchMemory } from '@/server/memory/search';
import { guarded } from './guarded';

const InputSchema = z.object({
  query: z.string().min(1).max(200),
  type: z.string().max(40).optional(),
  since: z.iso.date().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

function resultLine(result: SearchResult, index: number): string {
  return `${index + 1}. ${result.title} (${result.typeLabel}) · id ${result.id} · ${result.snippet}`;
}

function searchText(query: string, results: SearchResult[]): string {
  if (results.length === 0) return `Aucune fiche ne correspond à « ${query} ».`;
  return [
    `${results.length} fiche(s) pour « ${query} » :`,
    DATA_GUARD_LINE,
    ...results.map(resultLine),
  ].join('\n');
}

export function registerSearchTool(server: McpServer, ctx: TenantContext): void {
  server.registerTool(
    'search',
    {
      title: 'Chercher dans la mémoire',
      description:
        "Cherche des fiches (clients, projets, personnes, décisions…) par mot-clé dans la mémoire de l'entreprise. Ne renvoie que les fiches visibles par l'utilisateur.",
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('search', async ({ query, type, since, limit }) => {
      const results = await searchMemory(ctx, {
        query,
        type,
        since: since ? new Date(since) : undefined,
        limit,
      });
      return {
        content: [{ type: 'text', text: searchText(query, results) }],
        structuredContent: {
          results: results.map((result) => ({
            id: result.id,
            title: result.title,
            url: result.url,
            type: result.typeSlug,
            snippet: result.snippet,
            updatedAt: result.updatedAt.toISOString(),
          })),
        },
      };
    }),
  );
}

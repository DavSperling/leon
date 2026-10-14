import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { buildBriefing } from '@/server/memory/briefing';
import { guarded } from './guarded';

export function registerBriefingTool(server: McpServer, ctx: TenantContext): void {
  server.registerTool(
    'briefing',
    {
      title: 'Briefing des 7 derniers jours',
      description:
        "Résume les fiches modifiées ces 7 derniers jours et le nombre d'éléments à vérifier, d'après ce que voit l'utilisateur.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('briefing', async () => {
      const { markdown, reviewCount, entries } = await buildBriefing(ctx);
      return {
        content: [{ type: 'text', text: markdown }],
        structuredContent: {
          text: markdown,
          reviewCount,
          entries: entries.map((entry) => ({
            id: entry.cardId,
            title: entry.title,
            type: entry.typeLabel,
            lastFactAt: entry.lastFactAt.toISOString(),
          })),
        },
      };
    }),
  );
}

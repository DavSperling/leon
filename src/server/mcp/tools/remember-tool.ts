import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestTurns } from '@/server/ingest/ingest-turns';
import { guarded } from './guarded';

const InputSchema = z.object({
  text: z.string().min(1).max(4000),
  about: z.string().max(200).optional(),
});

const TITLE_MAX_CHARS = 80;

export function registerRememberTool(server: McpServer, ctx: TenantContext): void {
  server.registerTool(
    'remember',
    {
      title: 'Save a note',
      description:
        'Saves a piece of information to memory. It stays private to the user, and Leon indexes it so it can be found later. `about` names the subject (client, project, person…).',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('remember', async ({ text, about }) => {
      const result = await ingestTurns(ctx, {
        source: {
          kind: 'mcp_remember',
          external_id: randomUUID(),
          title: about ?? text.slice(0, TITLE_MAX_CHARS),
        },
        turns: [
          {
            external_id: randomUUID(),
            role: 'user',
            text: about ? `About ${about}: ${text}` : text,
            ts: new Date().toISOString(),
            capture_mode: 'manual',
          },
        ],
      });
      if (result.ingestRunId === null) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Nothing to save: the text is empty.' }],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: `Saved: Leon will index this information (source ${result.sourceId}).`,
          },
        ],
        structuredContent: { sourceId: result.sourceId, ingestRunId: result.ingestRunId },
      };
    }),
  );
}

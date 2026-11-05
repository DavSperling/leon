import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { BriefingResponseSchema } from '@/capture/api-contract';
import { projectKeyFromInput } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { briefingResponse, latestBriefingProject } from '@/server/briefing/briefings';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { guarded } from './guarded';

// L'outil `briefing` : le point du matin sur un projet, pour les clients qui n'ont pas le crochet de démarrage de
// Claude Code (ChatGPT, Cursor). Il rend la même chose que la route du crochet (`GET /api/v1/briefing`), sous les
// droits du porteur du jeton : le dernier point prêt, ou le message d'attente (le recalcul est alors mis en file), ou,
// sans modèle sur ce serveur, le message qui dit qu'aucun point n'est préparé. Le point rendu est noté au journal des
// lectures, une ligne par source fournie au modèle.

const PROJECT_INPUT_MAX_CHARS = 300;

const InputSchema = z.object({
  projet: z
    .string()
    .max(PROJECT_INPUT_MAX_CHARS)
    .nullish()
    .describe(
      'The project: its GitHub repository (github.com/owner/repo, or owner/repo). Optional: without it, the last briefing the user read.',
    ),
});

export const BRIEFING_DESCRIPTION =
  'The morning briefing on a project, prepared ahead of time by Leon: what the user did there in their latest Claude Code sessions, what changed since (pull requests, issues, messages that mention them) and what is still open, with sources. Read it when starting work on that project.';

const INVALID_PROJECT =
  'Invalid project: give its GitHub repository (github.com/owner/repo or owner/repo).';

export function registerBriefingTool(server: McpServer, ctx: TenantContext, client: string): void {
  server.registerTool(
    'briefing',
    {
      title: 'Morning briefing',
      description: BRIEFING_DESCRIPTION,
      inputSchema: InputSchema,
      outputSchema: BriefingResponseSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('briefing', async ({ projet }) => {
      let project: string | null;
      if (projet == null || projet.trim() === '') {
        project = await latestBriefingProject(ctx);
      } else {
        project = projectKeyFromInput(projet);
        if (project === null) {
          return { isError: true, content: [{ type: 'text', text: INVALID_PROJECT }] };
        }
      }
      const body = await briefingResponse(ctx, project, {
        modelReady: getLlm(env) !== null,
        client,
      });
      return { content: [{ type: 'text', text: body.markdown }], structuredContent: body };
    }),
  );
}

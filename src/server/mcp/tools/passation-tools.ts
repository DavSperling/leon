import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { NOTE_MAX_CHARS } from '@/capture/passation-format';
import type { TenantContext } from '@/server/auth/tenant-context';
import { removePassation } from '@/server/passation/remove';
import { readBranchState } from '@/server/passation/state';
import { PASSATION_TOOLS, type PassationTool, writePassation } from '@/server/passation/write';
import { projectKeyFromInput } from './briefing-tool';
import { guarded } from './guarded';

// Les outils de passation (spec du 01/11/2026). Le format complet est dans la description : chaque fournisseur
// (Claude Code, Codex, Cursor, ChatGPT) le reçoit avec l'outil.

export const PASSATION_FORMAT = `Format (Markdown):
## Où j'en suis
<one short paragraph: where the work stands>

- [décision] <a decision taken>
- [essai-raté] <something tried that failed, and why>
- [prochaine-étape] <the next concrete step>
- [en-cours] <work started, not finished>
- [question] <an open question>
- concerne [[PR #91]]       (links attach to the item above: PR, ticket, person, file)
- remplace [[D12]]         (marks an earlier item, by its number, as replaced)
Write facts only: no secrets, nothing personal or sensitive. Write in the user's language.`;

const BRANCH = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[\w./-]+$/);
const INVALID_DEPOT =
  'Invalid repository: give its GitHub repository (github.com/owner/repo or owner/repo).';

const WriteSchema = z.object({
  texte: z.string().min(1).max(NOTE_MAX_CHARS),
  depot: z.string().min(1).max(300),
  branche: BRANCH.nullish(),
  outil: z.enum(PASSATION_TOOLS).nullish(),
});
const ReadSchema = z.object({ depot: z.string().min(1).max(300), branche: BRANCH.nullish() });
const RemoveSchema = z.object({ note: z.uuid() });

// L'outil d'après le client MCP (premier mot du User-Agent, client-label.ts).
export function toolFromClient(client: string): PassationTool {
  if (client.includes('claude-code')) return 'claude_code';
  if (client.includes('codex')) return 'codex';
  if (client.includes('cursor')) return 'cursor';
  if (client.includes('openai') || client.includes('chatgpt')) return 'chatgpt';
  if (client.includes('claude')) return 'claude_ai';
  return 'autre';
}

const invalid = (text: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text }],
});

export function registerPassationTools(
  server: McpServer,
  ctx: TenantContext,
  client: string,
): void {
  server.registerTool(
    'passation_ecrire',
    {
      title: 'Write a handoff note',
      description: `Saves a handoff note for a repository and branch, shared with the whole team: what was decided, what failed, what is in progress, the next step. Call it before stopping work or when the user asks. Any teammate's agent (any tool) reads it with passation_lire.\n\n${PASSATION_FORMAT}`,
      inputSchema: WriteSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('passation_ecrire', async ({ texte, depot, branche, outil }) => {
      const project = projectKeyFromInput(depot);
      if (project === null) return invalid(INVALID_DEPOT);
      const result = await writePassation(ctx, {
        texte,
        project,
        branch: branche ?? null,
        tool: outil ?? toolFromClient(client),
      });
      const items =
        result.numeros.length > 0 ? result.numeros.join(', ') : 'none (no line in the format)';
      const replaced =
        result.remplaces.length > 0 ? ` Replaced: ${result.remplaces.join(', ')}.` : '';
      return {
        content: [
          {
            type: 'text',
            text: `Handoff saved for the team (note ${result.sourceId}). Items: ${items}.${replaced}`,
          },
        ],
        structuredContent: result,
      };
    }),
  );

  server.registerTool(
    'passation_lire',
    {
      title: 'Read the handoff state',
      description:
        'Reads the handoff state of a repository (and branch): where the work stands, open next steps, decisions in force, recent failed attempts, written by the team’s agents. Call it when starting work on a repository.',
      inputSchema: ReadSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded('passation_lire', async ({ depot, branche }) => {
      const project = projectKeyFromInput(depot);
      if (project === null) return invalid(INVALID_DEPOT);
      const state = await readBranchState(ctx, project, branche ?? null);
      return {
        content: [
          {
            type: 'text',
            text:
              state ?? `Aucune note de passation pour ${project}${branche ? ` (${branche})` : ''}.`,
          },
        ],
      };
    }),
  );

  server.registerTool(
    'passation_retirer',
    {
      title: 'Remove a handoff note',
      description: 'Removes one of your own handoff notes (its id was given when it was saved).',
      inputSchema: RemoveSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    guarded('passation_retirer', async ({ note }) => {
      const removed = await removePassation(ctx, note);
      return removed
        ? { content: [{ type: 'text', text: 'Handoff note removed.' }] }
        : invalid('Not removed: this note does not exist or is not yours.');
    }),
  );
}

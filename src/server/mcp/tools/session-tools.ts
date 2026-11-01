import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import {
  GITHUB_PROJECT,
  lastSession,
  setRepoSharing,
  setSessionSharing,
} from '@/server/developpeurs/partage';
import { projectKeyFromInput } from './briefing-tool';
import { guarded } from './guarded';

// Rendre privée ou partager de nouveau une session Claude Code (spec du 01/11/2026). Les sessions dans un dépôt
// GitHub sont partagées à l'équipe par défaut ; seul leur auteur change cela.

const SharingSchema = z.object({
  session: z
    .uuid()
    .nullish()
    .describe('Id of one of your Claude Code sessions (a source id from search or fetch).'),
  depot: z
    .string()
    .min(1)
    .max(300)
    .nullish()
    .describe(
      'GitHub repository (github.com/owner/repo or owner/repo): applies to all your sessions there, past and future.',
    ),
});

const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] });
const invalid = (value: string): CallToolResult => ({ ...text(value), isError: true });

async function changeSharing(
  ctx: TenantContext,
  share: boolean,
  { session, depot }: z.infer<typeof SharingSchema>,
): Promise<CallToolResult> {
  const state = share ? 'shared with your team' : 'private';
  if (!session && depot) {
    const project = projectKeyFromInput(depot);
    if (project === null || !GITHUB_PROJECT.test(project)) {
      return invalid(
        'Invalid repository: give a GitHub repository (github.com/owner/repo or owner/repo).',
      );
    }
    const count = await setRepoSharing(ctx, project, share);
    return text(
      `${project}: your sessions there are now ${state}, past ones (${count}) and future ones.`,
    );
  }
  const id = session ?? (await lastSession(ctx, !share));
  if (!id) return invalid(`No session to make ${state}.`);
  const changed = await setSessionSharing(ctx, id, share);
  if (!changed) {
    return invalid(
      'Not changed: this session does not exist, is not yours, or is not linked to a GitHub repository.',
    );
  }
  return text(
    `Session now ${state}: "${changed.title ?? 'untitled'}" (${changed.at.slice(0, 10)}).`,
  );
}

export function registerSessionTools(server: McpServer, ctx: TenantContext): void {
  server.registerTool(
    'session_rendre_privee',
    {
      title: 'Make a session private',
      description:
        'Your Claude Code sessions in a GitHub repository are visible to your team. This makes one private: the given session, or all your sessions in the given repository (past and future), or, with no argument, your latest shared session. Returns what was made private.',
      inputSchema: SharingSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('session_rendre_privee', (args) => changeSharing(ctx, false, args)),
  );

  server.registerTool(
    'session_partager',
    {
      title: 'Share a session again',
      description:
        'Shares again with your team a Claude Code session you made private: the given session, or all your sessions in the given repository (past and future), or, with no argument, your latest private session.',
      inputSchema: SharingSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded('session_partager', (args) => changeSharing(ctx, true, args)),
  );
}

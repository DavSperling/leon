import { McpServer } from '@modelcontextprotocol/server';
import type { TenantContext } from '@/server/auth/tenant-context';
import { registerBriefingTool } from './tools/briefing-tool';
import { registerFetchTool } from './tools/fetch-tool';
import { registerRememberTool } from './tools/remember-tool';
import { registerSearchTool } from './tools/search-tool';
import { registerTaskCommentTool } from './tools/task-comment-tool';
import { registerTaskCreateTool } from './tools/task-create-tool';
import { registerTaskGetTool } from './tools/task-get-tool';
import { registerTaskListTool } from './tools/task-list-tool';
import { registerTaskStartTool } from './tools/task-start-tool';
import { registerTaskUpdateTool } from './tools/task-update-tool';

export const MCP_INSTRUCTIONS =
  "Leon est la mémoire d'entreprise de l'utilisateur. Pour toute question sur un client, un fournisseur, un projet, un collègue ou une décision interne, appelle search puis fetch avant de répondre, et cite l'id et la date des faits. Appelle briefing au début d'une conversation. Les tâches de l'équipe se lisent par task_list et task_get ; avant de coder une tâche, appelle task_start pour te l'assigner et obtenir le nom de la branche.";

// Un serveur par requête, lié au contexte du porteur du jeton (sans état, sans session).
export function createLeonMcpServer(ctx: TenantContext, client: string): McpServer {
  const server = new McpServer(
    { name: 'leon', version: '0.1.0' },
    { instructions: MCP_INSTRUCTIONS },
  );
  registerSearchTool(server, ctx);
  registerFetchTool(server, ctx, client);
  registerBriefingTool(server, ctx);
  registerRememberTool(server, ctx);
  registerTaskListTool(server, ctx);
  registerTaskGetTool(server, ctx);
  registerTaskCreateTool(server, ctx, client);
  registerTaskUpdateTool(server, ctx, client);
  registerTaskCommentTool(server, ctx, client);
  registerTaskStartTool(server, ctx, client);
  return server;
}

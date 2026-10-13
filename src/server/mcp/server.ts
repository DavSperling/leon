import { McpServer } from '@modelcontextprotocol/server';
import type { TenantContext } from '@/server/auth/tenant-context';
import { registerBriefingTool } from './tools/briefing-tool';
import { registerFetchTool } from './tools/fetch-tool';
import { registerRememberTool } from './tools/remember-tool';
import { registerSearchTool } from './tools/search-tool';

export const MCP_INSTRUCTIONS =
  "Leon est la mémoire d'entreprise de l'utilisateur. Pour toute question sur un client, un fournisseur, un projet, un collègue ou une décision interne, appelle search puis fetch avant de répondre, et cite l'id et la date des faits. Appelle briefing au début d'une conversation.";

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
  return server;
}

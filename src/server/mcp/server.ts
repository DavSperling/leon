import { McpServer } from '@modelcontextprotocol/server';
import type { TenantContext } from '@/server/auth/tenant-context';
import { registerRememberTool } from './tools/remember-tool';

// Réécrites en T07, quand `search` et `fetch` reviennent sur les passages.
export const MCP_INSTRUCTIONS =
  "Leon est la mémoire d'entreprise de l'utilisateur. Pour garder une note que l'utilisateur te dicte, appelle remember.";

// Un serveur par requête, lié au contexte du porteur du jeton (sans état, sans session).
export function createLeonMcpServer(ctx: TenantContext, _client: string): McpServer {
  const server = new McpServer(
    { name: 'leon', version: '0.1.0' },
    { instructions: MCP_INSTRUCTIONS },
  );
  registerRememberTool(server, ctx);
  return server;
}

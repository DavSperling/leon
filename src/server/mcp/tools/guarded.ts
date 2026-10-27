import type { CallToolResult } from '@modelcontextprotocol/server';
import { logError } from '@/server/log';

// Le SDK renverrait error.message au client, et ce message peut citer du contenu de la mémoire :
// une erreur inattendue est journalisée (sans message de base) et rendue sous un texte fixe.
export function guarded<Args>(tool: string, run: (args: Args) => Promise<CallToolResult>) {
  return async (args: Args): Promise<CallToolResult> => {
    try {
      return await run(args);
    } catch (error) {
      logError('mcp.tool_failed', error, { tool });
      return { isError: true, content: [{ type: 'text', text: 'Leon internal error.' }] };
    }
  };
}

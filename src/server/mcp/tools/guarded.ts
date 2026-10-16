import type { CallToolResult } from '@modelcontextprotocol/server';
import { logError } from '@/server/log';
import { TaskError } from '@/server/tasks/errors';

// Une saisie que l'agent peut corriger (tâche, statut, étiquette ou membre inconnus) : le message,
// écrit par Leon, dit quoi corriger et part tel quel. Les TaskError suivent la même règle,
// car leur message est fixe.
export class ToolInputError extends Error {
  override name = 'ToolInputError';
}

function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

// Le SDK renverrait error.message au client, et ce message peut citer du contenu de la mémoire :
// une erreur inattendue est journalisée (sans message de base) et rendue sous un texte fixe.
export function guarded<Args>(tool: string, run: (args: Args) => Promise<CallToolResult>) {
  return async (args: Args): Promise<CallToolResult> => {
    try {
      return await run(args);
    } catch (error) {
      if (error instanceof ToolInputError || error instanceof TaskError) {
        return toolError(error.message);
      }
      logError('mcp.tool_failed', error, { tool });
      return toolError('Erreur interne de Leon.');
    }
  };
}

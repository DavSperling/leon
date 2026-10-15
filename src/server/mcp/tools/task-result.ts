import type { CallToolResult } from '@modelcontextprotocol/server';
import { taskUrl } from '@/server/tasks/task-url';

// Réponse d'une écriture : une phrase et le lien de la tâche.
export function writeResult(
  text: string,
  ref: string,
  extra: Record<string, unknown> = {},
): CallToolResult {
  const url = taskUrl(ref);
  return {
    content: [{ type: 'text', text: `${text}\n${url}` }],
    structuredContent: { ref, url, ...extra },
  };
}

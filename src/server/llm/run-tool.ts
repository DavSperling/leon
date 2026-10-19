import { logError } from '../log';
import type { AgentTool } from './llm';

export type ToolResult = { text: string; isError: boolean };

// Exécute l'appel d'outil d'un modèle, vrai ou faux : l'entrée est validée par le schéma de l'outil, et rien ne
// lève. Un outil inconnu, une entrée invalide ou un outil en échec sont rendus au modèle comme résultat d'erreur,
// pour qu'il corrige ou réponde avec ce qu'il a. Les messages ne citent ni la valeur reçue ni l'erreur de l'outil.
export async function executeAgentTool(
  tools: AgentTool[],
  name: string,
  input: unknown,
): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    return { text: `Outil inconnu : « ${name} ». Utilise un des outils fournis.`, isError: true };
  }
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'entrée')),
    ];
    return {
      text: `Entrée invalide pour l'outil « ${name} » (${fields.join(', ')}). Corrige-la et réessaie.`,
      isError: true,
    };
  }
  try {
    return { text: await tool.run(parsed.data), isError: false };
  } catch (error) {
    logError('llm.outil', error, { outil: name });
    return {
      text: `L'outil « ${name} » a échoué. Réessaie autrement, ou réponds avec ce que tu sais déjà.`,
      isError: true,
    };
  }
}

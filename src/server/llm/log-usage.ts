import type { LlmUsage } from './llm';

// Journalise les compteurs de tokens et le coût d'un appel, jamais son contenu. Partagé par les clients
// Anthropic et OpenRouter : une seule forme de ligne « llm.usage » à relire dans les logs.
export function logLlmUsage(line: LlmUsage): void {
  const costUsd = line.costUsd === null ? null : Number(line.costUsd.toFixed(5));
  console.info('[leon]', 'llm.usage', JSON.stringify({ ...line, costUsd }));
}

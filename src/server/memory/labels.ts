import type { SourceKind } from '@/capture/turn';
import { PROVIDER_LABELS } from '@/lib/providers';

// Libellés d'affichage. Module pur : n'importe ni env ni la base.

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  claude_code: 'Claude Code',
  claude_ai: 'claude.ai',
  chatgpt: 'ChatGPT',
  mcp_remember: 'Note MCP',
  ...PROVIDER_LABELS,
};

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Texte venu des conversations (titre, nom, libellé) mis sur une seule ligne avant rendu :
// un retour à la ligne ne doit pas fabriquer une fausse ligne (fausse source, consigne).
export function oneLine(text: string): string {
  return text.replace(/[\s\p{Cc}]+/gu, ' ').trim();
}

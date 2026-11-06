import type { ItemNature, SourceKind } from '@/capture/turn';
import { PROVIDER_LABELS } from '@/lib/providers';

// Libellés d'affichage. Module pur : n'importe ni env ni la base.

// Des noms qui se lisent pareil en français et en anglais : le serveur les calcule sans connaître la langue du lecteur.
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  claude_code: 'Claude Code',
  claude_ai: 'claude.ai',
  chatgpt: 'ChatGPT',
  mcp_remember: 'Note (MCP)',
  document: 'Document',
  ...PROVIDER_LABELS,
  leon_fil: 'Leon',
};

// L'interface en anglais : les types de source, que la recherche lit aussi dans la barre (`type:meeting`).
export const NATURE_LABELS_EN: Record<ItemNature, string> = {
  conversation: 'AI conversation',
  reunion: 'Meeting',
  page: 'Page',
  ticket: 'Ticket',
  fil: 'Thread',
  note: 'Note',
  mail: 'Email',
  fichier: 'File',
  evenement: 'Event',
  commit: 'Code change',
  fil_de_travail: 'Work thread',
};

// Les filtres anglais de la barre, lus comme leur équivalent français : `from:` vaut `de:`. Ici pour que la
// recherche (parse-query.ts) et la barre (url-state.ts), qui n'importe rien du serveur, partagent la même liste.
export const FILTER_ALIASES = {
  from: 'de',
  tool: 'outil',
  since: 'depuis',
  before: 'avant',
} as const;

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Texte venu des conversations (titre, nom, libellé) mis sur une seule ligne avant rendu :
// un retour à la ligne ne doit pas fabriquer une fausse ligne (fausse source, consigne).
export function oneLine(text: string): string {
  return text.replace(/[\s\p{Cc}]+/gu, ' ').trim();
}

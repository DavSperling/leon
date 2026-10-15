import { type AuthorSide, CAPTURE_KINDS, type SourceKind } from '@/capture/turn';
import type { SensitiveCategory } from '@/lib/enums';
import { PROVIDER_LABELS } from '@/lib/providers';

// Libellés d'affichage. Module pur : n'importe ni env ni la base.

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  claude_code: 'Claude Code',
  claude_ai: 'claude.ai',
  chatgpt: 'ChatGPT',
  mcp_remember: 'Note MCP',
  ...PROVIDER_LABELS,
};

// Auteur affiché d'un fait. Une conversation est celle de la personne qui l'a tenue ; pour un outil,
// la connexion appartient à celui qui l'a branchée, mais le fait vient de l'auteur du tour cité. Ce nom
// est celui que l'auteur s'est donné : quand l'outil dit qu'il est extérieur à l'équipe, on l'écrit.
export function factAuthorName(input: {
  sourceKind: SourceKind;
  userName: string;
  turnAuthorName: string | null;
  turnAuthorSide?: AuthorSide | null;
}): string {
  if ((CAPTURE_KINDS as readonly SourceKind[]).includes(input.sourceKind)) return input.userName;
  const name = input.turnAuthorName ?? 'auteur inconnu';
  return input.turnAuthorSide === 'external' ? `${name} (externe)` : name;
}

export const SENSITIVE_CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  rh: 'RH',
  remuneration: 'Rémunération',
  juridique: 'Juridique',
  sante: 'Santé',
  perso: 'Vie personnelle',
};

const CLIENT_LABELS = new Map([
  ['interface', 'Interface'],
  ['claude-code', 'Claude Code'],
]);

// Client du journal de lecture (D9) ; un client inconnu garde son nom.
export function clientLabel(client: string): string {
  return CLIENT_LABELS.get(client) ?? client;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Texte venu des conversations (énoncé, titre, nom, libellé) mis sur une seule ligne avant rendu :
// un retour à la ligne ne doit pas fabriquer une fausse ligne (faux fait, fausse source, consigne).
export function oneLine(text: string): string {
  return text.replace(/[\s\p{Cc}]+/gu, ' ').trim();
}

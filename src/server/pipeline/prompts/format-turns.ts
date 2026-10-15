import type { TurnRole } from '@/capture/turn';
import type { RunTurn } from '../runs';

const ROLE_LABELS: Record<TurnRole, string> = {
  user: 'utilisateur',
  assistant: 'assistant',
  document: 'document',
  participant: 'participant',
};
const TRUNCATION_MARK = '[…]';

// Titre et id viennent du client : toute valeur d'attribut est échappée.
function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Un texte ne peut pas refermer la balise qui le contient.
function neutralizeClosingTags(text: string): string {
  return text.replace(/<\/(tour|conversation)\s*>/gi, '<\\/$1>');
}

function formatTurn(turn: RunTurn, maxCharsPerTurn: number | undefined): string {
  const text =
    maxCharsPerTurn !== undefined && turn.text.length > maxCharsPerTurn
      ? `${turn.text.slice(0, maxCharsPerTurn)}${TRUNCATION_MARK}`
      : turn.text;
  const attributes = [
    `id="${escapeAttribute(turn.externalId)}"`,
    `role="${ROLE_LABELS[turn.role]}"`,
    `date="${turn.ts.toISOString()}"`,
  ].join(' ');
  return `<tour ${attributes}>\n${neutralizeClosingTags(text)}\n</tour>`;
}

export function formatTurnsForPrompt(input: {
  sourceKindLabel: string;
  title: string | null;
  turns: RunTurn[];
  maxCharsPerTurn?: number;
}): string {
  const source = escapeAttribute(input.sourceKindLabel);
  const title = escapeAttribute(input.title ?? '');
  return [
    `<conversation source="${source}" titre="${title}">`,
    ...input.turns.map((turn) => formatTurn(turn, input.maxCharsPerTurn)),
    '</conversation>',
  ].join('\n');
}

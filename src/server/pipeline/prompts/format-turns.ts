import type { TurnRole } from '@/capture/turn';
import { oneLine } from '@/server/memory/labels';
import type { ItemNature, RunTurn } from '../runs';

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

// Un texte ne peut pas refermer la balise qui le contient. `conversation` est l'ancien nom de <source> :
// un texte capté avant le changement de format peut encore le porter.
function neutralizeClosingTags(text: string): string {
  return text.replace(/<\/(tour|source|conversation|contexte-source)\s*>/gi, '<\\/$1>');
}

function formatTurn(turn: RunTurn, maxCharsPerTurn: number | undefined): string {
  const text =
    maxCharsPerTurn !== undefined && turn.text.length > maxCharsPerTurn
      ? `${turn.text.slice(0, maxCharsPerTurn)}${TRUNCATION_MARK}`
      : turn.text;
  const author = turn.authorName === null ? '' : oneLine(turn.authorName);
  const attributes = [
    `id="${escapeAttribute(turn.externalId)}"`,
    `role="${ROLE_LABELS[turn.role]}"`,
    ...(author === '' ? [] : [`auteur="${escapeAttribute(author)}"`]),
    `date="${turn.ts.toISOString()}"`,
  ].join(' ');
  return `<tour ${attributes}>\n${neutralizeClosingTags(text)}\n</tour>`;
}

const CONTEXT_SENTENCE = 'Le contexte n’est pas citable : chaque fait cite un tour de <source>.';

// Le contexte rappelle l'état déjà connu d'un élément dont le run ne porte que des tours nouveaux.
function formatContext(context: string | null | undefined): string[] {
  if (context === null || context === undefined || context === '') return [];
  return [
    CONTEXT_SENTENCE,
    `<contexte-source>\n${neutralizeClosingTags(context)}\n</contexte-source>`,
  ];
}

export function formatTurnsForPrompt(input: {
  sourceKindLabel: string;
  nature: ItemNature;
  title: string | null;
  turns: RunTurn[];
  context?: string | null;
  maxCharsPerTurn?: number;
}): string {
  const tool = escapeAttribute(oneLine(input.sourceKindLabel));
  const title = escapeAttribute(oneLine(input.title ?? ''));
  return [
    ...formatContext(input.context),
    `<source outil="${tool}" nature="${input.nature}" titre="${title}">`,
    ...input.turns.map((turn) => formatTurn(turn, input.maxCharsPerTurn)),
    '</source>',
  ].join('\n');
}

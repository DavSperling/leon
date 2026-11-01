import { maskSecrets } from './mask-secrets';

// La session condensée que lit le résumé de secours (`claude -p`) : les textes des échanges, plus une ligne par
// commande lancée et par fichier écrit, ce que la capture habituelle ne garde pas (claude-code.ts). Les lignes
// écartées à la capture (sous-agents, méta, résumés de compaction, erreurs d'API) le sont ici aussi. Trop long : on
// garde la fin, là où le travail s'est arrêté.

export const CONDENSED_MAX_CHARS = 60_000;
const TEXT_MAX = 1500;
const COMMAND_MAX = 200;
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

type Block = { type?: unknown; text?: unknown; name?: unknown; input?: unknown };
export type CondensedSession = { text: string; exchanges: number; startedAt: Date | null };

// Masqué avant d'être coupé : un secret coupé en deux ne se reconnaîtrait plus à sa forme.
function textLine(label: string, text: string): string[] {
  const clean = maskSecrets(text).trim();
  return clean ? [`${label} : ${clean.slice(0, TEXT_MAX)}`] : [];
}

function blockLines(role: 'user' | 'assistant', content: unknown): string[] {
  const label = role === 'user' ? 'Utilisateur' : 'Assistant';
  if (typeof content === 'string') return textLine(label, content);
  if (!Array.isArray(content)) return [];
  return content.flatMap((raw: Block) => {
    if (typeof raw !== 'object' || raw === null) return [];
    if (raw.type === 'text' && typeof raw.text === 'string') return textLine(label, raw.text);
    if (raw.type !== 'tool_use' || typeof raw.input !== 'object' || raw.input === null) return [];
    const input = raw.input as Record<string, unknown>;
    if (raw.name === 'Bash' && typeof input.command === 'string') {
      return [`$ ${maskSecrets((input.command.split('\n')[0] ?? '').slice(0, COMMAND_MAX))}`];
    }
    if (
      typeof raw.name === 'string' &&
      WRITE_TOOLS.has(raw.name) &&
      typeof input.file_path === 'string'
    ) {
      return [`✎ ${input.file_path}`];
    }
    return [];
  });
}

export function condenseSession(jsonl: string, maxChars = CONDENSED_MAX_CHARS): CondensedSession {
  const lines: string[] = [];
  let exchanges = 0;
  let startedAt: Date | null = null;
  for (const raw of jsonl.split('\n')) {
    let entry: unknown;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (typeof entry !== 'object' || entry === null) continue;
    const line = entry as Record<string, unknown>;
    const role = line.type;
    if (role !== 'user' && role !== 'assistant') continue;
    if (line.isSidechain === true || line.isMeta === true) continue;
    if (line.isCompactSummary === true || line.isApiErrorMessage === true) continue;
    if (startedAt === null && typeof line.timestamp === 'string') {
      const date = new Date(line.timestamp);
      if (!Number.isNaN(date.getTime())) startedAt = date;
    }
    const message = line.message as { content?: unknown } | undefined;
    const produced = blockLines(role, message?.content);
    // Un échange = un message tapé par l'utilisateur (les résultats d'outils n'ont pas de texte).
    if (role === 'user' && produced.length > 0) exchanges += 1;
    lines.push(...produced);
  }
  const text = lines.join('\n');
  return {
    text: text.length <= maxChars ? text : text.slice(text.length - maxChars),
    exchanges,
    startedAt,
  };
}

import { z } from 'zod';
import { maskSecrets } from './mask-secrets';
import { prepareTurnText } from './prepare-turn-text';
import type { Turn } from './turn';

export type ClaudeCodeSession = {
  sessionId: string;
  cwd: string | null;
  title: string | null;
  turns: Turn[];
};

const TITLE_MAX = 300;
const TITLE_FROM_TEXT_MAX = 80;

// Schéma minimal d'une ligne du fichier de session : les champs inconnus sont ignorés,
// une ligne qui ne le respecte pas est écartée.
const LineSchema = z.object({
  type: z.string(),
  uuid: z.string().min(1).max(200).optional(),
  sessionId: z.string().min(1).max(200).optional(),
  timestamp: z.iso.datetime({ offset: true }).optional(),
  cwd: z.string().optional(),
  isSidechain: z.boolean().optional(),
  isMeta: z.boolean().optional(),
  isCompactSummary: z.boolean().optional(),
  isApiErrorMessage: z.boolean().optional(),
  aiTitle: z.string().optional(),
  customTitle: z.string().optional(),
  message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) }).optional(),
});
type Line = z.infer<typeof LineSchema>;

const TextBlockSchema = z.object({ type: z.literal('text'), text: z.string() });

function parseLine(raw: string): Line | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = LineSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

// Seuls les blocs `text` comptent : ni pensée, ni appel d'outil, ni résultat d'outil, ni image.
function messageText(content: string | unknown[]): string {
  if (typeof content === 'string') return content;
  const texts = content.flatMap((block) => {
    const parsed = TextBlockSchema.safeParse(block);
    return parsed.success ? [parsed.data.text] : [];
  });
  return texts.join('\n\n');
}

type ConversationLine = Line & {
  type: 'user' | 'assistant';
  uuid: string;
  sessionId: string;
  timestamp: string;
  message: NonNullable<Line['message']>;
};

function isConversationLine(line: Line): line is ConversationLine {
  return (
    (line.type === 'user' || line.type === 'assistant') &&
    line.uuid !== undefined &&
    line.sessionId !== undefined &&
    line.timestamp !== undefined &&
    line.message !== undefined &&
    !line.isSidechain &&
    !line.isMeta &&
    !line.isCompactSummary &&
    !line.isApiErrorMessage
  );
}

function toTurn(line: ConversationLine): Turn | null {
  const text = prepareTurnText(messageText(line.message.content));
  if (text === null) return null;
  return {
    external_id: line.uuid,
    role: line.type,
    text,
    ts: line.timestamp,
    capture_mode: 'file',
  };
}

// Titre : customTitle, sinon aiTitle, sinon le début du premier texte utilisateur.
function sessionTitle(
  customTitle: string | undefined,
  aiTitle: string | undefined,
  turns: Turn[],
): string | null {
  const given = [customTitle, aiTitle]
    .map((title) => maskSecrets(title ?? '').trim())
    .find((title) => title !== '');
  if (given) return given.slice(0, TITLE_MAX);
  const firstUserText = turns.find((turn) => turn.role === 'user')?.text;
  return firstUserText ? firstUserText.slice(0, TITLE_FROM_TEXT_MAX) : null;
}

export function parseClaudeCodeSession(content: string): ClaudeCodeSession | null {
  const turns: Turn[] = [];
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let aiTitle: string | undefined;
  let customTitle: string | undefined;

  for (const raw of content.split('\n')) {
    const line = parseLine(raw);
    if (!line) continue;
    if (line.type === 'ai-title') aiTitle = line.aiTitle ?? aiTitle;
    if (line.type === 'custom-title') customTitle = line.customTitle ?? customTitle;
    if (!isConversationLine(line)) continue;
    const turn = toTurn(line);
    if (!turn) continue;
    turns.push(turn);
    sessionId ??= line.sessionId;
    cwd ??= line.cwd ?? null;
  }

  if (sessionId === null) return null;
  return { sessionId, cwd, title: sessionTitle(customTitle, aiTitle, turns), turns };
}

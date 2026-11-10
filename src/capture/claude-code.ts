import { z } from 'zod';
import { maskSecrets } from './mask-secrets';
import { prepareTurnText, removeBlocks } from './prepare-turn-text';
import { stripLeonBlocks } from './strip-leon-blocks';
import { isTypedTurn, type Turn } from './turn';

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

// Ce que Claude Code range en `user` sans que la personne l'ait tapé : la notification d'une tâche de fond, la sortie
// d'une commande locale (`/…`, `!…`), le message d'un autre agent de l'équipe, une interruption. Le rapport d'un
// sous-agent au premier plan est un résultat d'outil, que messageText écarte. Le tour part marqué `injecte` (T43) : il ne
// compte pas comme un échange (C1), le seuil du résumé (« 6 de vos messages », resume-worker.ts) compris, et ne prouve
// jamais une `[décision]`.
// shortcut: les formes connues de Claude Code au 10/11, vérifiées sur une fixture inventée, jamais sur une vraie
// conversation. La sortie d'un crochet, le texte d'orchestration (le prompt d'un `claude -p` lancé par un script) et le
// message d'une autre session (T43, amendé le 04/11) ne sont pas relevés : ils partent marqués tapés, donc preuve d'une
// `[décision]`, dans le résumé comme dans l'état des fils. À relever sur une session de test créée pour l'occasion.
const INJECTED_TAGS = [
  'task-notification',
  'local-command-stdout',
  'local-command-stderr',
  'local-command-caveat',
  'bash-stdout',
  'bash-stderr',
  'teammate-message',
];
const INTERRUPTED = /^\[Request interrupted by user[^\]]*\]$/;

// Un bloc complet de la balise, attributs compris (`<teammate-message teammate_id="…">`) : une ouverture avant la
// dernière fermeture.
function hasBlock(text: string, tag: string): boolean {
  const close = text.lastIndexOf(`</${tag}>`);
  for (
    let at = text.indexOf(`<${tag}`);
    at !== -1 && at < close;
    at = text.indexOf(`<${tag}`, at + 1)
  ) {
    if (/[\s>]/.test(text.charAt(at + tag.length + 1))) return true;
  }
  return false;
}

// Comme Codex (userTextKind, codex.ts) : un seul bloc injecté suffit, même suivi de quelques mots, sinon son texte
// partirait comme preuve. Lue sur le texte d'avant prepareTurnText : sa coupe à TURN_TEXT_MAX perdrait la balise
// fermante d'une longue sortie `!` ou d'un long rapport de tâche. Les rappels système y sont retirés de même.
function injected(raw: string): boolean {
  const text = removeBlocks(raw, 'system-reminder');
  return INJECTED_TAGS.some((tag) => hasBlock(text, tag)) || INTERRUPTED.test(text.trim());
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

// Les blocs de Leon sont retirés avant la préparation : un tour qui n'a rien d'autre est écarté.
function toTurn(line: ConversationLine): Turn | null {
  const raw = stripLeonBlocks(messageText(line.message.content));
  const text = prepareTurnText(raw);
  if (text === null) return null;
  return {
    external_id: line.uuid,
    role: line.type,
    text,
    ts: line.timestamp,
    capture_mode: 'file',
    ...(line.type === 'user' ? { injecte: injected(raw) } : {}),
  };
}

// Titre : customTitle, sinon aiTitle, sinon le début du premier message tapé par la personne.
function sessionTitle(
  customTitle: string | undefined,
  aiTitle: string | undefined,
  turns: Turn[],
): string | null {
  const given = [customTitle, aiTitle]
    .map((title) => maskSecrets(title ?? '').trim())
    .find((title) => title !== '');
  if (given) return given.slice(0, TITLE_MAX);
  const firstUserText = turns.find(isTypedTurn)?.text;
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

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
  // Qui a mis ce tour `user` (Claude Code récent) : `human` pour la personne ; `sdk`, `peer`, `task_notification`,
  // `scheduled`, `auto_continuation`, `host_synthetic`, `system`, `unknown` sinon.
  turnOrigin: z.string().optional(),
  // Un tour relayé d'un fil Slack ou Teams, ou d'un e-mail : Claude Code le dit `human`, mais c'est un tiers.
  verifiedSlackHumanTurn: z.boolean().optional(),
  aiTitle: z.string().optional(),
  customTitle: z.string().optional(),
  message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) }).optional(),
  // Lus pour le rapport d'un sous-agent (reportTurn, queuedNotificationTurn).
  toolUseResult: z.unknown().optional(),
  attachment: z.unknown().optional(),
});
type Line = z.infer<typeof LineSchema>;

const TextBlockSchema = z.object({ type: z.literal('text'), text: z.string() });

// Le rapport d'un sous-agent (décision 7 d'Amos du 12/11), dans la forme de l'annexe 08 (Claude Code 2.1.322). Les noms
// de l'outil des sous-agents servent aussi au tri de T63 (session-facts.ts).
export const SUBAGENT_TOOLS: ReadonlySet<string> = new Set(['Agent', 'Task']);
const ToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
});
const ToolResultBlockSchema = z.object({ type: z.literal('tool_result'), tool_use_id: z.string() });
// `content` : les `harnessNoteCount` notes du harnais, puis le rapport (annexe 08). Sans ce compte, entier positif ou
// nul, la ligne n'a pas la forme connue : rien n'est capté. `harnessTailCount` n'est pas lu : la fin du harnais
// (l'agentId, <usage>) n'est vue que dans le bloc tool_result, pas dans `content`.
const ReportSchema = z.object({
  status: z.literal('completed'),
  content: z.array(TextBlockSchema),
  harnessNoteCount: z.number().int().nonnegative(),
});
const QueuedNotificationSchema = z.object({
  type: z.literal('queued_command'),
  commandMode: z.literal('task-notification'),
  prompt: z.string(),
});

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

// Ce que Claude Code range en `user` sans que la personne l'ait tapé. Le tour part marqué `injecte` (T43) : il ne compte
// pas comme un échange (C1), le seuil du résumé (« 6 de vos messages », resume-worker.ts) compris, et ne prouve jamais
// une `[décision]`. Relevé le 10/11 sur une session de test (Claude Code 2.1.319) et sur le seul décompte des étiquettes
// des sessions du poste, sans leur texte :
// - `turnOrigin` dit qui a mis le tour : seul `human` est la personne. Le prompt d'un script (`claude -p`, le SDK) porte
//   `sdk`, comme ce que l'app de bureau injecte (évènements, rappels) ; le message d'une autre session, `peer`. Une
//   valeur inconnue compte comme injectée. Un tour relayé d'un fil Slack, de Teams ou d'un e-mail est aussi `human`, mais
//   porte `verifiedSlackHumanTurn` (lu dans le programme, Claude Code 2.1.319) : il n'est pas de la personne.
// - la réponse d'un crochet `Stop` est en `isMeta`, et le résumé d'une compaction en `isCompactSummary` : ces lignes sont
//   écartées (isConversationLine). Les autres sorties de crochet sont des lignes `attachment`, jamais lues.
// - les balises ci-dessous (la notification d'une tâche de fond, la sortie d'une commande locale `/…` ou `!…`, le
//   message d'un autre agent de l'équipe) et une interruption, seule signature d'un Claude Code d'avant `turnOrigin`.
// - le rapport d'un sous-agent (décision 7 d'Amos du 12/11 ; forme relevée par l'annexe 08, Claude Code 2.1.322) : au
//   premier plan, c'est le résultat de son appel `Agent` ou `Task`, que messageText écarte ; reportTurn n'en garde que
//   le rapport lu dans `toolUseResult`. En tâche de fond, c'est la notification ci-dessous, en ligne `user` ou, si
//   l'agent travaillait, en ligne `attachment` (queuedNotificationTurn).
// shortcut: avant `turnOrigin` (Claude Code 2.1.284 environ), le prompt d'un script et le message d'une autre session
// n'ont pas de signature : ils partent marqués tapés. Les sessions de ces versions ne se rejouent que par `leon
// import-claude-code`.
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
function injected(line: ConversationLine, raw: string): boolean {
  if (line.verifiedSlackHumanTurn === true) return true;
  if (line.turnOrigin !== undefined && line.turnOrigin !== 'human') return true;
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

// Ni sous-agent, ni réponse de crochet, ni compaction, ni erreur de l'API.
const isAside = (line: Line): boolean =>
  line.isSidechain === true ||
  line.isMeta === true ||
  line.isCompactSummary === true ||
  line.isApiErrorMessage === true;

function isConversationLine(line: Line): line is ConversationLine {
  return (
    (line.type === 'user' || line.type === 'assistant') &&
    line.uuid !== undefined &&
    line.sessionId !== undefined &&
    line.timestamp !== undefined &&
    line.message !== undefined &&
    !isAside(line)
  );
}

// Un tour que Claude Code a écrit à la place de la personne, préparé comme les autres.
function injectedTurn(uuid: string, ts: string, raw: string): Turn | null {
  const text = prepareTurnText(stripLeonBlocks(raw));
  if (text === null) return null;
  return { external_id: uuid, role: 'user', text, ts, capture_mode: 'file', injecte: true };
}

// Les `id` des appels `Agent` ou `Task` : un même bloc peut revenir sur deux lignes, l'ensemble dédoublonne.
function collectSubagentCalls(line: ConversationLine, calls: Set<string>): void {
  if (line.type !== 'assistant' || !Array.isArray(line.message.content)) return;
  for (const block of line.message.content) {
    const call = ToolUseBlockSchema.safeParse(block);
    if (call.success && SUBAGENT_TOOLS.has(call.data.name)) calls.add(call.data.id);
  }
}

// Le rapport d'un appel `Agent` ou `Task` vu plus haut, s'il est fini : les blocs de `toolUseResult.content`, sans les
// notes du harnais au début. Plus de notes que de blocs : rien ne reste, rien n'est capté. Jamais le texte brut du
// tool_result, qui mêle le rapport au harnais.
function reportTurn(line: ConversationLine, calls: ReadonlySet<string>): Turn | null {
  if (line.type !== 'user' || !Array.isArray(line.message.content)) return null;
  const answersCall = line.message.content.some((block) => {
    const result = ToolResultBlockSchema.safeParse(block);
    return result.success && calls.has(result.data.tool_use_id);
  });
  const report = ReportSchema.safeParse(line.toolUseResult);
  if (!answersCall || !report.success) return null;
  const { content, harnessNoteCount } = report.data;
  const kept = content.slice(harnessNoteCount).map((block) => block.text);
  return injectedTurn(line.uuid, line.timestamp, kept.join('\n\n'));
}

// La notification d'une tâche de fond arrivée pendant que l'agent travaillait : une ligne `attachment`, la seule lue.
// L'annexe 08 ne garantit `uuid` que sur les lignes de conversation : sans lui, l'identifiant vient de l'horodatage.
// shortcut: deux notifications sans uuid à la même milliseconde n'en font qu'une ; à revoir si le script témoin relève
// des lignes queued_command sans uuid.
function queuedNotificationTurn(line: Line): Turn | null {
  const queued = QueuedNotificationSchema.safeParse(line.attachment);
  if (
    line.type !== 'attachment' ||
    !queued.success ||
    line.sessionId === undefined ||
    line.timestamp === undefined ||
    isAside(line)
  )
    return null;
  const id = line.uuid ?? `attachment@${line.timestamp}`;
  return injectedTurn(id, line.timestamp, queued.data.prompt);
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
    ...(line.type === 'user' ? { injecte: injected(line, raw) } : {}),
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
  const subagentCalls = new Set<string>();

  for (const raw of content.split('\n')) {
    const line = parseLine(raw);
    if (!line) continue;
    if (line.type === 'ai-title') aiTitle = line.aiTitle ?? aiTitle;
    if (line.type === 'custom-title') customTitle = line.customTitle ?? customTitle;
    let turn: Turn | null;
    if (isConversationLine(line)) {
      collectSubagentCalls(line, subagentCalls);
      turn = reportTurn(line, subagentCalls) ?? toTurn(line);
    } else turn = queuedNotificationTurn(line);
    if (!turn) continue;
    turns.push(turn);
    sessionId ??= line.sessionId ?? null;
    cwd ??= line.cwd ?? null;
  }

  if (sessionId === null) return null;
  return { sessionId, cwd, title: sessionTitle(customTitle, aiTitle, turns), turns };
}

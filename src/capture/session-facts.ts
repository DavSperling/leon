import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import {
  COMMANDES_MAX,
  COMMITS_MAX,
  FICHIERS_MAX,
  PRS_MAX,
  PrSchema,
  type SessionFacts,
  TACHES_MAX,
  TEXTE_MAX,
} from './api-contract';
import { parseClaudeCodeSession } from './claude-code';
import { maskSecrets } from './mask-secrets';
import { isTypedTurn } from './turn';

// Le schéma vit dans le contrat, sans dépendance Node ; réexporté pour les lecteurs des faits.
export { type SessionFacts, SessionFactsSchema } from './api-contract';

type Pr = SessionFacts['prs'][number];
export type Tache = SessionFacts['taches'][number];

// Schéma minimal d'une ligne du fichier de session, comme dans claude-code.ts : les champs inconnus sont
// ignorés, une ligne qui ne le respecte pas est écartée.
const LineSchema = z.object({
  type: z.string(),
  timestamp: z.iso.datetime({ offset: true }).optional(),
  gitBranch: z.string().optional(),
  isSidechain: z.boolean().optional(),
  prRepository: z.string().optional(),
  prNumber: z.number().optional(),
  message: z
    .object({
      content: z.union([z.string(), z.array(z.unknown())]),
      stop_reason: z.string().nullish(),
    })
    .optional(),
});
type Line = z.infer<typeof LineSchema>;

const ToolUseSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});
type Call = z.infer<typeof ToolUseSchema>;
const ToolResultSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(z.unknown())]).optional(),
  is_error: z.boolean().optional(),
});
const TextBlockSchema = z.object({ type: z.literal('text'), text: z.string() });

const BashSchema = z.object({ command: z.string() });
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const FilePathSchema = z.object({
  file_path: z.string().optional(),
  notebook_path: z.string().optional(), // NotebookEdit
});
const TodoWriteSchema = z.object({
  todos: z.array(
    z.object({ content: z.string(), status: z.enum(['pending', 'in_progress', 'completed']) }),
  ),
});
const TaskCreateSchema = z.object({ subject: z.string() });
const TaskUpdateSchema = z.object({
  taskId: z.union([z.string(), z.number()]),
  status: z.enum(['pending', 'in_progress', 'completed', 'deleted']).optional(),
  subject: z.string().optional(),
});
const ETATS = { pending: 'a_faire', in_progress: 'en_cours', completed: 'fait' } as const;
// « Task #3 created successfully: … », le résultat de TaskCreate : l'identifiant que TaskUpdate reprend.
const TASK_ID = /Task #(\d+)/;

// « git -C <dossier> commit » ou « git -c clé=valeur clone » : l'agent travaille souvent par chemin absolu.
// Répétition bornée : « git -C git -C … » ne fait pas relire toute la commande depuis chaque « git ».
const GIT_OPTIONS = String.raw`(?:\s+-[Cc]\s+(?:"[^"]*"|'[^']*'|[^\s"']\S*)){0,4}`;
const GIT_COMMIT = new RegExp(String.raw`\bgit${GIT_OPTIONS}\s+commit\b`);

// Ce qui fait entrer du texte d'ailleurs dans la session (D17) : le web, le MCP, le réseau. On échoue fermé : hors Bash,
// tout outil absent de cette liste d'outils locaux de Claude Code rend la session externe (WebFetch, WebSearch,
// Workflow, tout mcp__* hors des outils locaux de Leon, tout nom inconnu). Aucune commande `leon` n'est une commande
// réseau (D36). Un appel Agent ou Task se juge sur les échanges de son sous-agent, par la même règle (T63 :
// isExternalSubagent) ; sans eux, il rend la session externe.
const LOCAL_TOOLS = new Set([
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Glob',
  'Grep',
  'LS',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'TaskOutput',
  'TaskStop',
  'ExitPlanMode',
  'EnterPlanMode',
  'KillShell',
  'BashOutput',
  'ToolSearch',
  'Skill',
  'AskUserQuestion', // la réponse est celle de l'utilisateur
]);
// Le serveur MCP de Leon, sous le nom que pose son installation (#121 : `claude mcp add … leon`, `codex mcp add leon`),
// et ceux de ses outils qui ne rendent que la mémoire de l'auteur (D36, A14) : ils ne rendent pas la session externe
// quand la CLI a reconnu le serveur à l'URL de sa configuration (leon-mcp.ts). `search`, `fetch` et `briefing` rendent
// des sources de connecteurs : ils comptent. Chaque outil se compare à son nom complet exact, jamais à un suffixe.
export const LEON_MCP_SERVER = 'leon';
export const LEON_LOCAL_TOOLS: readonly string[] = [
  'threads',
  'thread',
  'versions',
  'lessons',
  'remember',
];
const LEON_CLAUDE_TOOLS = new Set(
  LEON_LOCAL_TOOLS.map((tool) => `mcp__${LEON_MCP_SERVER}__${tool}`),
);
// Dans Bash, un nom réseau en position de commande : au début, ou après « ; », « & », « | », « ( » (donc « $( »),
// un retour à la ligne ou un accent grave, les préfixes NOM=valeur et quelques mots de lancement sautés. Pas
// n'importe où : « https » est dans toute URL, « ssh » dans « src/ssh-keys.ts ».
// Tout gh est externe (il lit du texte de tiers : PR, tickets, recherche), sauf ce qui n'écrit que le nôtre,
// reconnu après les options -R/--repo ; une forme non reconnue compte comme externe.
// shortcut: git fetch et git pull restent locaux (trop courants, et leur texte vient de l'équipe) ; un lanceur à
// arguments (« timeout 5 curl », « xargs -n1 curl ») ou un réseau par un interpréteur (« python -c urllib… ») passe :
// les compter si une session externe s'y glisse.
const COMMAND_END = String.raw`(?=[\s;&|)\x60]|$)`;
const GH_LOCAL = String.raw`(?:\s+(?:-R|--repo)(?:\s+|=)\S+){0,2}\s+(?:pr\s+(?:create|edit|merge|checkout)|auth\s+status)${COMMAND_END}`;
// La valeur sans guillemets s'arrête aux séparateurs : sinon, chaque « ; » ou « & » relirait la suite (quadratique).
const EXTERNAL_COMMAND = new RegExp(
  String.raw`(?:^|[;&|(\n\x60])\s*(?:(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|[^\s"';&|()\x60]*)|sudo|env|exec|command|nohup|time|xargs|if|then|do|else|!|\{)\s+){0,8}` +
    String.raw`(?:curl|wget|ssh|sshpass|scp|sftp|rsync|nc|ncat|telnet|https?|xh|aria2c|npm\s+(?:view|info|show|v)|pnpm\s+view|pip\s+download|git${GIT_OPTIONS}\s+clone|gh(?!${GH_LOCAL}))${COMMAND_END}`,
);
// « [branche 1a2b3c4] message », la ligne qu'écrit git commit.
const COMMIT_LINE = /^\[[^\]\n]* ([0-9a-f]{7,40})\]/gm;
const GH_PR_CREATE = /\bgh\s+pr\s+create\b/;
const PR_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;

// Les outils dont la sous-commande dit le geste (« git commit », « pnpm vitest »).
const WITH_SUBCOMMAND = new Set([
  'git',
  'gh',
  'pnpm',
  'npm',
  'npx',
  'yarn',
  'bun',
  'cargo',
  'go',
  'make',
  'docker',
  'kubectl',
  'node',
  'python',
  'vitest',
  'tsc',
  'biome',
]);
const SUBCOMMAND = /^[a-z][a-z0-9:_-]{0,30}$/;
// Un exécutable qui n'a pas cette forme (« "mysql -pX" », « (A=X », « $'…' ») n'est gardé que par ce texte fixe.
const EXECUTABLE = /^[A-Za-z0-9._+-]{1,40}$/;
const HIDDEN_COMMAND = '[commande]';
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
// Ce qui ne coupe pas un mot : une chaîne entre guillemets (dans « $'…' », « \' » ne la ferme pas), un échappement
// (« my\ pass »).
const QUOTED = String.raw`\$'(?:[^'\\]|\\[\s\S])*'|"(?:[^"\\]|\\[\s\S])*"|'[^']*'|\\[\s\S]`;
const QUOTED_PARTS = new RegExp(QUOTED, 'g');
// Un mot de la commande, où le masque, qui contient une espace, ne coupe pas non plus.
const WORD = new RegExp(String.raw`(?:\[secret masqué\]|${QUOTED}|\S)+`, 'g');

// Un préfixe NOM=valeur dont on ne sait pas où finit la valeur : un guillemet resté ouvert ou un antislash final (que
// WORD a pris un à un), une substitution « $( » ou « ` ». Le mot qui le suit peut être un morceau du secret.
const unclosed = (word: string) =>
  /\$\(|`/.test(word) || /["'\\]/.test(word.replace(QUOTED_PARTS, ''));

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

function resultText(content: string | unknown[] | undefined): string {
  if (content === undefined || typeof content === 'string') return content ?? '';
  return content
    .flatMap((block) => {
      const parsed = TextBlockSchema.safeParse(block);
      return parsed.success ? [parsed.data.text] : [];
    })
    .join('\n');
}

// Une commande ne garde que son exécutable, et sa sous-commande pour les outils listés : jamais ses autres
// arguments, où passent des mots de passe que maskSecrets ne reconnaît pas (« mysql -pX », « curl -u a:X »).
// shortcut: seule la première commande d'une suite (« cd x && pnpm test ») est gardée, découper aux opérateurs
// le jour où le bloc de démarrage en a besoin.
function reduceCommand(command: string): string {
  const text = command.replaceAll('\u0000', '');
  // Les préfixes NOM=valeur se sautent sur la commande brute : masquée, « PGPASSWORD=my\ S3cret » perdrait
  // l'échappement dans le masque, et « S3cret » deviendrait l'exécutable.
  let start = text.length;
  for (const word of text.matchAll(WORD)) {
    if (!ASSIGNMENT.test(word[0])) {
      start = word.index;
      break;
    }
    if (unclosed(word[0])) return HIDDEN_COMMAND;
  }
  const words: string[] = [];
  for (const [word] of maskSecrets(text.slice(start)).matchAll(WORD)) {
    words.push(word);
    if (words.length === 2) break;
  }
  const [path = '', argument = ''] = words;
  const executable = path.split('/').at(-1) ?? '';
  if (executable === '') return '';
  if (!EXECUTABLE.test(executable)) return HIDDEN_COMMAND;
  const kept =
    WITH_SUBCOMMAND.has(executable) && SUBCOMMAND.test(argument)
      ? `${executable} ${argument}`
      : executable;
  return factText(kept, TEXTE_MAX);
}

// À la réception (record-facts.ts), une seconde barrière : une commande qui n'a pas la forme que rend reduceCommand
// (une CLI plus ancienne, ou qui réduit mal) ne garde que le texte fixe.
export function recheckCommand(texte: string): string {
  const [executable = '', subcommand, ...rest] = texte.split(' ');
  const reduced =
    EXECUTABLE.test(executable) &&
    rest.length === 0 &&
    (subcommand === undefined || SUBCOMMAND.test(subcommand));
  return reduced ? factText(texte, TEXTE_MAX) : HIDDEN_COMMAND;
}

// Le texte d'un fait, masqué puis coupé. Un jsonb refuse le caractère nul et la moitié d'emoji qu'une coupe
// peut laisser : un seul fait qui en porte ferait échouer l'écriture de tous ceux de la session, à chaque
// rattrapage. Le caractère nul part avant maskSecrets, pour ne pas recoller un secret qu'il coupait. Repassé à la
// réception (record-facts.ts) : le masque peut allonger le texte, la borne est réappliquée après.
export function factText(text: string, max = Number.POSITIVE_INFINITY): string {
  return maskSecrets(text.replaceAll('\u0000', '')).slice(0, max).toWellFormed();
}

// Un worktree rangé dans le clone (`.claude/worktrees/<nom>/`, le flux de CLAUDE.md) : ses fichiers sont ceux du dépôt.
const CLONE_WORKTREE = /^\.claude[\\/]worktrees[\\/][^\\/]+[\\/]/;

// Relatif au dépôt, ou null s'il en sort (« ../leon-autre/x.ts », un autre disque) ou s'il n'y a pas de dépôt.
function repoRelativePath(path: string, root: string | null): string | null {
  if (root === null) return null;
  const relativePath = relative(root, resolve(root, path));
  const outside =
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath);
  return outside ? null : relativePath.replace(CLONE_WORKTREE, '');
}

// Une commande de shell qui fait entrer du texte d'ailleurs (D17), sur la commande entière, avant la coupe : « cd x &&
// curl … » compte. Commune aux lecteurs des outils de code (codex.ts).
export const isExternalCommand = (command: string): boolean => EXTERNAL_COMMAND.test(command);

function isExternalCall({ name, input }: Call, leonMcp: boolean): boolean {
  if (name !== 'Bash') return !LOCAL_TOOLS.has(name) && !(leonMcp && LEON_CLAUDE_TOOLS.has(name));
  const bash = BashSchema.safeParse(input);
  return bash.success && isExternalCommand(bash.data.command);
}

// Les échanges des sous-agents d'une session : `id` du bloc tool_use de l'appel Agent ou Task → contenu du fichier
// `.jsonl` de son sous-agent (annexe 08, chargés par la CLI : subagents.ts).
export type Subagents = ReadonlyMap<string, string>;
const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

// `visited` : les appels Agent ou Task déjà jugés. Un appel revu (le même bloc sur deux lignes) n'apporte rien de plus :
// s'il était externe, la session l'est déjà.
function isExternalAnyCall(
  call: Call,
  leonMcp: boolean,
  subagents: Subagents | undefined,
  visited: Set<string>,
): boolean {
  if (!SUBAGENT_TOOLS.has(call.name)) return isExternalCall(call, leonMcp);
  if (visited.has(call.id)) return false;
  visited.add(call.id);
  const content = subagents?.get(call.id);
  return content === undefined || isExternalSubagent(content, leonMcp, subagents, visited);
}

// Un sous-agent rend la session externe si l'un de ses appels l'est, par la même règle, ou si l'on ne sait pas tout ce
// qu'il a fait (échec fermé) : une ligne illisible, ou pas de rapport final (la dernière ligne de conversation n'est pas
// un message assistant fini par end_turn : coupé, ou encore en cours). Toutes ses lignes portent isSidechain.
function isExternalSubagent(
  content: string,
  leonMcp: boolean,
  subagents: Subagents | undefined,
  visited: Set<string>,
): boolean {
  let finished = false;
  for (const raw of content.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) return true;
    if (line.type !== 'user' && line.type !== 'assistant') continue;
    finished = line.type === 'assistant' && line.message?.stop_reason === 'end_turn';
    const blocks = Array.isArray(line.message?.content) ? line.message.content : [];
    for (const block of blocks) {
      const call = ToolUseSchema.safeParse(block);
      if (call.success && isExternalAnyCall(call.data, leonMcp, subagents, visited)) return true;
    }
  }
  return !finished;
}

// Ce que les appels d'outils d'une session apprennent, avant les bornes de C1 (buildFacts). Commun aux lecteurs des
// outils de code : chacun lit son format, et passe ici ses commandes, ses fichiers et ses tâches.
export type FactsRecord = {
  created: Pr[];
  commits: Set<string>;
  files: Set<string>;
  commands: SessionFacts['commandes'];
  tasks: Map<string, Tache>;
};

export const newFactsRecord = (): FactsRecord => ({
  created: [],
  commits: new Set(),
  files: new Set(),
  commands: [],
  tasks: new Map(),
});

// Une commande de shell et ce qu'elle a écrit : la commande réduite (reduceCommand), les SHA d'un `git commit`, les PR
// d'un `gh pr create` réussi.
export function recordCommand(
  record: FactsRecord,
  command: string,
  output: string,
  error: boolean,
): void {
  const texte = reduceCommand(command);
  if (texte !== '') record.commands.push({ texte, erreur: error });
  // « git commit && git push » peut échouer après le commit : la sortie compte malgré l'erreur.
  if (GIT_COMMIT.test(command)) {
    for (const [, sha] of output.matchAll(COMMIT_LINE)) if (sha) record.commits.add(sha);
  }
  // En erreur, gh pr create n'a rien créé : il rend l'URL de la PR qui existe déjà.
  // shortcut: « gh pr create && x » où x échoue perd la PR ici (la ligne pr-link la garde pour le dépôt
  // courant), reconnaître le message « already exists » si une PR d'un autre dépôt manque.
  if (!error && GH_PR_CREATE.test(command)) {
    for (const [, repo, numero] of output.matchAll(PR_URL)) {
      const pr = PrSchema.safeParse({ repo, numero: Number(numero), par: 'gh-pr-create' });
      if (pr.success) record.created.push(pr.data);
    }
  }
}

// Un fichier écrit par la session, gardé s'il est dans le dépôt (repoRelativePath).
export function recordFile(record: FactsRecord, path: string, root: string | null): void {
  const kept = repoRelativePath(path, root);
  if (kept !== null) record.files.add(kept);
}

// Toute la liste des tâches, réécrite d'un coup (TodoWrite de Claude Code, update_plan de Codex).
export function replaceTasks(record: FactsRecord, tasks: Tache[]): void {
  record.tasks.clear();
  for (const [index, task] of tasks.entries()) record.tasks.set(`todo:${index}`, task);
}

// Ce que le résultat d'un appel d'outil de Claude Code apprend sur la session.
function recordResult(
  record: FactsRecord,
  { name, input }: Call,
  output: string,
  error: boolean,
  root: string | null,
): void {
  if (name === 'Bash') {
    const bash = BashSchema.safeParse(input);
    if (bash.success) recordCommand(record, bash.data.command, output, error);
    return;
  }
  // Les autres outils n'ont rien changé s'ils ont échoué.
  if (error) return;
  if (FILE_TOOLS.has(name)) {
    const file = FilePathSchema.safeParse(input);
    const path = file.success ? (file.data.file_path ?? file.data.notebook_path) : undefined;
    if (path !== undefined) recordFile(record, path, root);
  }
  // TodoWrite réécrit toute la liste ; TaskCreate et TaskUpdate la modifient tâche par tâche.
  const todo = name === 'TodoWrite' ? TodoWriteSchema.safeParse(input) : null;
  if (todo?.success) {
    replaceTasks(
      record,
      todo.data.todos.map(({ content, status }) => ({ texte: content, etat: ETATS[status] })),
    );
  }
  const created = name === 'TaskCreate' ? TaskCreateSchema.safeParse(input) : null;
  if (created?.success) {
    const id = TASK_ID.exec(output)?.[1];
    if (id) record.tasks.set(id, { texte: created.data.subject, etat: 'a_faire' });
  }
  const update = name === 'TaskUpdate' ? TaskUpdateSchema.safeParse(input) : null;
  const task = update?.success ? record.tasks.get(String(update.data.taskId)) : undefined;
  if (update?.success && task) {
    const { taskId, status, subject } = update.data;
    if (status === 'deleted') record.tasks.delete(String(taskId));
    else {
      record.tasks.set(String(taskId), {
        texte: subject ?? task.texte,
        etat: status ? ETATS[status] : task.etat,
      });
    }
  }
}

// Les gestes d'une session Claude Code, à partir de son JSONL. `root` est la racine du dépôt (chemin absolu) :
// les fichiers écrits ailleurs sont retirés ; null, hors de tout dépôt, aucun fichier. Les sous-agents
// (`isSidechain`) ne sont pas la session. `leonMcp` : le serveur `leon` de la configuration de Claude Code est celui de
// la connexion (leon-mcp.ts) ; faux, tout outil MCP compte. `subagents` : les échanges des sous-agents (T63), qui ne
// décident que de `externe` ; un appel Agent ou Task absent de la table rend la session externe.
export function extractClaudeCodeFacts(
  content: string,
  root: string | null,
  leonMcp = false,
  subagents?: Subagents,
): SessionFacts {
  const visited = new Set<string>();
  const calls = new Map<string, Call>();
  const links: Pr[] = [];
  const record = newFactsRecord();
  let branch: string | null = null;
  let errors = 0;
  let external = false;
  let start: string | null = null;
  let end: string | null = null;

  for (const raw of content.split('\n')) {
    const line = parseLine(raw);
    if (!line || line.isSidechain) continue;
    if (line.timestamp) {
      start ??= line.timestamp;
      end = line.timestamp;
    }
    if (line.gitBranch) branch = line.gitBranch;
    if (line.type === 'pr-link') {
      const pr = PrSchema.safeParse({
        repo: line.prRepository,
        numero: line.prNumber,
        par: 'pr-link',
      });
      if (pr.success) links.push(pr.data);
    }
    const blocks = Array.isArray(line.message?.content) ? line.message.content : [];
    for (const block of blocks) {
      const call = ToolUseSchema.safeParse(block);
      if (call.success) {
        calls.set(call.data.id, call.data);
        external ||= isExternalAnyCall(call.data, leonMcp, subagents, visited);
      }
      const result = ToolResultSchema.safeParse(block);
      if (!result.success) continue;
      const error = result.data.is_error === true;
      if (error) errors++;
      const resultCall = calls.get(result.data.tool_use_id);
      if (resultCall)
        recordResult(record, resultCall, resultText(result.data.content), error, root);
    }
  }

  return buildFacts(record, {
    links,
    branch,
    errors,
    external,
    echanges: parseClaudeCodeSession(content)?.turns.filter(isTypedTurn).length ?? 0,
    start,
    end,
  });
}

// Les faits d'une session (C1), bornés, à partir de ce que son lecteur a relevé. `links` : les PR que l'outil écrit
// lui-même (pr-link de Claude Code), avant celles de gh pr create.
export function buildFacts(
  record: FactsRecord,
  session: {
    links: Pr[];
    branch: string | null;
    errors: number;
    external: boolean;
    echanges: number;
    start: string | null;
    end: string | null;
  },
): SessionFacts {
  // Les lignes pr-link d'abord, puis les URL de gh pr create : une PR n'y figure qu'une fois, et garde
  // « gh-pr-create » quand la session l'a créée (Claude Code écrit aussi sa ligne pr-link).
  const prs = new Map<string, Pr>();
  for (const pr of [...session.links, ...record.created]) {
    const key = `${pr.repo.toLowerCase()}#${pr.numero}`;
    if (!prs.has(key) || pr.par === 'gh-pr-create') prs.set(key, pr);
  }
  // Ce qui reste à faire passe avant ce qui est fait : la borne coupe d'abord ce qui est fait.
  const tasks = [...record.tasks.values()];
  const ordered = [
    ...tasks.filter((task) => task.etat !== 'fait'),
    ...tasks.filter((task) => task.etat === 'fait'),
  ];
  const { branch } = session;
  return {
    branche: branch === null || branch === 'HEAD' ? null : factText(branch),
    prs: [...prs.values()].slice(0, PRS_MAX),
    commits: [...record.commits].slice(-COMMITS_MAX),
    fichiers: [...record.files].slice(-FICHIERS_MAX).map((file) => factText(file)),
    commandes: record.commands.slice(-COMMANDES_MAX),
    taches: ordered
      .slice(0, TACHES_MAX)
      .map((task) => ({ texte: factText(task.texte, TEXTE_MAX), etat: task.etat })),
    erreurs: session.errors,
    externe: session.external,
    echanges: session.echanges,
    debut: session.start,
    fin: session.end,
  };
}

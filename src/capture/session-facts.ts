import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { parseClaudeCodeSession } from './claude-code';
import { maskSecrets } from './mask-secrets';

// Les bornes des faits d'une session (C1 du plan mémoire des sessions).
const PRS_MAX = 10;
const COMMITS_MAX = 20;
const FICHIERS_MAX = 50;
const COMMANDES_MAX = 30;
const TACHES_MAX = 20;
const TEXTE_MAX = 200;

const PrSchema = z
  .object({
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    numero: z.number().int().positive(),
    par: z.enum(['pr-link', 'gh-pr-create']),
  })
  .strict();

// Les gestes d'une session, relevés par du code, sans modèle (C1). L'outil est le `kind` de l'envoi.
export const SessionFactsSchema = z
  .object({
    branche: z.string().nullable(), // tête détachée : null
    prs: z.array(PrSchema).max(PRS_MAX),
    commits: z.array(z.string().regex(/^[0-9a-f]{7,40}$/)).max(COMMITS_MAX),
    fichiers: z.array(z.string()).max(FICHIERS_MAX), // relatifs au dépôt
    commandes: z
      .array(z.object({ texte: z.string().max(TEXTE_MAX), erreur: z.boolean() }).strict())
      .max(COMMANDES_MAX),
    taches: z
      .array(
        z
          .object({
            texte: z.string().max(TEXTE_MAX),
            etat: z.enum(['a_faire', 'en_cours', 'fait']),
          })
          .strict(),
      )
      .max(TACHES_MAX),
    erreurs: z.number().int().nonnegative(), // erreurs d'outils
    externe: z.boolean(), // a lu du web, du MCP, un sous-agent ou une commande réseau
    echanges: z.number().int().nonnegative(), // messages tapés par l'utilisateur
    debut: z.iso.datetime({ offset: true }).nullable(),
    fin: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type SessionFacts = z.infer<typeof SessionFactsSchema>;
type Pr = SessionFacts['prs'][number];
type Tache = SessionFacts['taches'][number];

// Schéma minimal d'une ligne du fichier de session, comme dans claude-code.ts : les champs inconnus sont
// ignorés, une ligne qui ne le respecte pas est écartée.
const LineSchema = z.object({
  type: z.string(),
  timestamp: z.iso.datetime({ offset: true }).optional(),
  gitBranch: z.string().optional(),
  isSidechain: z.boolean().optional(),
  prRepository: z.string().optional(),
  prNumber: z.number().optional(),
  message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) }).optional(),
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

// Ce qui fait entrer du texte d'ailleurs dans la session (D17) : le web, le MCP, un sous-agent, le réseau.
const EXTERNAL_TOOLS = new Set(['WebFetch', 'WebSearch', 'Agent', 'Task']);
const EXTERNAL_COMMAND =
  /\b(?:curl|wget)\b|\bgh\s+(?:api|(?:pr|issue|run)\s+view)\b|\bgit\s+clone\b/;

// « git -C <dossier> commit » ou « git -c clé=valeur commit » : l'agent travaille souvent par chemin absolu.
// Répétition bornée : « git -C git -C … » ne fait pas relire toute la commande depuis chaque « git ».
const GIT_COMMIT = /\bgit(?:\s+-[Cc]\s+(?:"[^"]*"|'[^']*'|[^\s"']\S*)){0,4}\s+commit\b/;
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
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
// Un mot de la commande : ni une chaîne entre guillemets, ni un échappement (« my\ pass »), ni le masque, qui
// contient une espace, ne le coupent.
const WORD = /(?:\[secret masqué\]|"(?:[^"\\]|\\[\s\S])*"|'[^']*'|\\[\s\S]|\S)+/g;

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
    if (ASSIGNMENT.test(word[0])) continue;
    start = word.index;
    break;
  }
  const words: string[] = [];
  for (const [word] of maskSecrets(text.slice(start)).matchAll(WORD)) {
    words.push(word);
    if (words.length === 2) break;
  }
  const [path = '', argument = ''] = words;
  const executable = path.split('/').at(-1) ?? '';
  const kept =
    WITH_SUBCOMMAND.has(executable) && SUBCOMMAND.test(argument)
      ? `${executable} ${argument}`
      : executable;
  return factText(kept, TEXTE_MAX);
}

// Le texte d'un fait, masqué puis coupé. Un jsonb refuse le caractère nul et la moitié d'emoji qu'une coupe
// peut laisser : un seul fait qui en porte ferait échouer l'écriture de tous ceux de la session, à chaque
// rattrapage. Le caractère nul part avant maskSecrets, pour ne pas recoller un secret qu'il coupait.
function factText(text: string, max = Number.POSITIVE_INFINITY): string {
  return maskSecrets(text.replaceAll('\u0000', '')).slice(0, max).toWellFormed();
}

// Relatif au dépôt, ou null s'il en sort (« ../leon-autre/x.ts », un autre disque).
function repoRelativePath(path: string, root: string): string | null {
  const relativePath = relative(root, resolve(root, path));
  const outside =
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath);
  return outside ? null : relativePath;
}

function isExternalCall({ name, input }: Call): boolean {
  if (EXTERNAL_TOOLS.has(name) || name.startsWith('mcp__')) return true;
  const bash = BashSchema.safeParse(input);
  // Sur la commande entière, avant la coupe : « cd x && curl … » compte.
  return name === 'Bash' && bash.success && EXTERNAL_COMMAND.test(bash.data.command);
}

type Gathered = {
  created: Pr[];
  commits: Set<string>;
  files: Set<string>;
  commands: SessionFacts['commandes'];
  tasks: Map<string, Tache>;
};

// Ce que le résultat d'un appel d'outil apprend sur la session.
function recordResult(
  record: Gathered,
  { name, input }: Call,
  output: string,
  error: boolean,
  root: string,
): void {
  if (name === 'Bash') {
    const bash = BashSchema.safeParse(input);
    if (!bash.success) return;
    const { command } = bash.data;
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
    return;
  }
  // Les autres outils n'ont rien changé s'ils ont échoué.
  if (error) return;
  if (FILE_TOOLS.has(name)) {
    const file = FilePathSchema.safeParse(input);
    const path = file.success ? (file.data.file_path ?? file.data.notebook_path) : undefined;
    const kept = path === undefined ? null : repoRelativePath(path, root);
    if (kept !== null) record.files.add(kept);
  }
  // TodoWrite réécrit toute la liste ; TaskCreate et TaskUpdate la modifient tâche par tâche.
  const todo = name === 'TodoWrite' ? TodoWriteSchema.safeParse(input) : null;
  if (todo?.success) {
    record.tasks.clear();
    for (const [index, { content, status }] of todo.data.todos.entries()) {
      record.tasks.set(`todo:${index}`, { texte: content, etat: ETATS[status] });
    }
  }
  const created = name === 'TaskCreate' ? TaskCreateSchema.safeParse(input) : null;
  const id = TASK_ID.exec(output)?.[1];
  if (created?.success && id)
    record.tasks.set(id, { texte: created.data.subject, etat: 'a_faire' });
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
// les fichiers écrits ailleurs sont retirés. Les sous-agents (`isSidechain`) ne sont pas la session.
export function extractClaudeCodeFacts(content: string, root: string): SessionFacts {
  const calls = new Map<string, Call>();
  const links: Pr[] = [];
  const record: Gathered = {
    created: [],
    commits: new Set(),
    files: new Set(),
    commands: [],
    tasks: new Map(),
  };
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
        external ||= isExternalCall(call.data);
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

  // Les lignes pr-link d'abord, puis les URL de gh pr create : une PR n'y figure qu'une fois.
  const prs = new Map<string, Pr>();
  for (const pr of [...links, ...record.created]) {
    const key = `${pr.repo.toLowerCase()}#${pr.numero}`;
    if (!prs.has(key)) prs.set(key, pr);
  }
  // Ce qui reste à faire passe avant ce qui est fait : la borne coupe d'abord ce qui est fait.
  const tasks = [...record.tasks.values()];
  const ordered = [
    ...tasks.filter((task) => task.etat !== 'fait'),
    ...tasks.filter((task) => task.etat === 'fait'),
  ];
  return {
    branche: branch === null || branch === 'HEAD' ? null : factText(branch),
    prs: [...prs.values()].slice(0, PRS_MAX),
    commits: [...record.commits].slice(-COMMITS_MAX),
    fichiers: [...record.files].slice(-FICHIERS_MAX).map((file) => factText(file)),
    commandes: record.commands.slice(-COMMANDES_MAX),
    taches: ordered
      .slice(0, TACHES_MAX)
      .map((task) => ({ texte: factText(task.texte, TEXTE_MAX), etat: task.etat })),
    erreurs: errors,
    externe: external,
    echanges:
      parseClaudeCodeSession(content)?.turns.filter((turn) => turn.role === 'user').length ?? 0,
    debut: start,
    fin: end,
  };
}

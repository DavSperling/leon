import { basename, dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { AntigravitySubagents } from '../capture/antigravity';
import { type CodexSubagents, codexSubagentThreads } from '../capture/codex';

// `agentId` validé avant de servir à un chemin (annexe 08 : 17 caractères vus, lettres minuscules et chiffres).
const META_FILE = /^agent-([a-z0-9]{1,64})\.meta\.json$/;
const MetaSchema = z.object({ toolUseId: z.string() });

// La lecture d'un fichier et d'un dossier, pour les chargeurs : sans `readdir`, aucun sous-agent n'est lu.
export type Lecture = {
  readFile: (path: string) => Promise<string>;
  readdir?: (path: string) => Promise<string[]>;
};

// Les échanges des sous-agents d'une session Claude Code, pour le tri de T63 (extractClaudeCodeFacts) : `id` de
// l'appel Agent ou Task (le `toolUseId` du `meta.json`) → contenu de `agent-<agentId>.jsonl`. Le dossier se trouve par
// le nom du fichier de la session, jamais par le sessionId écrit dans ses lignes : `<dossier>/<nom sans .jsonl>/subagents/`,
// à plat, sans descendre dans `workflows/`. Ce qui ne se lit pas est laissé de côté : son appel restera externe. Deux
// meta.json pour un même toolUseId (forme que l'annexe 08 n'a pas vue) : l'appel reste externe aussi.
// Sans `readdir`, aucun sous-agent n'est lu.
export async function loadSubagents(
  sessionFile: string,
  deps: Lecture,
): Promise<Map<string, string>> {
  const subagents = new Map<string, string>();
  const { readdir } = deps;
  if (!readdir || !isAbsolute(sessionFile) || !sessionFile.endsWith('.jsonl')) return subagents;
  const dir = join(dirname(sessionFile), basename(sessionFile, '.jsonl'), 'subagents');
  const names = await readdir(dir).catch(() => []);
  const seen = new Set<string>();
  for (const name of names) {
    const agentId = META_FILE.exec(name)?.[1];
    if (agentId === undefined) continue;
    try {
      const { toolUseId } = MetaSchema.parse(JSON.parse(await deps.readFile(join(dir, name))));
      if (seen.has(toolUseId)) {
        subagents.delete(toolUseId);
        continue;
      }
      seen.add(toolUseId);
      subagents.set(toolUseId, await deps.readFile(join(dir, `agent-${agentId}.jsonl`)));
    } catch {
      // meta.json illisible ou .jsonl absent : l'appel reste externe (échec fermé)
    }
  }
  return subagents;
}

// L'identifiant d'une conversation d'Antigravity, validé avant de servir à un chemin.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FicheSchema = z.object({ conversationId: z.string() });
const TRANSCRIPTS = ['transcript_full.jsonl', 'transcript.jsonl'] as const;

// Les sous-agents d'une session Antigravity, pour le tri de T63 et les coulisses (antigravity.ts ; annexe 11). Le
// fichier de la session est `<variante>/brain/<conversation>/.system_generated/logs/<transcript>` ; elle nomme ses
// sous-agents dans `.system_generated/subagents/<identifiant>.json`, dont la fiche porte le même `conversationId`.
// Chacun est une conversation à part, `brain/<identifiant>/`, lue dans son `transcript_full.jsonl` seulement (les
// valeurs des `args` y ont leur type), dans la même variante ; puis ses propres sous-agents, une fois chacun. Rien n'est
// lu hors du dossier `brain/`. Ce qui ne se lit pas est laissé de côté, comme un sous-agent qui n'a que
// `transcript.jsonl` : son appel restera externe. Sans `readdir`, aucun sous-agent n'est lu.
export async function loadAntigravitySubagents(
  sessionFile: string,
  deps: Lecture,
): Promise<AntigravitySubagents> {
  const named = new Map<string, string[]>();
  const transcripts = new Map<string, string>();
  const logs = dirname(sessionFile);
  const conversation = dirname(dirname(logs));
  const brain = dirname(conversation);
  const { readdir } = deps;
  const known =
    isAbsolute(sessionFile) &&
    (TRANSCRIPTS as readonly string[]).includes(basename(sessionFile)) &&
    basename(logs) === 'logs' &&
    basename(dirname(logs)) === '.system_generated' &&
    basename(brain) === 'brain' &&
    UUID.test(basename(conversation)); // elle sert aussi à un chemin
  if (!readdir || !known) return { named, transcripts };
  const queue = [basename(conversation)];
  const seen = new Set(queue);
  for (const id of queue) {
    const dir = join(brain, id, '.system_generated', 'subagents');
    const children: string[] = [];
    for (const name of (await readdir(dir).catch(() => [])).sort()) {
      const child = name.endsWith('.json') ? name.slice(0, -'.json'.length) : '';
      if (!UUID.test(child)) continue;
      try {
        const fiche = FicheSchema.parse(JSON.parse(await deps.readFile(join(dir, name))));
        if (fiche.conversationId === child) children.push(child);
      } catch {
        // fiche illisible : le sous-agent n'est pas nommé, son appel reste externe (échec fermé)
      }
    }
    named.set(id, children);
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      const childLogs = join(brain, child, '.system_generated', 'logs');
      const transcript = await deps.readFile(join(childLogs, TRANSCRIPTS[0])).catch(() => null);
      if (transcript === null) continue;
      transcripts.set(child, transcript);
      queue.push(child);
    }
  }
  return { named, transcripts };
}

// Les sous-agents d'une session Codex, pour le tri de T63 et les coulisses (codex.ts ; annexe 09) : le fil de chaque
// sous-agent → le contenu de son rollout. Les fils viennent des éléments SubAgentActivity démarrés de la session
// (codexSubagentThreads), validés (un UUID) avant de servir à un nom de fichier. Le rollout d'un sous-agent est
// `rollout-<date>-<fil>.jsonl`, dans le dossier du fichier de la session, jamais un autre jour ; puis ceux de ses propres
// sous-agents, une fois chacun. Ce qui ne se lit pas est laissé de côté, comme un fil porté par deux fichiers (on ne
// sait pas lequel juger) : son sous-agent restera externe. Sans `readdir`, aucun sous-agent n'est lu.
export async function loadCodexSubagents(
  sessionFile: string,
  deps: Lecture,
): Promise<CodexSubagents> {
  const subagents = new Map<string, string>();
  const { readdir } = deps;
  if (!readdir || !isAbsolute(sessionFile)) return subagents;
  const session = await deps.readFile(sessionFile).catch(() => null);
  if (session === null) return subagents;
  const dir = dirname(sessionFile);
  const names = await readdir(dir).catch(() => [] as string[]);
  const queue = [session];
  const seen = new Set<string>();
  for (const content of queue) {
    for (const thread of codexSubagentThreads(content)) {
      if (!UUID.test(thread) || seen.has(thread)) continue;
      seen.add(thread);
      const [file, ...others] = names.filter(
        (name) => name.startsWith('rollout-') && name.endsWith(`-${thread}.jsonl`),
      );
      if (file === undefined || others.length > 0) continue;
      const child = await deps.readFile(join(dir, file)).catch(() => null);
      if (child === null) continue;
      subagents.set(thread, child);
      queue.push(child);
    }
  }
  return subagents;
}

// Les appels Workflow d'une session Claude Code dont le run ne rend pas la session externe, pour le tri de T63
// (extractClaudeCodeFacts), par l'`id` de leur bloc tool_use (relevé du 23/11, sur les formes). La ligne du résultat de
// l'appel porte `toolUseResult.runId` et `transcriptDir`, le dossier du run :
// `<dossier du fichier>/<session>/subagents/workflows/<runId>`, où <session> est celle du fichier, ou celle dont une
// session reprise recopie l'historique. Il n'est lu que s'il a exactement cette forme. Les agents sont ceux que nomme son
// `journal.jsonl`, chacun passé à `externalAgent` (isExternalWorkflowAgent) dès qu'il est lu, puis oublié : un run pèse
// souvent des dizaines de Mo (621 Mo pour la plus grosse session du poste au 23/11), et le crochet de fin le relit
// (Claude Code n'envoie la session qu'à ce crochet). Un agent lancé sans fichier n'a encore rien fait ; si le journal
// le dit fini, ou si le journal ne se lit pas, le run n'est pas jugé : son appel restera externe. La dernière ligne
// d'un fichier, pas encore finie d'écrire (sans retour à la ligne), n'est pas lue : le run peut encore tourner. Un run
// cité deux fois (une reprise) est lu une fois. Au premier run externe ou non jugé, la lecture s'arrête : la session
// est externe, et les appels suivants, hors de l'ensemble, le sont aussi. Sans `readdir`, rien n'est lu.
// shortcut: les runs qui suivent un run externe, et dans un run externe les agents qui suivent son premier agent
// externe, ne sont pas relevés ; à revoir si l'essai réel le montre.
const RUN_ID = /^wf_[a-z0-9-]{1,64}$/;
const AGENT_ID = /^[a-z0-9]{1,64}$/;
const RunResultSchema = z.object({
  type: z.literal('user'),
  isSidechain: z.boolean().optional(),
  toolUseResult: z.object({ runId: z.string().regex(RUN_ID), transcriptDir: z.string() }),
  message: z.object({ content: z.array(z.unknown()) }),
});
const ToolResultIdSchema = z.object({ type: z.literal('tool_result'), tool_use_id: z.string() });
const JournalSchema = z.object({
  type: z.string(),
  agentId: z.string().regex(AGENT_ID).optional(),
});

const writtenLines = (text: string) => text.slice(0, text.lastIndexOf('\n') + 1);

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadWorkflowRuns(
  sessionFile: string,
  content: string,
  deps: Lecture,
  externalAgent: (agent: string) => boolean,
): Promise<Set<string>> {
  const local = new Set<string>();
  if (!deps.readdir || !isAbsolute(sessionFile) || !sessionFile.endsWith('.jsonl')) return local;
  const judged = new Map<string, boolean | null>();
  for (const raw of content.split('\n')) {
    const line = RunResultSchema.safeParse(parseJson(raw));
    if (!line.success || line.data.isSidechain) continue;
    const [id, ...others] = line.data.message.content.flatMap((block) => {
      const result = ToolResultIdSchema.safeParse(block);
      return result.success ? [result.data.tool_use_id] : [];
    });
    const { runId, transcriptDir } = line.data.toolUseResult;
    const owner = basename(dirname(dirname(dirname(transcriptDir))));
    const expected = join(dirname(sessionFile), owner, 'subagents', 'workflows', runId);
    if (id === undefined || others.length > 0 || !UUID.test(owner) || transcriptDir !== expected)
      continue;
    if (!judged.has(transcriptDir)) {
      const external = await externalRun(transcriptDir, deps, externalAgent).catch(() => null);
      judged.set(transcriptDir, external);
    }
    if (judged.get(transcriptDir) !== false) break;
    local.add(id);
  }
  return local;
}

async function externalRun(
  dir: string,
  deps: Lecture,
  externalAgent: (agent: string) => boolean,
): Promise<boolean> {
  const named = new Set<string>();
  const finished = new Set<string>();
  for (const raw of writtenLines(await deps.readFile(join(dir, 'journal.jsonl'))).split('\n')) {
    if (raw === '') continue;
    const { type, agentId } = JournalSchema.parse(JSON.parse(raw));
    if (agentId === undefined) continue;
    named.add(agentId);
    if (type !== 'started') finished.add(agentId); // `result`, `failed`
  }
  for (const agentId of named) {
    const text = await deps.readFile(join(dir, `agent-${agentId}.jsonl`)).catch(() => null);
    if (text === null && finished.has(agentId)) throw new Error('agent fini sans fichier');
    if (text !== null && externalAgent(writtenLines(text))) return true;
  }
  return false;
}

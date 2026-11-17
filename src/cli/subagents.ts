import { basename, dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { AntigravitySubagents } from '../capture/antigravity';

// `agentId` validé avant de servir à un chemin (annexe 08 : 17 caractères vus, lettres minuscules et chiffres).
const META_FILE = /^agent-([a-z0-9]{1,64})\.meta\.json$/;
const MetaSchema = z.object({ toolUseId: z.string() });

// Les échanges des sous-agents d'une session Claude Code, pour le tri de T63 (extractClaudeCodeFacts) : `id` de
// l'appel Agent ou Task (le `toolUseId` du `meta.json`) → contenu de `agent-<agentId>.jsonl`. Le dossier se trouve par
// le nom du fichier de la session, jamais par le sessionId écrit dans ses lignes : `<dossier>/<nom sans .jsonl>/subagents/`,
// à plat, sans descendre dans `workflows/`. Ce qui ne se lit pas est laissé de côté : son appel restera externe. Deux
// meta.json pour un même toolUseId (forme que l'annexe 08 n'a pas vue) : l'appel reste externe aussi.
// Sans `readdir`, aucun sous-agent n'est lu.
export async function loadSubagents(
  sessionFile: string,
  deps: {
    readFile: (path: string) => Promise<string>;
    readdir?: (path: string) => Promise<string[]>;
  },
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
// Chacun est une conversation à part, `brain/<identifiant>/`, lue comme une session (`transcript_full.jsonl`, sinon
// `transcript.jsonl`), dans la même variante ; puis ses propres sous-agents, une fois chacun. Rien n'est lu hors du
// dossier `brain/`. Ce qui ne se lit pas est laissé de côté : son appel restera externe. Sans `readdir`, aucun
// sous-agent n'est lu.
export async function loadAntigravitySubagents(
  sessionFile: string,
  deps: {
    readFile: (path: string) => Promise<string>;
    readdir?: (path: string) => Promise<string[]>;
  },
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
      const transcript = await deps
        .readFile(join(childLogs, TRANSCRIPTS[0]))
        .catch(() => deps.readFile(join(childLogs, TRANSCRIPTS[1])))
        .catch(() => null);
      if (transcript === null) continue;
      transcripts.set(child, transcript);
      queue.push(child);
    }
  }
  return { named, transcripts };
}

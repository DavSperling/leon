import { basename, dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';

// `agentId` validé avant de servir à un chemin (annexe 08 : 17 caractères vus, lettres minuscules et chiffres).
const META_FILE = /^agent-([a-z0-9]{1,64})\.meta\.json$/;
const MetaSchema = z.object({ toolUseId: z.string() });

// Les échanges des sous-agents d'une session Claude Code, pour le tri de T63 (extractClaudeCodeFacts) : `id` de
// l'appel Agent ou Task (le `toolUseId` du `meta.json`) → contenu de `agent-<agentId>.jsonl`. Le dossier se trouve par
// le nom du fichier de la session, jamais par le sessionId écrit dans ses lignes : `<dossier>/<nom sans .jsonl>/subagents/`,
// à plat, sans descendre dans `workflows/`. Ce qui ne se lit pas est laissé de côté : son appel restera externe.
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
  for (const name of names) {
    const agentId = META_FILE.exec(name)?.[1];
    if (agentId === undefined) continue;
    try {
      const meta = MetaSchema.parse(JSON.parse(await deps.readFile(join(dir, name))));
      subagents.set(meta.toolUseId, await deps.readFile(join(dir, `agent-${agentId}.jsonl`)));
    } catch {
      // meta.json illisible ou .jsonl absent : l'appel reste externe (échec fermé)
    }
  }
  return subagents;
}

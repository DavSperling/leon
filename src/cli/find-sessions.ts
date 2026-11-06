import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

async function listDirectory(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return []; // dossier absent ou illisible : rien à importer
  }
}

const timeOf = (value: unknown) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? Date.parse(value) : null;

// Heure du premier tour (ligne user ou assistant) et de la première ligne datée, lues jusqu'au premier tour.
async function firstStamps(path: string): Promise<{ turn: number; line: number }> {
  const stamps = { turn: Number.POSITIVE_INFINITY, line: Number.POSITIVE_INFINITY };
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  try {
    for await (const text of lines) {
      let entry: { type?: unknown; timestamp?: unknown };
      try {
        entry = JSON.parse(text);
      } catch {
        continue;
      }
      const time = timeOf(entry?.timestamp);
      if (time === null) continue;
      if (stamps.line === Number.POSITIVE_INFINITY) stamps.line = time;
      if (entry.type === 'user' || entry.type === 'assistant') {
        stamps.turn = time;
        break;
      }
    }
  } catch {
    // fichier illisible : rangé à la fin, l'import dira l'échec
  } finally {
    lines.close();
  }
  return stamps;
}

// `projects/*/*.jsonl` sous le dossier de configuration de Claude Code, du plus ancien au plus récent :
// heure du premier tour, puis de la première ligne datée, puis date de modification, puis chemin. La date de
// modification seule ne suffit pas : une vieille session touchée après coup passerait après les récentes.
// Les sous-dossiers (dont ceux des sous-agents) sont ignorés.
// Une session reprise recopie l'historique de la session d'origine (mêmes tours, mêmes heures) après une ligne
// datée de la reprise : l'origine passe d'abord et garde ses tours, d'un import à l'autre (le serveur
// dédoublonne par source).
// Limite connue : si Claude Code a purgé la session d'origine, les tours recopiés sont envoyés une seconde
// fois, sous la session reprise.
export async function findSessionFiles(configDir: string): Promise<string[]> {
  const projectsDir = join(configDir, 'projects');
  const projects = (await listDirectory(projectsDir)).filter((entry) => entry.isDirectory());
  const files = await Promise.all(
    projects.map(async (project) => {
      const projectDir = join(projectsDir, project.name);
      const entries = await listDirectory(projectDir);
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map((entry) => join(projectDir, entry.name));
    }),
  );
  const dated = await Promise.all(
    files.flat().map(async (path) => ({
      path,
      ...(await firstStamps(path)),
      mtime: await stat(path).then(
        (info) => info.mtimeMs,
        () => 0,
      ),
    })),
  );
  return dated
    .sort(
      (a, b) =>
        a.turn - b.turn ||
        a.line - b.line ||
        a.mtime - b.mtime ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    )
    .map(({ path }) => path);
}

export type SessionFile = { path: string; mtimeMs: number; size: number };

// Les rollouts de Codex : `<dossier de Codex>/sessions/AAAA/MM/JJ/rollout-<date>-<id>.jsonl`, du moins récemment modifié
// au plus récent. Tout le dossier est parcouru : un fil repris peut écrire dans le fichier d'un autre jour.
// shortcut: un rollout que Codex a compressé (`.jsonl.zst`, après 7 jours sans écriture) n'est pas lu : il a été capté
// par ses Stop ou par un rattrapage avant ; le lire (zstd) si une session s'y perd.
const ROLLOUT_FILE = /^rollout-.+\.jsonl$/;
const ROLLOUT_DEPTH = 3;

async function rolloutsUnder(directory: string, depth: number): Promise<string[]> {
  const entries = await listDirectory(directory);
  const found = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return depth > 0 ? rolloutsUnder(path, depth - 1) : [];
      return entry.isFile() && ROLLOUT_FILE.test(entry.name) ? [path] : [];
    }),
  );
  return found.flat();
}

export async function findCodexSessionFiles(codexDir: string): Promise<SessionFile[]> {
  const paths = await rolloutsUnder(join(codexDir, 'sessions'), ROLLOUT_DEPTH);
  const files = await Promise.all(
    paths.map(async (path) => {
      const info = await stat(path).catch(() => null);
      return info ? [{ path, mtimeMs: info.mtimeMs, size: info.size }] : [];
    }),
  );
  return files
    .flat()
    .sort((a, b) => a.mtimeMs - b.mtimeMs || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

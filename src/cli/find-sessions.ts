import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function listDirectory(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return []; // dossier absent ou illisible : rien à importer
  }
}

// `projects/*/*.jsonl` sous le dossier de configuration de Claude Code, du plus ancien au plus récent
// (date de modification, puis chemin). Les sous-dossiers (dont ceux des sous-agents) sont ignorés.
// Une session reprise recopie l'historique de la session d'origine dans un fichier plus récent : l'origine
// passe d'abord et garde ses tours, d'un import à l'autre (le serveur dédoublonne par source).
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
      mtime: await stat(path).then(
        (info) => info.mtimeMs,
        () => 0,
      ),
    })),
  );
  return dated
    .sort((a, b) => a.mtime - b.mtime || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(({ path }) => path);
}

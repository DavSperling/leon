import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function listDirectory(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return []; // dossier absent ou illisible : rien à importer
  }
}

// `projects/*/*.jsonl` sous le dossier de configuration de Claude Code, triés.
// Les sous-dossiers (dont ceux des sous-agents) sont ignorés.
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
  return files.flat().sort();
}

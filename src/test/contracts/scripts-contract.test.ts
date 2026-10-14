import { describe, expect, it } from 'vitest';
import { pathExists, readText } from './files';

// Un mot de commande qui désigne un fichier ou un dossier du dépôt : src/…, extension, extension/…
const REPO_PATH = /(?<=^|\s)((?:src|extension)(?:\/\S*)?)(?=\s|$)/g;

const scripts = (JSON.parse(readText('package.json')) as { scripts: Record<string, string> })
  .scripts;

describe('scripts de package.json', () => {
  it('citent des chemins', () => {
    const cited = Object.values(scripts).flatMap((command) => [...command.matchAll(REPO_PATH)]);
    expect(cited.length).toBeGreaterThan(3);
  });

  it.each(Object.entries(scripts))('%s ne cite que des chemins qui existent', (_name, command) => {
    const missing = [...command.matchAll(REPO_PATH)]
      .map((match) => match[1] as string)
      .filter((path) => !pathExists(path));
    expect(missing).toEqual([]);
  });
});

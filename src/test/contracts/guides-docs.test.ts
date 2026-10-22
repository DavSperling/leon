import { describe, expect, it } from 'vitest';
import { NAV } from '@/components/verre/shell/nav';
import { listFiles, productionSources, readText } from './files';

// Les guides de vérification manuelle décrivent l'interface et les outils MCP que le code porte. Quand le
// deuxième jet a supprimé les fiches, « À vérifier », le Journal et les outils MCP du premier jet, les guides
// sont restés faux sans qu'aucun test le dise. Cette garde fait échouer un guide qui cite ce qui n'existe plus.

const GUIDES = listFiles('docs/guides/*.md');
// Un guide qu'on n'a pas réécrit le dit en tête, et renvoie vers celui qui le remplace.
const isStale = (text: string): boolean =>
  /^> \*\*Périmé/m.test(text.split('\n').slice(0, 6).join('\n'));
const CURRENT_GUIDES = GUIDES.filter((path) => !isStale(readText(path)));

// Ce que le deuxième jet a supprimé de l'interface : routes, sections, anglicismes de l'ancien écran.
const REMOVED = [
  '/fiches',
  '/a-verifier',
  '/journal',
  'À vérifier',
  'arbre des fiches',
  'Journal',
  'Pipeline',
];

// Noms des outils MCP, lus dans le code qui les enregistre.
function registeredMcpTools(): string[] {
  return productionSources('src/server/mcp/tools/*-tool.ts').flatMap(({ text }) =>
    [...text.matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((match) => match[1] as string),
  );
}

describe('guides de vérification', () => {
  it('trouve des guides, dont un périmé et un à jour', () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(3);
    expect(CURRENT_GUIDES.length).toBeLessThan(GUIDES.length);
    expect(CURRENT_GUIDES).toContain('docs/guides/connecteurs-verification.md');
  });

  it('un guide périmé renvoie vers le guide du deuxième jet', () => {
    for (const path of GUIDES.filter((guide) => !CURRENT_GUIDES.includes(guide))) {
      expect(readText(path), path).toContain('docs/guides/deuxieme-jet-verification.md');
    }
  });

  it.each(CURRENT_GUIDES)('%s ne cite rien de ce que le deuxième jet a supprimé', (path) => {
    const text = readText(path);
    for (const word of REMOVED) expect(text, `${path} cite « ${word} »`).not.toContain(word);
  });

  it('le guide des connecteurs cite les sections de la barre latérale telles que le code les nomme', () => {
    expect(readText('docs/guides/connecteurs-verification.md')).toContain(
      NAV.map(({ label }) => label).join(', '),
    );
  });

  it.each(CURRENT_GUIDES)('%s ne cite que des outils MCP que le serveur enregistre', (path) => {
    const registered = registeredMcpTools();
    expect(registered).toContain('remember');
    const cited = [...readText(path).matchAll(/`(search|fetch|briefing|remember)`/g)].map(
      (match) => match[1] as string,
    );
    for (const name of cited) expect(registered, `${path} cite l'outil ${name}`).toContain(name);
  });
});

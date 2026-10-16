import { describe, expect, it } from 'vitest';
import { listFiles, pageRoutes, productionSources, readText } from './files';

// Premier groupe capturé de chaque occurrence (le motif doit porter le drapeau g).
const groups = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((match) => match[1] ?? '');

const codeSpans = (path: string): string[] => groups(readText(path), /`([^`\n]+)`/g);

const README = codeSpans('README.md');
const LICENCES = codeSpans('docs/licences-tiers.md');

const THIRD_PARTY = /^@(dnd-kit|tiptap)\//;
const registered = productionSources('src/server/mcp/**/*.ts').flatMap(({ text }) =>
  groups(text, /registerTool\(\s*'(task_[a-z]+)'/g),
);
const declared = Object.keys(
  (JSON.parse(readText('package.json')) as { dependencies: Record<string, string> }).dependencies,
).filter((name) => THIRD_PARTY.test(name));

// Le README et les licences citent des outils, des pages, des fichiers et des paquets : s'ils
// bougent sans que la doc suive, la doc devient fausse sans qu'aucun autre test ne le voie.
describe('README et licences tierces ↔ code', () => {
  it('trouve des outils et des dépendances', () => {
    expect(registered.length).toBeGreaterThanOrEqual(6);
    expect(declared.length).toBeGreaterThanOrEqual(11);
  });

  it('documente dans le README exactement les outils task_* enregistrés', () => {
    expect(new Set(README.filter((span) => /^task_[a-z]+$/.test(span)))).toEqual(
      new Set(registered),
    );
  });

  it('ne cite dans le README que des pages qui existent', () => {
    const routes = pageRoutes();
    const pages = README.filter((span) => /^\/taches(\/[a-z-]+)?$/.test(span));
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.filter((page) => !routes.includes(page))).toEqual([]);
  });

  it('ne cite dans les licences que des fichiers qui existent', () => {
    const files = LICENCES.filter((span) => /\.tsx?$/.test(span));
    expect(files.length).toBeGreaterThan(5);
    // Un nom sans dossier (« board-column.tsx ») se cherche n'importe où sous src.
    const missing = files.filter(
      (file) => listFiles(file.includes('/') ? file : `src/**/${file}`).length === 0,
    );
    expect(missing).toEqual([]);
  });

  it('liste dans les licences exactement les dépendances @dnd-kit et @tiptap de package.json', () => {
    expect(new Set(LICENCES.filter((span) => THIRD_PARTY.test(span)))).toEqual(new Set(declared));
  });
});

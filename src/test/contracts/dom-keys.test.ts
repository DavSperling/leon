import { describe, expect, it } from 'vitest';
import { productionSources, readText } from './files';

const sources = productionSources('src/components/**/*.{ts,tsx}');

// Les attributs data-* qu'un composant retrouve dans le DOM : closest('[data-task-id]').
const READ = /closest(?:<[^>]*>)?\('\[(data-[\w-]+)\]'\)/g;
// Ceux que du JSX écrit : data-task-id={row.id}.
const WRITTEN = /\b(data-[\w-]+)=\{/g;

const namesIn = (pattern: RegExp) =>
  sources.flatMap(({ text }) => [...text.matchAll(pattern)].map((match) => match[1] as string));

// Renommer un côté désactive la touche X sans erreur : seul ce test le voit.
describe('attributs data-* du DOM', () => {
  it('un attribut que le code cherche dans le DOM est posé par un composant', () => {
    const read = namesIn(READ);
    const written = new Set(namesIn(WRITTEN));
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter((name) => !written.has(name))).toEqual([]);
  });
});

// Un commentaire lu est un éditeur en lecture seule : ProseMirror écrit alors contenteditable="false"
// sur sa racine. Si les touches C, X et Échap le prenaient pour un champ, elles s'éteindraient dès
// qu'un lien du commentaire a le focus.
describe('touches et éditeur en lecture seule', () => {
  it('seul un contenteditable modifiable compte comme un champ', () => {
    expect(readText('src/components/tasks/typing.ts')).toContain(
      '[contenteditable]:not([contenteditable="false"])',
    );
  });

  it('un éditeur en lecture seule n’est pas modifiable', () => {
    expect(readText('src/components/markdown-editor.tsx')).toContain('editable: !readOnly');
  });
});

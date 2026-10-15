import { describe, expect, it } from 'vitest';
import { productionSources, readText } from './files';

const sources = productionSources('src/components/**/*.{ts,tsx}');

// Les attributs data-* qu'un composant retrouve dans le DOM : closest('[data-task-id]').
const READ = /closest(?:<[^>]*>)?\('\[(data-[\w-]+)\]'\)/g;
// Ceux que du JSX écrit : data-task-id={row.id}.
const WRITTEN = /\b(data-[\w-]+)=\{/g;

const namesIn = (pattern: RegExp, from = sources) =>
  from.flatMap(({ text }) => [...text.matchAll(pattern)].map((match) => match[1] as string));

// Renommer un côté désactive la touche X sans erreur : seul ce test le voit.
describe('attributs data-* du DOM', () => {
  it('un attribut que le code cherche dans le DOM est posé par un composant', () => {
    const read = namesIn(READ);
    const written = new Set(namesIn(WRITTEN));
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter((name) => !written.has(name))).toEqual([]);
  });
});

// Les touches des tâches (S P A L D, J K, Entrée, glissement au clavier) cherchent leur cible dans le
// DOM par un sélecteur CSS : [data-picker="status"]. Ici, le sélecteur contre les attributs que le JSX pose.
const taskSources = productionSources(
  'src/components/tasks/**/*.{ts,tsx}',
  'src/app/(taches)/**/*.tsx',
);
const SELECTOR = /\[(data-[\w-]+)(?:=[^\]]*)?\]/g;
const WRITTEN_ANY = /\b(data-[\w-]+)=(?:\{|")/g;
const TARGETS = [
  'data-task-id',
  'data-picker',
  'data-bulk-actions',
  'data-task-page',
  'data-dragging',
];

describe('attributs data-* des raccourcis des tâches', () => {
  const read = new Set(namesIn(SELECTOR, taskSources));
  const written = new Set(namesIn(WRITTEN_ANY, taskSources));

  it.each(TARGETS)('%s est cherché par le code et posé par un composant', (name) => {
    expect(read).toContain(name);
    expect(written).toContain(name);
  });

  it('un attribut que le code cherche est posé par un composant', () => {
    expect([...read].filter((name) => !written.has(name))).toEqual([]);
  });
});

// Les valeurs de data-picker sont des chaînes libres du JSX : seul PickerKind les borne. Chaque
// endroit qui montre les sélecteurs les pose tous, et aucune autre valeur.
describe('valeurs de data-picker', () => {
  const declared = readText('src/components/tasks/row-targets.ts').match(
    /export type PickerKind = ([^;]+);/,
  );
  const kinds = [...(declared?.[1] ?? '').matchAll(/'(\w+)'/g)].map((match) => match[1] as string);

  it('PickerKind est lisible', () => {
    expect(kinds.length).toBeGreaterThan(0);
  });

  it.each(['row-cells.tsx', 'task-properties.tsx', 'selection-bar.tsx'])(
    '%s pose exactement les valeurs de PickerKind',
    (file) => {
      const text = readText(`src/components/tasks/${file}`);
      const posed = [...text.matchAll(/(?:data-picker|picker)="(\w+)"/g)].map(
        (match) => match[1] as string,
      );
      expect([...new Set(posed)].sort()).toEqual([...kinds].sort());
    },
  );
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

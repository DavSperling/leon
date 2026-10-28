import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_MAX_BYTES,
  documentExtension,
  isIgnoredPath,
  isReadableName,
  OFFICE_EXTENSIONS,
  selectFolderFiles,
  TEXT_EXTENSIONS,
} from './documents';

// `extractText` teste les extensions texte avant officeparser : une extension dans les deux listes ne passerait
// jamais par lui, sans erreur.
describe('les formats lus', () => {
  it('ne se recoupent pas : Office d’un côté, texte et code de l’autre', () => {
    const texts: readonly string[] = TEXT_EXTENSIONS;

    expect(OFFICE_EXTENSIONS.filter((extension) => texts.includes(extension))).toEqual([]);
  });
});

describe('documentExtension', () => {
  it('rend l’extension en minuscules, celle du nom seul quand c’est un chemin', () => {
    expect(documentExtension('Devis.PDF')).toBe('pdf');
    expect(documentExtension('archive.tar.gz')).toBe('gz');
    expect(documentExtension('projet.v2/README')).toBe('');
  });

  it('un nom sans extension, ou caché, n’en a pas', () => {
    expect(documentExtension('Makefile')).toBe('');
    expect(documentExtension('src/.env')).toBe('');
    expect(documentExtension('fin.')).toBe('');
  });
});

describe('isReadableName', () => {
  it('lit les formats Office, le texte et le code', () => {
    for (const name of ['plan.pdf', 'devis.xlsx', 'notes.md', 'src/app.ts', 'schema.SQL']) {
      expect(isReadableName(name), name).toBe(true);
    }
  });

  it('laisse le reste', () => {
    for (const name of ['photo.png', 'outil.exe', 'ancien.doc', 'Makefile', 'archive.zip']) {
      expect(isReadableName(name), name).toBe(false);
    }
  });
});

describe('isIgnoredPath', () => {
  it('ignore un dossier caché ou un fichier caché', () => {
    expect(isIgnoredPath('projet/.git/config.ts')).toBe(true);
    expect(isIgnoredPath('projet/.github/workflows/ci.yml')).toBe(true);
    expect(isIgnoredPath('projet/src/.env.ts')).toBe(true);
  });

  it('ignore node_modules et les dossiers de build, à n’importe quel niveau', () => {
    expect(isIgnoredPath('projet/node_modules/lib/index.js')).toBe(true);
    expect(isIgnoredPath('projet/packages/web/node_modules/lib/index.js')).toBe(true);
    expect(isIgnoredPath('projet/dist/app.js')).toBe(true);
    expect(isIgnoredPath('projet/web/build/app.js')).toBe(true);
  });

  it('ignore les fichiers de verrouillage', () => {
    expect(isIgnoredPath('projet/pnpm-lock.yaml')).toBe(true);
    expect(isIgnoredPath('projet/web/package-lock.json')).toBe(true);
  });

  it('ignore les fichiers de secrets que Git ignore sans qu’ils soient cachés', () => {
    expect(isIgnoredPath('web/credentials.json')).toBe(true);
    expect(isIgnoredPath('infra/config/secrets.yml')).toBe(true);
    expect(isIgnoredPath('api/local.settings.json')).toBe(true);
  });

  it('garde un chemin normal, même quand un nom ressemble à un dossier ignoré', () => {
    expect(isIgnoredPath('projet/src/app.ts')).toBe(false);
    expect(isIgnoredPath('projet/docs/build-notes.md')).toBe(false);
    expect(isIgnoredPath('projet/notes.md')).toBe(false);
  });
});

describe('selectFolderFiles', () => {
  const file = (path: string, size = 100) => ({ path, size });

  it('garde les fichiers lisibles et compte les autres', () => {
    const { kept, skipped } = selectFolderFiles([
      file('p/a.ts'),
      file('p/b.pdf'),
      file('p/logo.png'),
      file('p/.git/config.ts'),
      file('p/node_modules/x/index.js'),
      file('p/pnpm-lock.yaml'),
    ]);

    expect(kept.map((f) => f.path)).toEqual(['p/a.ts', 'p/b.pdf']);
    expect(skipped).toBe(4);
  });

  it('ignore un fichier vide, ou de plus de 10 Mo', () => {
    const { kept, skipped } = selectFolderFiles([
      file('p/vide.ts', 0),
      file('p/limite.ts', DOCUMENT_MAX_BYTES),
      file('p/gros.ts', DOCUMENT_MAX_BYTES + 1),
    ]);

    expect(kept.map((f) => f.path)).toEqual(['p/limite.ts']);
    expect(skipped).toBe(2);
  });

  it('rend les éléments tels quels, avec leurs autres champs', () => {
    const original = { path: 'p/a.ts', size: 10, file: 'le fichier' };

    expect(selectFolderFiles([original]).kept[0]).toBe(original);
  });
});

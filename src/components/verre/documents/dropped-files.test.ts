import { describe, expect, it } from 'vitest';
import { selectFolderFiles } from '@/lib/documents';
import { readDropped, readPicked } from './dropped-files';

// Un faux système de fichiers : un dossier rend ses entrées deux par deux, puis une liste vide, comme le navigateur.
const file = (name: string) =>
  ({
    name,
    isFile: true,
    isDirectory: false,
    file: (done: (file: File) => void) => done(new File(['x'], name)),
  }) as unknown as FileSystemEntry;

// Un fichier que le navigateur n'arrive pas à ouvrir (lien cassé, droits).
const broken = (name: string) =>
  ({
    name,
    isFile: true,
    isDirectory: false,
    file: (_done: unknown, fail: (error: Error) => void) => fail(new Error('illisible')),
  }) as unknown as FileSystemEntry;

const folder = (name: string, children: FileSystemEntry[]) =>
  ({
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let from = 0;
      return {
        readEntries: (done: (entries: FileSystemEntry[]) => void) => {
          done(children.slice(from, from + 2));
          from += 2;
        },
      };
    },
  }) as unknown as FileSystemEntry;

const lockedFolder = (name: string) =>
  ({
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (_done: unknown, fail: (error: Error) => void) => fail(new Error('droits')),
    }),
  }) as unknown as FileSystemEntry;

describe('readDropped', () => {
  it('lit tous les lots d’un dossier, sous-dossiers compris, avec leur chemin sous la racine', async () => {
    const dropped = folder('depot', [
      file('a.md'),
      file('b.md'),
      file('c.md'),
      folder('sous', [file('d.ts'), file('e.ts'), file('f.ts')]),
    ]);

    const { folders, singles } = await readDropped([dropped]);

    expect(singles).toEqual([]);
    expect(folders).toHaveLength(1);
    expect(folders[0]?.name).toBe('depot');
    expect(folders[0]?.files.map(({ path }) => path).sort()).toEqual([
      'a.md',
      'b.md',
      'c.md',
      'sous/d.ts',
      'sous/e.ts',
      'sous/f.ts',
    ]);
  });

  it('ne parcourt pas les dossiers ignorés', async () => {
    const dropped = folder('app', [
      file('a.ts'),
      folder('node_modules', [file('x.js')]),
      folder('.git', [file('HEAD')]),
    ]);

    const { folders } = await readDropped([dropped]);

    expect(folders[0]?.files.map(({ path }) => path)).toEqual(['a.ts']);
  });

  it('ne juge pas le dossier déposé lui-même, même nommé comme un dossier ignoré', async () => {
    for (const name of ['vendor', 'build', 'target', '.claude']) {
      const { folders } = await readDropped([
        folder(name, [file('contrat-a.pdf'), folder('node_modules', [file('x.js')])]),
      ]);

      const files = folders[0]?.files ?? [];
      expect(
        files.map(({ path }) => path),
        name,
      ).toEqual(['contrat-a.pdf']);
      expect(selectFolderFiles(files).kept, name).toHaveLength(1);
    }
  });

  it('laisse de côté un fichier ou un sous-dossier que le navigateur n’ouvre pas', async () => {
    const dropped = folder('depot', [file('a.md'), broken('lien.md'), lockedFolder('prive')]);

    const { folders } = await readDropped([dropped, broken('seul.md')]);

    expect(folders[0]?.files.map(({ path }) => path)).toEqual(['a.md']);
  });

  it('garde un fichier déposé seul à part des dossiers', async () => {
    const { folders, singles } = await readDropped([
      file('note.md'),
      folder('docs', [file('a.md')]),
    ]);

    expect(singles.map(({ path }) => path)).toEqual(['note.md']);
    expect(folders.map(({ name }) => name)).toEqual(['docs']);
  });

  it('garde comme fichier seul un élément déposé sans entrée', async () => {
    const { folders, singles } = await readDropped([new File(['x'], 'piece-jointe.pdf')]);

    expect(folders).toEqual([]);
    expect(singles.map(({ path }) => path)).toEqual(['piece-jointe.pdf']);
  });
});

describe('readPicked', () => {
  // `webkitRelativePath` est en lecture seule dans un navigateur, et absent de Node.
  const chosen = (name: string, webkitRelativePath: string) =>
    Object.defineProperty(new File(['x'], name), 'webkitRelativePath', {
      value: webkitRelativePath,
    });

  it('range les fichiers d’un dossier choisi sous leur chemin, racine exclue', () => {
    const { folders, singles } = readPicked([
      chosen('a.md', 'vendor/a.md'),
      chosen('d.ts', 'vendor/sous/d.ts'),
    ]);

    expect(singles).toEqual([]);
    expect(folders).toHaveLength(1);
    expect(folders[0]?.name).toBe('vendor');
    expect(folders[0]?.files.map(({ path }) => path)).toEqual(['a.md', 'sous/d.ts']);
    expect(selectFolderFiles(folders[0]?.files ?? []).kept).toHaveLength(2);
  });

  it('garde comme fichiers seuls ceux d’un sélecteur qui ignore les dossiers (mobile)', () => {
    const { folders, singles } = readPicked([chosen('a.pdf', ''), chosen('b.pdf', '')]);

    expect(folders).toEqual([]);
    expect(singles.map(({ path }) => path)).toEqual(['a.pdf', 'b.pdf']);
  });
});

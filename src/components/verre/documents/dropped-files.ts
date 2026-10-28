import { isIgnoredPath } from '@/lib/documents';

// Un fichier choisi et son chemin sous le dossier choisi, racine exclue (« sous/fichier.ts ») : la racine est le
// choix de l'utilisateur, `selectFolderFiles` ne la juge pas. `size` sert à `selectFolderFiles`.
export type PickedFile = { file: File; path: string; size: number };
export type PickedFolder = { name: string; files: PickedFile[] };

export const picked = (file: File, path: string): PickedFile => ({ file, path, size: file.size });

// `readEntries` rend les entrées par lots : on le rappelle jusqu'à une liste vide.
const readBatch = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));

async function childrenOf(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const children: FileSystemEntry[] = [];
  for (let batch = await readBatch(reader); batch.length > 0; batch = await readBatch(reader)) {
    children.push(...batch);
  }
  return children;
}

// `path` : vide pour le dossier déposé lui-même.
async function filesOf(entry: FileSystemEntry, path: string): Promise<PickedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [picked(file, path)];
  }
  // `.git`, `node_modules`… : inutile d'en lister des milliers de fichiers, `selectFolderFiles` les écarterait.
  if (isIgnoredPath(path)) return [];
  const children = await childrenOf(entry as FileSystemDirectoryEntry);
  // Un fichier ou un sous-dossier que le navigateur n'ouvre pas (lien cassé, droits) est laissé de côté.
  const files = await Promise.all(
    children.map((child) =>
      filesOf(child, path ? `${path}/${child.name}` : child.name).catch(() => []),
    ),
  );
  return files.flat();
}

// Ce qu'on a déposé : chaque dossier du premier niveau est un dossier à part, chaque fichier déposé seul reste seul.
// Un `File` est un élément sans entrée (glissé depuis une application qui n'en donne pas) : un fichier seul.
export async function readDropped(
  entries: (FileSystemEntry | File)[],
): Promise<{ folders: PickedFolder[]; singles: PickedFile[] }> {
  const folders: PickedFolder[] = [];
  const singles: PickedFile[] = [];
  for (const entry of entries) {
    if (entry instanceof File) {
      singles.push(picked(entry, entry.name));
      continue;
    }
    const files = await filesOf(entry, entry.isDirectory ? '' : entry.name).catch(() => []);
    if (entry.isDirectory) folders.push({ name: entry.name, files });
    else singles.push(...files);
  }
  return { folders, singles };
}

// Ce que le sélecteur de dossier rend. Un navigateur qui ignore `webkitdirectory` (mobile) rend des fichiers sans
// chemin : ils restent seuls au lieu d'être jetés.
export function readPicked(files: File[]): { folders: PickedFolder[]; singles: PickedFile[] } {
  const inFolder = files.filter((file) => file.webkitRelativePath);
  const name = inFolder[0]?.webkitRelativePath.split('/')[0];
  return {
    folders: name
      ? [
          {
            name,
            files: inFolder.map((file) =>
              picked(file, file.webkitRelativePath.slice(name.length + 1)),
            ),
          },
        ]
      : [],
    singles: files
      .filter((file) => !file.webkitRelativePath)
      .map((file) => picked(file, file.name)),
  };
}

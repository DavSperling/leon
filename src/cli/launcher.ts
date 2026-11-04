// Le lanceur `~/.leon/bin/leon` (K8 du plan « CLI sans clone », S08) : le script `sh` que tous les crochets des outils de
// code appellent (`launcherHookCommand`, hook-commands.ts). Il a deux formes, et ne change que par `leon setup` (E7) :
// - installée, par défaut : le Node posé par Leon (`runtime/actuel`) et la version en cours de la CLI (`cli/actuelle`) ;
// - clone, pour un développeur (`leon setup --depot <clone>`) : pnpm dans son clone, comme les crochets d'avant.
// Le lanceur ne dépend d'aucune version : le script d'installation et la mise à jour changent les liens `runtime/actuel`
// et `cli/actuelle`, jamais lui. Chaque chemin est mis entre apostrophes (un dossier personnel peut avoir une espace ou
// une apostrophe), et `exec` laisse le Node ou pnpm recevoir l'entrée standard, le JSON du crochet, et rendre son code
// de sortie.
//
// L'écriture imite connection.ts : un fichier voisin en 0700, puis un `rename`, de sorte qu'un lanceur déjà lancé ou un
// arrêt en cours d'écriture ne tombe jamais sur un script coupé. Un lien symbolique à la place du lanceur est refusé.
import { randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { HOOK_PNPM_OPTIONS, launcherPath, singleQuote } from './hook-commands';

export type LauncherForm = { kind: 'installee' } | { kind: 'clone'; repoDir: string };

export type LauncherWrite = {
  etat: 'neuf' | 'identique' | 'remplace';
  // Le texte du lanceur d'avant, null s'il n'y en avait pas.
  ancienne: string | null;
};

// Le lanceur d'un autre texte était déjà là et l'appelant n'a pas confirmé qu'on le remplace.
export class LauncherNotReplacedError extends Error {
  constructor() {
    super('~/.leon/bin/leon already exists and is different: it was not replaced.');
  }
}

// Le marqueur de la deuxième ligne : seul un fichier qui le porte est effacé par removeLauncher.
const MARK = '# Written by Leon (';

// Le texte exact du lanceur (K8) pour le dossier personnel `home`. Un clone s'indique par un chemin absolu : un chemin
// relatif ne mènerait nulle part depuis le dossier d'où l'outil lance le crochet.
export function launcherScript(home: string, form: LauncherForm): string {
  if (form.kind === 'clone' && !isAbsolute(form.repoDir)) {
    throw new Error('The Leon clone of the launcher must be an absolute path.');
  }
  const leon = join(home, '.leon');
  const exec =
    form.kind === 'installee'
      ? [
          singleQuote(join(leon, 'runtime', 'actuel', 'node')),
          singleQuote(join(leon, 'cli', 'actuelle', 'leon.mjs')),
        ]
      : ['pnpm', ...HOOK_PNPM_OPTIONS, '--dir', singleQuote(form.repoDir), 'leon'];
  const origin =
    form.kind === 'installee' ? 'leon setup). Installed form.' : 'leon setup --depot). Clone form.';
  return `#!/bin/sh\n${MARK}${origin}\nexec ${exec.join(' ')} "$@"\n`;
}

// null : le fichier n'existe pas (ou ~/.leon n'est pas un dossier). Toute autre erreur (droits…) remonte.
const statOrNull = (path: string) =>
  lstat(path).catch((error) => {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw error;
  });

// Écrit le lanceur de `home` pour cette forme. Un lanceur déjà identique n'est pas réécrit (ses droits sont remis en
// 0700). Un lanceur différent n'est remplacé que si `confirmReplace`, que `leon setup` fournit, répond oui en voyant
// son texte : sans elle, ou si elle refuse, LauncherNotReplacedError et rien n'est modifié.
export async function writeLauncher(
  home: string,
  form: LauncherForm,
  confirmReplace?: (ancienne: string) => boolean | Promise<boolean>,
): Promise<LauncherWrite> {
  const path = launcherPath(home);
  const script = launcherScript(home, form);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const info = await statOrNull(path);
  if (info?.isSymbolicLink()) {
    throw new Error('~/.leon/bin/leon is a symbolic link: Leon does not write through it.');
  }
  if (info && !info.isFile()) throw new Error('~/.leon/bin/leon is not a regular file.');
  const old = info ? await readFile(path, 'utf8') : null;
  if (old === script) {
    await chmod(path, 0o700);
    return { etat: 'identique', ancienne: old };
  }
  if (old !== null && !(await confirmReplace?.(old))) throw new LauncherNotReplacedError();

  const temp = `${path}.leon-tmp-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(temp, script, { mode: 0o700, flag: 'wx' });
    await chmod(temp, 0o700); // `mode` ne vaut qu'à la création, et le masque (umask) peut en retirer
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  return { etat: old === null ? 'neuf' : 'remplace', ancienne: old };
}

// Efface le lanceur quand plus aucun outil ne l'appelle (`leon retirer-crochets`), puis le dossier bin s'il reste vide.
// Un lien symbolique ou un fichier qui n'a pas le marqueur de Leon n'est pas à lui : il est gardé.
export async function removeLauncher(home: string): Promise<'retire' | 'absent' | 'conserve'> {
  const path = launcherPath(home);
  const info = await statOrNull(path);
  if (!info) return 'absent';
  if (!info.isFile()) return 'conserve';
  const text = await readFile(path, 'utf8').catch(() => '');
  if (!text.split('\n')[1]?.startsWith(MARK)) return 'conserve';
  await unlink(path);
  await rmdir(dirname(path)).catch(() => {}); // pas vide : tant mieux
  return 'retire';
}

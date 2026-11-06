// Les témoins de conversation (T28 et T33 du plan mémoire des sessions) : Cursor et Antigravity reçoivent le bloc de
// démarrage au premier message d'une conversation (beforeSubmitPrompt, PreInvocation), et ces crochets partent à chaque
// message. Le témoin dit que la conversation a déjà reçu son bloc : il n'arrive jamais deux fois.
//
// Un marqueur technique, permis par D31 : `~/.leon/temoins/<outil>/<empreinte de la conversation>`, vide, en 0600. Rien
// de la conversation n'y est écrit, pas même son identifiant en clair. Le rattrapage efface ceux de plus de 7 jours.
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { OUTILS, type Outil } from './hook-commands';

export const TEMOIN_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

const temoinsDir = (home: string, outil: Outil) => join(home, '.leon', 'temoins', outil);

export const temoinPath = (home: string, outil: Outil, conversation: string): string =>
  join(
    temoinsDir(home, outil),
    createHash('sha256').update(conversation).digest('hex').slice(0, 32),
  );

export async function hasTemoin(
  home: string,
  outil: Outil,
  conversation: string,
): Promise<boolean> {
  return lstat(temoinPath(home, outil, conversation)).then(
    () => true,
    () => false,
  );
}

// Pose le témoin. Un échec ne fait qu'exposer à un second bloc : il est ignoré.
export async function writeTemoin(home: string, outil: Outil, conversation: string): Promise<void> {
  const path = temoinPath(home, outil, conversation);
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, '', { mode: 0o600 });
  } catch {
    // rien : au pire, la conversation reçoit son bloc une seconde fois
  }
}

export async function purgeOldTemoins(home: string, now: Date): Promise<void> {
  for (const outil of OUTILS) {
    const directory = temoinsDir(home, outil);
    const names = await readdir(directory).catch(() => [] as string[]);
    for (const name of names) {
      const file = join(directory, name);
      const info = await lstat(file).catch(() => null);
      if (info?.isFile() && now.getTime() - info.mtimeMs > TEMOIN_MAX_AGE_MS) {
        await unlink(file).catch(() => {});
      }
    }
  }
}

// Les témoins de conversation (T28 et T33 du plan mémoire des sessions) : Cursor et Antigravity reçoivent le bloc de
// démarrage au premier message d'une conversation (beforeSubmitPrompt, PreInvocation), et ces crochets partent à chaque
// message. Le témoin dit que la conversation a déjà reçu son bloc : il n'arrive jamais deux fois. Pour Claude Code
// (`leon read-first`, D40, T67), il dit que la session a déjà été arrêtée une fois.
//
// Un marqueur technique, permis par D31 : `~/.leon/temoins/<outil>/<empreinte de la conversation>`, vide, en 0600. Rien
// de la conversation n'y est écrit, pas même son identifiant en clair. Le rattrapage efface ceux de plus de 7 jours, et
// `leon read-first` aussi après un refus : le rattrapage ne tourne pas sur un poste qui n'a que Claude Code.
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { OUTILS } from './hook-commands';

export const TEMOIN_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

// Une liste à part (T67) : OUTILS sert aussi à `leon crochet <outil>`, où claude_code n'a rien à faire.
export const TEMOIN_OUTILS = ['claude_code', ...OUTILS] as const;
export type TemoinOutil = (typeof TEMOIN_OUTILS)[number];

const temoinsDir = (home: string, outil: TemoinOutil) => join(home, '.leon', 'temoins', outil);

export const temoinPath = (home: string, outil: TemoinOutil, conversation: string): string =>
  join(
    temoinsDir(home, outil),
    createHash('sha256').update(conversation).digest('hex').slice(0, 32),
  );

export async function hasTemoin(
  home: string,
  outil: TemoinOutil,
  conversation: string,
): Promise<boolean> {
  return lstat(temoinPath(home, outil, conversation)).then(
    () => true,
    () => false,
  );
}

// Crée le témoin en exclusif (`wx`) et dit si ce passage l'a créé : false s'il existait déjà (deux appels en même temps
// n'en gagnent qu'un) ou s'il ne s'écrit pas (disque plein, droits). D40 : le refus n'a lieu que sur un true.
export async function claimTemoin(
  home: string,
  outil: TemoinOutil,
  conversation: string,
): Promise<boolean> {
  const path = temoinPath(home, outil, conversation);
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, '', { flag: 'wx', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

// Pose le témoin. Un échec ne fait qu'exposer à un second bloc : il est ignoré.
export async function writeTemoin(
  home: string,
  outil: TemoinOutil,
  conversation: string,
): Promise<void> {
  await claimTemoin(home, outil, conversation);
}

export async function purgeOldTemoins(home: string, now: Date): Promise<void> {
  for (const outil of TEMOIN_OUTILS) {
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

// La connexion de cet ordinateur à Leon (K2 du plan « CLI sans clone ») : `~/.leon/connexion.json`, en 0600, écrite par
// `leon login` et effacée par `leon logout`. Elle porte le jeton : il n'est copié nulle part ailleurs.
// Un fichier absent, illisible ou invalide vaut « pas connecté » : l'écriture est atomique, donc un fichier cassé ne
// peut venir que d'une retouche à la main, et aucun message ne recopie ce qu'il contenait.
import { randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { API_TOKEN_PATTERN } from '../capture/api-contract';
import { isAllowedServerUrl } from './server-url';

const ConnectionSchema = z.object({
  url: z.string().refine(isAllowedServerUrl),
  jeton: z.string().regex(API_TOKEN_PATTERN),
  ordinateur: z.string(),
  espace: z.string(),
  cree_le: z.iso.datetime({ offset: true }),
});
export type Connection = z.infer<typeof ConnectionSchema>;

export const connectionPath = (home: string): string => join(home, '.leon', 'connexion.json');

const isSymlink = (path: string) =>
  lstat(path).then(
    (stats) => stats.isSymbolicLink(),
    () => false,
  );

// null : pas connecté (fichier absent, illisible, invalide, ou lien symbolique, que la CLI n'écrit jamais).
export async function readConnection(home: string): Promise<Connection | null> {
  const path = connectionPath(home);
  try {
    if (await isSymlink(path)) return null;
    const parsed = ConnectionSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Écrit dans un fichier voisin en 0600 puis le renomme : un arrêt en cours d'écriture ne laisse jamais une connexion
// coupée, et le jeton n'est jamais lisible par d'autres, même un instant. Refuse un lien symbolique à la place du fichier.
export async function writeConnection(home: string, connection: Connection): Promise<void> {
  const path = connectionPath(home);
  await mkdir(join(home, '.leon'), { recursive: true, mode: 0o700 });
  if (await isSymlink(path)) {
    throw new Error('~/.leon/connexion.json is a symbolic link: Leon does not write through it.');
  }
  const temp = `${path}.leon-tmp-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(temp, `${JSON.stringify(connection, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(temp, 0o600); // `mode` ne vaut qu'à la création, et le masque (umask) peut en retirer
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

// Efface le fichier, valide ou non (se déconnecter doit toujours aboutir). false s'il n'y en avait pas.
export async function clearConnection(home: string): Promise<boolean> {
  try {
    await unlink(connectionPath(home));
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return false;
    throw error;
  }
}

// L'accord local (C7 du plan mémoire des sessions) : `~/.leon/accord.json`, en 0600, une version par outil.
// 0 : retiré, plus rien ne part ; 2 : les gestes de la session ; 3 : en plus le résumé par le fournisseur du modèle ;
// 4 : en plus le prompt envoyé.
// La CLI le relit avant chaque envoi : une CLI mise à jour par `git pull` n'envoie rien de plus que ce que
// l'utilisateur a accepté. Un fichier absent ne vaut aucun accord (les textes partent, comme avant ce chantier) ; un
// fichier présent mais illisible vaut un retrait : il ne peut venir que d'une retouche à la main, l'écriture étant
// atomique, et il ne doit jamais lever une version 0 qu'il portait peut-être.
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { CodeSessionKind } from '../capture/turn';

// Les gestes (C1) partent à partir de cette version : celle qu'écrit l'installateur (install-hooks.ts).
export const FACTS_VERSION = 2;

// Chaque entrée se valide à part : celle d'un autre outil, même retouchée à la main, ne touche pas à celle-ci.
const ConsentFileSchema = z.object({ outils: z.record(z.string(), z.unknown()) });
const EntrySchema = z.object({
  version: z.number().int().nonnegative(),
  installe_le: z.iso.datetime({ offset: true }),
});
const WithdrawnSchema = z.object({ version: z.literal(0) });

export type FactsConsent = { version: number; installe_le: Date };

// Ce que disent les commandes quand l'accord est retiré (leon.ts, briefing.ts).
export const CONSENT_WITHDRAWN_MESSAGE =
  'Leon: your consent for Claude Code was withdrawn (pnpm leon retirer-crochets): nothing is sent. To give it again, run pnpm leon installer-crochets.';

export const consentPath = (home: string): string => join(home, '.leon', 'accord.json');

// Les entrées brutes par outil : {} si le fichier est absent (ENOTDIR : ~/.leon n'est pas un dossier), null s'il est
// présent mais illisible (lecture refusée, pas du JSON, pas d'objet `outils`).
async function readEntries(home: string): Promise<Record<string, unknown> | null> {
  let text: string;
  try {
    text = await readFile(consentPath(home), 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code;
    return code === 'ENOENT' || code === 'ENOTDIR' ? {} : null;
  }
  try {
    const parsed = ConsentFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.outils : null;
  } catch {
    return null;
  }
}

// La version à transmettre avec les faits de cet outil (C2) et la date de l'accord, ou null si l'accord ne couvre
// pas les gestes : seuls les textes partent alors, comme avant ce chantier.
export async function factsConsent(
  home: string,
  tool: CodeSessionKind,
): Promise<FactsConsent | null> {
  const entry = EntrySchema.safeParse((await readEntries(home))?.[tool]);
  if (!entry.success || entry.data.version < FACTS_VERSION) return null;
  return { version: entry.data.version, installe_le: new Date(entry.data.installe_le) };
}

// Version 0 (`leon retirer-crochets`, uninstall-hooks.ts) ou fichier illisible : cet outil n'envoie plus rien, ni
// textes ni gestes. Un outil absent d'un fichier lisible, ou un fichier absent, garde l'envoi des textes d'avant ce
// chantier (C7).
export async function consentWithdrawn(home: string, tool: CodeSessionKind): Promise<boolean> {
  const entries = await readEntries(home);
  return entries === null || WithdrawnSchema.safeParse(entries[tool]).success;
}

// Le retrait est bien écrit : le fichier se lit et l'outil y est en version 0. Sinon, `leon retirer-crochets`
// l'écrit (et répare ainsi un fichier coupé).
export async function withdrawalRecorded(home: string, tool: CodeSessionKind): Promise<boolean> {
  const entries = await readEntries(home);
  return entries !== null && WithdrawnSchema.safeParse(entries[tool]).success;
}

// Reste-t-il un outil dont l'accord n'est pas retiré ? Le lanceur ~/.leon/bin/leon n'est effacé (`leon
// retirer-crochets`) qu'avec le dernier. Dans le doute, vrai : une entrée hors schéma ou un fichier illisible comptent
// comme un outil encore installé, pour ne jamais effacer le lanceur sous des crochets en place.
export async function anyToolInstalled(home: string): Promise<boolean> {
  const entries = await readEntries(home);
  return (
    entries === null ||
    Object.values(entries).some((entry) => !WithdrawnSchema.safeParse(entry).success)
  );
}

// Pose la version d'un outil et garde telles quelles les entrées des autres ; un fichier illisible est réécrit avec
// ce seul outil. Écrit dans un fichier voisin en 0600 puis le renomme : un arrêt en cours d'écriture ne laisse
// jamais un accord coupé. (writeAtomically d'install-hooks.ts ferait de même, mais ce module-là importe celui-ci.)
export async function writeConsent(
  home: string,
  tool: CodeSessionKind,
  version: number,
  now: Date = new Date(),
): Promise<void> {
  const outils = {
    ...(await readEntries(home)),
    [tool]: { version, installe_le: now.toISOString() },
  };
  const path = consentPath(home);
  await mkdir(join(home, '.leon'), { recursive: true, mode: 0o700 });
  const temp = `${path}.leon-tmp-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(temp, `${JSON.stringify({ outils }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(temp, 0o600); // `mode` ne vaut qu'à la création, et le masque (umask) peut en retirer
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

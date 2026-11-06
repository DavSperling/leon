// Le rattrapage des outils hors Claude Code (T19 du plan mémoire des sessions) : `leon rattraper`, lancé en tâche
// détachée au démarrage de tout outil (detach.ts). Il relit les fichiers de session modifiés depuis leur dernière
// capture réussie (le curseur de capture-session.ts) : une session Codex quittée par `/quit` (pas de SessionEnd), ou
// dont un Stop a échoué, part ainsi au démarrage suivant.
//
// Bornes (vigilance 4 du plan) : seuls les outils dont l'accord local porte la capture (`capture_le`, consent.ts) sont
// lus, et seulement leurs fichiers modifiés après cette date. Sans cet accord, aucun fichier de l'outil n'est même
// ouvert : ni des crochets de Leon recopiés dans Codex, ni un accord du lot 4 (le bloc de démarrage seul) ne font rien
// lire. Le rattrapage de Claude Code reste `leon import-claude-code`, comme avant ce chantier.
//
// Ici aussi l'entrée du crochet de fin de Codex, que le lanceur copie dans `~/.leon/entrees/` avant de rendre la main
// (launcher.ts) : `leon crochet codex fin --entree <fichier>` la lit puis l'efface, même en cas d'erreur, et le
// rattrapage efface celles de plus de 24 h qu'un arrêt aurait laissées.
import { lstat, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { captureToolFile, readCursor, type ToolCaptureDeps } from './capture-session';
import { CONSENT_WITHDRAWN_MESSAGE, consentWithdrawn, factsConsent } from './consent';
import { OUTILS, type Outil } from './hook-commands';
import {
  type FactsSender,
  IDLE_MS,
  type ImportDeps,
  TokenRefusedError,
} from './import-claude-code';
import { ADAPTATEURS } from './outils';

export const entriesDir = (home: string): string => join(home, '.leon', 'entrees');
export const ENTRY_MAX_AGE_MS = 24 * 60 * 60_000;
// L'entrée d'un crochet tient en quelques centaines d'octets : au-delà, ce n'est pas elle.
const ENTRY_MAX_BYTES = 64 * 1024;

// L'entrée copiée par le lanceur : lue, puis effacée, même en cas d'erreur. Seul un fichier ordinaire de
// `~/.leon/entrees/` se lit et s'efface : un autre chemin passé à `--entree` rend une entrée vide, sans rien toucher.
export async function readEntryFile(home: string, path: string): Promise<string> {
  const file = resolve(path);
  if (dirname(file) !== resolve(entriesDir(home))) return '';
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.size > ENTRY_MAX_BYTES) return '';
    return await readFile(file, 'utf8');
  } catch {
    return '';
  } finally {
    await unlink(file).catch(() => {});
  }
}

// Efface les entrées de plus de 24 h : celles d'un crochet de fin arrêté avant de les lire.
export async function purgeOldEntries(home: string, now: Date): Promise<void> {
  const directory = entriesDir(home);
  const names = await readdir(directory).catch(() => [] as string[]);
  for (const name of names) {
    const file = join(directory, name);
    const info = await lstat(file).catch(() => null);
    if (info?.isFile() && now.getTime() - info.mtimeMs > ENTRY_MAX_AGE_MS) {
      await unlink(file).catch(() => {});
    }
  }
}

// Les outils dont l'accord porte la capture : ceux que le rattrapage lit. Le démarrage n'en lance un que s'il y en a.
export async function captureTools(home: string): Promise<Outil[]> {
  const tools: Outil[] = [];
  for (const outil of OUTILS) {
    if ((await factsConsent(home, outil))?.capture_le) tools.push(outil);
  }
  return tools;
}

// Un seul rattrapage à la fois : deux sessions ouvertes ensemble en lancent deux. Un verrou de plus de 10 min est
// celui d'un rattrapage arrêté.
const LOCK_STALE_MS = 10 * 60_000;
const lockPath = (home: string) => join(home, '.leon', 'curseurs', 'rattrapage.verrou');

async function takeLock(home: string, now: Date): Promise<boolean> {
  const path = lockPath(home);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, now.toISOString(), { flag: 'wx', mode: 0o600 });
    return true;
  } catch {
    const info = await stat(path).catch(() => null);
    if (info && now.getTime() - info.mtimeMs < LOCK_STALE_MS) return false;
    await writeFile(path, now.toISOString(), { mode: 0o600 });
    return true;
  }
}

export type CatchUpDeps = Omit<ToolCaptureDeps, 'facts'> & {
  env: Record<string, string | undefined>;
  now: () => Date;
  sendFacts: FactsSender;
};

export type CatchUpSummary = { sessions: number; failures: number };

// Le rattrapage de tous les outils qui l'ont accepté. Un jeton refusé l'arrête.
export async function catchUp(deps: CatchUpDeps): Promise<CatchUpSummary> {
  const summary: CatchUpSummary = { sessions: 0, failures: 0 };
  const now = deps.now();
  await purgeOldEntries(deps.home, now);
  const tools = await captureTools(deps.home);
  if (tools.length === 0 || !(await takeLock(deps.home, now))) return summary;
  try {
    for (const outil of tools) await catchUpTool(outil, deps, summary);
  } finally {
    await unlink(lockPath(deps.home)).catch(() => {});
  }
  return summary;
}

async function catchUpTool(outil: Outil, deps: CatchUpDeps, summary: CatchUpSummary) {
  const consent = await factsConsent(deps.home, outil);
  const since = consent?.capture_le;
  if (!consent || !since) return;
  for (const file of await ADAPTATEURS[outil].trouver(deps.home, deps.env)) {
    // L'accord retiré en cours de route (`leon retirer-crochets`) arrête tout de suite.
    if (await consentWithdrawn(deps.home, outil)) throw new Error(CONSENT_WITHDRAWN_MESSAGE);
    if (file.mtimeMs < since.getTime()) continue;
    const cursor = await readCursor(deps.home, outil, file.path);
    if (cursor && cursor.mtime === file.mtimeMs && cursor.taille === file.size) continue;
    // Comme l'import de Claude Code : un usage ne part qu'avec les fichiers modifiés après sa date.
    const usages = consent.usages.filter(
      (usage) => file.mtimeMs >= (consent.usages_le[usage]?.getTime() ?? 0),
    );
    const facts: ImportDeps['facts'] = {
      accord: consent.version,
      usages,
      send: deps.sendFacts,
    };
    try {
      const fin = deps.now().getTime() - file.mtimeMs >= IDLE_MS;
      if ((await captureToolFile(outil, file.path, { fin }, { ...deps, facts })) === 'capte') {
        summary.sessions += 1;
      }
    } catch (error) {
      if (error instanceof TokenRefusedError) throw error;
      summary.failures += 1;
    }
  }
}

// L'accord local (C7 révisé du plan de la mémoire à disposition) : `~/.leon/accord.json`, en 0600, une entrée par
// outil, `{ version, installe_le, usages?, refus? }`. La version 2 (les gestes de la session) est la base, et la
// version 0 le retrait : plus rien ne part. 3 et 4, l'ancienne échelle, ne sont plus écrites. Le reste s'ajoute par
// usage (`usages`, chacun accepté à part, avec sa date : `resume`, puis `lecture`, `rappel`, `coulisses`, `noter`) ; un
// usage absent vaut refus. `refus` date les usages refusés, qui ne sont plus proposés (A16) ; il n'ouvre rien. Le
// retrait efface usages et refus. Une entrée du lot 1, sans `usages`, garde son accord.
// `capture_le` (T19 du plan mémoire des sessions) date l'accord de capture d'un outil hors Claude Code : ses échanges et
// ses gestes partent à chaque tour et au rattrapage. L'accord du lot 4 de Codex ne couvrait que le bloc de démarrage
// (« Nothing is captured from Codex sessions for now ») : sans `capture_le`, rien n'est capté de cet outil, et le
// rattrapage ne lit que les fichiers modifiés après cette date. Claude Code n'en a pas besoin : sa capture date du
// lot 1. Le retrait l'efface, comme le reste.
// Ce que le serveur de la connexion a appris des retraits (POST /api/v1/retrait, T43) s'écrit à part, dans
// `~/.leon/retraits-serveur.json` : pour chaque outil, la date (`installe_le`) de l'entrée en version 0 dont il a appris
// le retrait. Le rattrapage, lancé en tâche de fond, l'écrit : il ne réécrit donc jamais accord.json, qu'une commande de
// retrait écrit peut-être au même moment. Un retrait dont la date n'y est pas est en attente : la commande de retrait ou
// le rattrapage le redit. Un nouvel accord (writeConsent) met fin à l'attente sans que le serveur l'ait appris : `leon
// setup` et `installer-crochets` le disent donc d'abord (tellBeforeConsent, uninstall-hooks.ts) ; un retrait suivant a
// une autre date. Ce fichier illisible ne vaut rien : le serveur réapprend ce qu'il savait.
// La CLI le relit avant chaque envoi : une CLI mise à jour par `git pull` n'envoie rien de plus que ce que
// l'utilisateur a accepté. Un fichier absent ne vaut aucun accord (les textes partent, comme avant ce chantier) ; un
// fichier présent mais illisible vaut un retrait : il ne peut venir que d'une retouche à la main, l'écriture étant
// atomique, et il ne doit jamais lever une version 0 qu'il portait peut-être.
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { DatePosteSchema, USAGES, type Usage } from '../capture/api-contract';
import { CODE_SESSION_KINDS, type CodeSessionKind } from '../capture/turn';
import type { Outil } from './hook-commands';

// Les outils qui ont une entrée : ceux que Leon capte, et ceux dont il pose seulement les crochets (Codex au lot 4).
export type ConsentTool = CodeSessionKind | Outil;

// Les gestes (C1) partent à partir de cette version : celle qu'écrit l'installateur (install-hooks.ts).
export const FACTS_VERSION = 2;

// Chaque entrée se valide à part : celle d'un autre outil, même retouchée à la main, ne touche pas à celle-ci. Des
// usages ou des refus illisibles (retouchés à la main) n'en donnent aucun, sans faire perdre l'accord de base ni le
// reste.
const ConsentFileSchema = z.object({ outils: z.record(z.string(), z.unknown()) });
const DatedSchema = z
  .record(z.string(), z.iso.datetime({ offset: true }))
  .optional()
  .catch(undefined);
const EntrySchema = z.object({
  version: z.number().int().nonnegative(),
  // Elle part en `accord_le` : une date que Postgres refuse rend l'accord illisible, au lieu d'un 400 à chaque envoi.
  installe_le: DatePosteSchema,
  usages: DatedSchema,
  refus: DatedSchema,
  capture_le: z.iso.datetime({ offset: true }).optional().catch(undefined),
});
const WithdrawnSchema = z.object({ version: z.literal(0) });

// `usages_le` : la date de chaque usage accepté ; au rattrapage, un usage ne part qu'avec les sessions modifiées après
// elle (import-claude-code.ts). `refus` : les usages refusés, que l'installateur ne propose plus.
export type FactsConsent = {
  version: number;
  installe_le: Date;
  usages: Usage[];
  usages_le: Partial<Record<Usage, Date>>;
  refus: Usage[];
  // L'accord de capture (outils hors Claude Code), absent s'il n'a pas été donné.
  capture_le?: Date;
};

// Ce que disent les commandes quand l'accord est retiré (leon.ts, briefing.ts, uninstall-hooks.ts), juste pour les deux
// formes de Leon : installée, la commande est `leon setup` par le lanceur ~/.leon/bin/leon, que `retirer-crochets` efface
// avec le dernier outil (la commande d'installation le remet) ; depuis un clone, c'est `installer-crochets`.
export const CONSENT_AGAIN_HINT =
  'To give it again, run `~/.leon/bin/leon setup` (if that file is gone, run the install command of Leon again: `curl -fsSL <address of Leon>/install | sh`; from a Leon clone: `pnpm leon installer-crochets`).';
export const CONSENT_WITHDRAWN_MESSAGE = `Leon: your consent for Claude Code was withdrawn (\`leon retirer-crochets\`): nothing is sent. ${CONSENT_AGAIN_HINT}`;

export const consentPath = (home: string): string => join(home, '.leon', 'accord.json');
export const serverWithdrawalsPath = (home: string): string =>
  join(home, '.leon', 'retraits-serveur.json');

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

// La version à transmettre avec les faits de cet outil (C2), la date de l'accord et ses usages connus, ou null si
// l'accord ne couvre pas les gestes : seuls les textes partent alors, comme avant ce chantier.
export async function factsConsent(home: string, tool: ConsentTool): Promise<FactsConsent | null> {
  const entry = EntrySchema.safeParse((await readEntries(home))?.[tool]);
  if (!entry.success || entry.data.version < FACTS_VERSION) return null;
  const usages = USAGES.filter((usage) => entry.data.usages?.[usage] !== undefined);
  return {
    version: entry.data.version,
    installe_le: new Date(entry.data.installe_le),
    usages,
    usages_le: Object.fromEntries(
      usages.map((usage) => [usage, new Date(entry.data.usages?.[usage] ?? 0)]),
    ),
    refus: USAGES.filter((usage) => entry.data.refus?.[usage] !== undefined),
    ...(entry.data.capture_le ? { capture_le: new Date(entry.data.capture_le) } : {}),
  };
}

// Version 0 (`leon retirer-crochets`, uninstall-hooks.ts) ou fichier illisible : cet outil n'envoie plus rien, ni
// textes ni gestes. Un outil absent d'un fichier lisible, ou un fichier absent, garde l'envoi des textes d'avant ce
// chantier (C7).
export async function consentWithdrawn(home: string, tool: ConsentTool): Promise<boolean> {
  const entries = await readEntries(home);
  return entries === null || WithdrawnSchema.safeParse(entries[tool]).success;
}

// Le retrait est bien écrit : le fichier se lit et l'outil y est en version 0. Sinon, `leon retirer-crochets`
// l'écrit (et répare ainsi un fichier coupé).
export async function withdrawalRecorded(home: string, tool: ConsentTool): Promise<boolean> {
  const entries = await readEntries(home);
  return entries !== null && WithdrawnSchema.safeParse(entries[tool]).success;
}

// Les retraits que le serveur a appris, `{ outil: date du retrait }` : {} si le fichier est absent ou illisible.
async function readServerWithdrawals(home: string): Promise<Record<string, unknown>> {
  try {
    const parsed = ConsentFileSchema.safeParse(
      JSON.parse(await readFile(serverWithdrawalsPath(home), 'utf8')),
    );
    return parsed.success ? parsed.data.outils : {};
  } catch {
    return {};
  }
}

// La date d'un retrait : l'`installe_le` que writeConsent pose aussi en version 0 ('' sur une entrée retouchée à la main).
const withdrawalDate = (entry: unknown): string => {
  const date = (entry as { installe_le?: unknown }).installe_le;
  return typeof date === 'string' ? date : '';
};

// La date d'un retrait à dire au serveur (`retire_le`, T43, le retrait daté) : celle de l'entrée en version 0 de cet
// outil, relue au moment d'envoyer ; null s'il n'est plus en version 0 (un nouvel accord est écrit). Une date absente,
// illisible ou que Postgres refuse (retouchée à la main) vaut l'heure du moment : le retrait part quand même. Une date à
// venir aussi, mesurée par la même horloge : le serveur la garderait (greatest) et fermerait ce jeton au-delà d'un
// nouvel accord. `entree` : la date de l'entrée telle quelle, que recordServerWithdrawal note une fois le retrait
// appris.
export async function withdrawalToTell(
  home: string,
  tool: CodeSessionKind,
  now: Date = new Date(),
): Promise<{ retireLe: string; entree: string } | null> {
  const entries = await readEntries(home);
  if (entries === null || !WithdrawnSchema.safeParse(entries[tool]).success) return null;
  const entree = withdrawalDate(entries[tool]);
  const date = DatePosteSchema.safeParse(entree);
  const retireLe = date.success && new Date(date.data) <= now ? date.data : now.toISOString();
  return { retireLe, entree };
}

// Les outils retirés (version 0) dont le serveur n'a pas encore appris le retrait. Un accord illisible n'en donne
// aucun : il vaut un retrait sur le poste, sans dire de quels outils.
export async function pendingServerWithdrawals(home: string): Promise<CodeSessionKind[]> {
  const entries = await readEntries(home);
  if (entries === null) return [];
  const learned = await readServerWithdrawals(home);
  return CODE_SESSION_KINDS.filter(
    (tool) =>
      WithdrawnSchema.safeParse(entries[tool]).success &&
      learned[tool] !== withdrawalDate(entries[tool]),
  );
}

// Note que le serveur a appris le retrait de cet outil daté `entree` (celui que withdrawalToTell a lu pour l'envoyer),
// seulement si c'est encore lui : un nouvel accord, ou un nouveau retrait, écrit entre l'envoi et sa réponse reste en
// attente. accord.json n'est que lu.
export async function recordServerWithdrawal(
  home: string,
  tool: CodeSessionKind,
  entree: string,
): Promise<void> {
  const entries = await readEntries(home);
  if (entries === null || !WithdrawnSchema.safeParse(entries[tool]).success) return;
  if (withdrawalDate(entries[tool]) !== entree) return;
  await writeEntries(
    home,
    { ...(await readServerWithdrawals(home)), [tool]: entree },
    serverWithdrawalsPath(home),
  );
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

// Écrit dans un fichier voisin en 0600 puis le renomme : un arrêt en cours d'écriture ne laisse jamais un accord coupé.
// (writeAtomically d'install-hooks.ts ferait de même, mais ce module-là importe celui-ci.)
async function writeEntries(
  home: string,
  outils: Record<string, unknown>,
  path = consentPath(home),
): Promise<void> {
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

// Pose la version d'un outil, sans usage ni refus : le retrait (version 0) les efface donc tous. Garde telles quelles
// les entrées des autres ; un fichier illisible est réécrit avec ce seul outil.
export async function writeConsent(
  home: string,
  tool: ConsentTool,
  version: number,
  now: Date = new Date(),
): Promise<void> {
  await writeEntries(home, {
    ...(await readEntries(home)),
    [tool]: { version, installe_le: now.toISOString() },
  });
}

// Ajoute un usage, daté, aux usages acceptés (`usages`) ou refusés (`refus`) de cet outil, sans toucher au reste de
// son entrée : ni à sa version, ni à sa date, qui borne le rattrapage (`depuis`, import-claude-code.ts). Seulement sur
// un accord qui couvre les gestes : sans lui, rien n'est écrit et l'appel échoue.
async function addDated(
  home: string,
  tool: ConsentTool,
  field: 'usages' | 'refus',
  usage: Usage,
  now: Date,
): Promise<void> {
  const entries = await readEntries(home);
  const entry = EntrySchema.safeParse(entries?.[tool]);
  if (entries === null || !entry.success || entry.data.version < FACTS_VERSION) {
    throw new Error(`no consent for ${tool} to record the usage ${usage} in`);
  }
  await writeEntries(home, {
    ...entries,
    [tool]: {
      ...(entries[tool] as object),
      [field]: { ...entry.data[field], [usage]: now.toISOString() },
    },
  });
}

// L'accord de capture d'un outil hors Claude Code (`capture_le`), daté, sans toucher au reste de son entrée. Comme
// addDated : seulement sur un accord qui couvre les gestes ; une date déjà là est gardée (elle borne le rattrapage).
export async function recordCapture(
  home: string,
  tool: ConsentTool,
  now: Date = new Date(),
): Promise<void> {
  const entries = await readEntries(home);
  const entry = EntrySchema.safeParse(entries?.[tool]);
  if (entries === null || !entry.success || entry.data.version < FACTS_VERSION) {
    throw new Error(`no consent for ${tool} to record the capture in`);
  }
  if (entry.data.capture_le) return;
  await writeEntries(home, {
    ...entries,
    [tool]: { ...(entries[tool] as object), capture_le: now.toISOString() },
  });
}

export const addUsage = (home: string, tool: ConsentTool, usage: Usage, now = new Date()) =>
  addDated(home, tool, 'usages', usage, now);

// Un refus (C7 révisé, A16) : l'usage n'est plus proposé, jusqu'au retrait.
export const addRefusal = (home: string, tool: ConsentTool, usage: Usage, now = new Date()) =>
  addDated(home, tool, 'refus', usage, now);

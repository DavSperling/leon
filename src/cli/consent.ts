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
// `retrait_serveur_le` (T43), sur une entrée en version 0 seulement : la date où le serveur de la connexion a appris le
// retrait (POST /api/v1/retrait). Sans elle, la commande de retrait ou le rattrapage le lui redit ; un nouvel accord
// (writeConsent) réécrit l'entrée et l'efface.
// La CLI le relit avant chaque envoi : une CLI mise à jour par `git pull` n'envoie rien de plus que ce que
// l'utilisateur a accepté. Un fichier absent ne vaut aucun accord (les textes partent, comme avant ce chantier) ; un
// fichier présent mais illisible vaut un retrait : il ne peut venir que d'une retouche à la main, l'écriture étant
// atomique, et il ne doit jamais lever une version 0 qu'il portait peut-être.
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { USAGES, type Usage } from '../capture/api-contract';
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
  installe_le: z.iso.datetime({ offset: true }),
  usages: DatedSchema,
  refus: DatedSchema,
  capture_le: z.iso.datetime({ offset: true }).optional().catch(undefined),
});
const WithdrawnSchema = z.object({ version: z.literal(0) });
const UntoldSchema = WithdrawnSchema.extend({ retrait_serveur_le: z.undefined().optional() });

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

// Les outils retirés (version 0) dont le serveur n'a pas encore appris le retrait. Un fichier illisible n'en donne
// aucun : il vaut un retrait sur le poste, sans dire de quels outils.
export async function pendingServerWithdrawals(home: string): Promise<CodeSessionKind[]> {
  const entries = await readEntries(home);
  if (entries === null) return [];
  return CODE_SESSION_KINDS.filter((tool) => UntoldSchema.safeParse(entries[tool]).success);
}

// Date la réponse du serveur au retrait, seulement sur une entrée encore en version 0 : un nouvel accord écrit entre
// l'envoi et sa réponse est gardé tel quel.
export async function recordServerWithdrawal(
  home: string,
  tool: CodeSessionKind,
  now: Date = new Date(),
): Promise<void> {
  const entries = await readEntries(home);
  if (entries === null || !WithdrawnSchema.safeParse(entries[tool]).success) return;
  await writeEntries(home, {
    ...entries,
    [tool]: { ...(entries[tool] as object), retrait_serveur_le: now.toISOString() },
  });
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
async function writeEntries(home: string, outils: Record<string, unknown>): Promise<void> {
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

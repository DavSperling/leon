// L'accord local (C7 du plan mémoire des sessions) : `~/.leon/accord.json`, en 0600, une version par outil.
// 2 : les gestes de la session ; 3 : en plus le résumé par le fournisseur du modèle ; 4 : en plus le prompt envoyé.
// La CLI le relit avant chaque envoi : une CLI mise à jour par `git pull` n'envoie rien de plus que ce que
// l'utilisateur a accepté. Un fichier absent ou illisible ne vaut aucun accord.
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { CODE_SESSION_KINDS } from '../capture/turn';

type CodeTool = (typeof CODE_SESSION_KINDS)[number];

// Les gestes (C1) partent à partir de cette version : celle qu'écrit l'installateur (install-hooks.ts).
export const FACTS_VERSION = 2;

const ConsentSchema = z.object({
  outils: z.record(
    z.string(),
    z.object({ version: z.number().int().nonnegative(), installe_le: z.iso.datetime() }),
  ),
});
type Consent = z.infer<typeof ConsentSchema>;

export const consentPath = (home: string): string => join(home, '.leon', 'accord.json');

async function readConsent(home: string): Promise<Consent> {
  try {
    const parsed = ConsentSchema.safeParse(JSON.parse(await readFile(consentPath(home), 'utf8')));
    if (parsed.success) return parsed.data;
  } catch {
    // absent, illisible ou pas du JSON : aucun accord
  }
  return { outils: {} };
}

// La version à transmettre avec les faits de cet outil (C2), ou null si l'accord ne couvre pas les gestes : seuls
// les textes partent alors, comme avant ce chantier.
export async function factsConsent(home: string, tool: CodeTool): Promise<number | null> {
  const version = (await readConsent(home)).outils[tool]?.version ?? 0;
  return version >= FACTS_VERSION ? version : null;
}

// Pose la version d'un outil sans toucher aux autres. Le fichier repasse en 0600 même s'il existait avec plus de
// droits (`mode` ne vaut qu'à la création).
export async function writeConsent(
  home: string,
  tool: CodeTool,
  version: number,
  now: Date = new Date(),
): Promise<void> {
  const consent = await readConsent(home);
  consent.outils[tool] = { version, installe_le: now.toISOString() };
  const path = consentPath(home);
  await mkdir(join(home, '.leon'), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(consent, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

import { execFileSync } from 'node:child_process';
import { z } from 'zod';

const VersionSchema = z.object({ commit: z.string().nullable() });

export const gitHead = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
export const srcModifie = () =>
  execFileSync('git', ['status', '--porcelain', '--', 'src'], { encoding: 'utf8' }).trim() !== '';

// Null si le serveur traite les runs avec le code de HEAD ; sinon la raison du refus (piège du 14/10 :
// le worker ne recharge pas le code à chaud, un passage a été facturé sur l'ancien code).
export async function verifierServeur(input: {
  fetch: typeof fetch;
  url: string;
  head: string;
  srcModifie: boolean;
}): Promise<string | null> {
  if (input.srcModifie)
    return 'Modifications non commitées sous src/ : commite-les (WIP) pour que le passage corresponde à un commit.';
  let commit: string | null;
  try {
    const response = await input.fetch(new URL('/api/version', input.url));
    commit = VersionSchema.parse(await response.json()).commit;
  } catch {
    return `Serveur Leon injoignable sur ${input.url} (lance « pnpm dev » ou règle LEON_URL).`;
  }
  if (commit === null)
    return "Le serveur n'a pas de commit (production ou hors dépôt Git) : lance « pnpm dev ».";
  if (commit.endsWith('-dirty'))
    return 'Le serveur a démarré avec des modifications non commitées : commite-les puis redémarre-le.';
  if (commit !== input.head)
    return `Le serveur a démarré sur ${commit.slice(0, 7)}, HEAD est ${input.head.slice(0, 7)} : redémarre-le.`;
  return null;
}

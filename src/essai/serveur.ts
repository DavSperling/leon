import { execFileSync } from 'node:child_process';
import { z } from 'zod';

// Modèle de chaque étape du serveur, « fournisseur:modèle » (voir src/server/llm/config.ts).
export const LlmServeurSchema = z.object({
  triage: z.string(),
  extraction: z.string(),
  placement: z.string(),
});
export type LlmServeur = z.infer<typeof LlmServeurSchema>;

const VersionSchema = z.object({
  commit: z.string().nullable(),
  llm: LlmServeurSchema.nullable().optional(),
});

export const gitHead = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
export const srcModifie = () =>
  execFileSync('git', ['status', '--porcelain', '--', 'src', 'essai'], {
    encoding: 'utf8',
  }).trim() !== '';

// Les modèles du serveur s'il traite les runs avec le code de HEAD ; sinon la raison du refus (piège du
// 14/10 : le worker ne recharge pas le code à chaud, un passage a été facturé sur l'ancien code).
// Les modèles viennent du serveur, pas du code : ils changent par variable d'environnement, sans commit.
export async function verifierServeur(input: {
  fetch: typeof fetch;
  url: string;
  head: string;
  srcModifie: boolean;
}): Promise<{ refus: string } | { llm: LlmServeur }> {
  const resultat = await refusServeur(input);
  return typeof resultat === 'string' ? { refus: resultat } : resultat;
}

async function refusServeur(input: {
  fetch: typeof fetch;
  url: string;
  head: string;
  srcModifie: boolean;
}): Promise<string | { llm: LlmServeur }> {
  if (input.srcModifie)
    return 'Modifications non commitées sous src/ ou essai/ : commite-les (WIP) pour que le passage corresponde à un commit.';
  let response: Response;
  try {
    response = await input.fetch(new URL('/api/version', input.url), {
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return `Serveur Leon injoignable sur ${input.url} (lance « pnpm dev » ou règle LEON_URL).`;
  }
  if (!response.ok)
    return `Le serveur sur ${input.url} répond ${response.status} à /api/version : redémarre-le sur HEAD.`;
  let commit: string | null;
  let llm: LlmServeur | null | undefined;
  try {
    ({ commit, llm } = VersionSchema.parse(await response.json()));
  } catch {
    return `Réponse inattendue de ${input.url}/api/version : redémarre le serveur sur HEAD.`;
  }
  if (commit === null)
    return "Le serveur n'a pas de commit (production ou hors dépôt Git) : lance « pnpm dev ».";
  if (commit.endsWith('-dirty'))
    return 'Le serveur a démarré avec des modifications non commitées : commite-les puis redémarre-le.';
  if (commit !== input.head)
    return `Le serveur a démarré sur ${commit.slice(0, 7)}, HEAD est ${input.head.slice(0, 7)} : redémarre-le.`;
  if (!llm) return 'Le serveur ne donne pas ses modèles dans /api/version : redémarre-le sur HEAD.';
  return { llm };
}

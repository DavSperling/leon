import { z } from 'zod';

// Liste publique des modèles d'OpenRouter (gratuite, sans clé) : on y lit, au démarrage, quels modèles
// règlent un effort de raisonnement et leurs prix, pour annoncer le coût d'un passage du jeu d'essai.
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

const TIMEOUT_MS = 10_000;

export type OpenRouterModelInfo = {
  reasoning: boolean; // accepte le paramètre reasoning (effort)
  promptUsdPerToken: number | null;
  completionUsdPerToken: number | null;
};
export type OpenRouterCatalog = Map<string, OpenRouterModelInfo>;

const price = z
  .string()
  .optional()
  .transform((value) => {
    const n = Number(value);
    return value === undefined || !Number.isFinite(n) ? null : n;
  });

const ModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      supported_parameters: z.array(z.string()).nullish(),
      pricing: z.object({ prompt: price, completion: price }).nullish(),
    }),
  ),
});

// Null si la liste est injoignable ou illisible : à l'appelant de décider (config.ts prévient et
// n'envoie alors aucun réglage de raisonnement).
export async function fetchOpenRouterCatalog(
  doFetch: typeof fetch,
): Promise<OpenRouterCatalog | null> {
  try {
    const response = await doFetch(OPENROUTER_MODELS_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const { data } = ModelsSchema.parse(await response.json());
    return new Map(
      data.map((m) => [
        m.id,
        {
          reasoning: m.supported_parameters?.includes('reasoning') ?? false,
          promptUsdPerToken: m.pricing?.prompt ?? null,
          completionUsdPerToken: m.pricing?.completion ?? null,
        },
      ]),
    );
  } catch {
    return null;
  }
}

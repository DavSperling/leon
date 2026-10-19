import { API_PATHS, BriefingResponseSchema } from '../capture/api-contract';
import type { ServerEnv } from './env';

const TIMEOUT_MS = 3000;

// Un 404 n'est ni un jeton refusé ni un serveur injoignable : ce serveur n'a pas la route du point du matin.
export class BriefingRouteMissingError extends Error {
  constructor() {
    super('ce serveur ne prépare pas encore de point du matin (route absente).');
  }
}

// Le hook SessionStart ne doit jamais bloquer une session : toute défaillance donne null, sauf la route absente,
// que la commande doit pouvoir dire (elle sort quand même avec le code 0).
export async function fetchBriefingText(
  fetchImpl: typeof fetch,
  env: ServerEnv,
): Promise<string | null> {
  try {
    const response = await fetchImpl(new URL(API_PATHS.briefing, env.url), {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) throw new BriefingRouteMissingError();
    if (!response.ok) return null;
    const parsed = BriefingResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.markdown : null;
  } catch (error) {
    if (error instanceof BriefingRouteMissingError) throw error;
    return null;
  }
}

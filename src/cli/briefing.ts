import { API_PATHS, BriefingResponseSchema } from '../capture/api-contract';
import type { ServerEnv } from './env';

const TIMEOUT_MS = 3000;

// Le hook SessionStart ne doit jamais bloquer une session : toute défaillance donne null.
export async function fetchBriefingText(
  fetchImpl: typeof fetch,
  env: ServerEnv,
): Promise<string | null> {
  try {
    const response = await fetchImpl(new URL(API_PATHS.briefing, env.url), {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = BriefingResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.markdown : null;
  } catch {
    return null;
  }
}

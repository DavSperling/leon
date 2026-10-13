import { env } from '@/server/env';

// D10 : BETTER_AUTH_URL est l'URL publique de l'app.
export function cardUrl(cardId: string): string {
  return new URL(`/fiches/${cardId}`, env.BETTER_AUTH_URL).toString();
}

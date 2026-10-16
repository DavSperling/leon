import { env } from '@/server/env';

// BETTER_AUTH_URL est l'URL publique de l'app, comme pour cardUrl.
export function taskUrl(ref: string): string {
  return new URL(`/taches/${ref}`, env.BETTER_AUTH_URL).toString();
}

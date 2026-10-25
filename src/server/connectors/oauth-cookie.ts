import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import { env } from '@/server/env';

// Le cookie de l'aller-retour chez l'éditeur : ce qu'il faut pour terminer le branchement au retour.
// Signé (HMAC-SHA256 avec BETTER_AUTH_SECRET), pas chiffré : il ne porte aucun secret d'appli, et
// le vérificateur PKCE ne sert qu'avec le secret de l'appli.

export const OAUTH_COOKIE = 'leon_oauth';
export const OAUTH_COOKIE_PATH = '/api/v1/connexions/oauth';
export const OAUTH_COOKIE_MAX_AGE = 600; // secondes

export type OAuthPending = {
  provider: ProviderId;
  userId: string;
  tenantId: string;
  state: string;
  verifier: string | null;
  since: '7' | '30' | '90' | '365';
  preFields: Record<string, unknown>;
  reconnectId: string | null;
  createdAt: number; // millisecondes depuis 1970
  // Branchement par Pipedream : l'utilisateur Pipedream de la personne.
  pipedreamUser?: string;
};

const PendingSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  userId: z.string(),
  tenantId: z.string(),
  state: z.string(),
  verifier: z.string().nullable(),
  since: z.enum(['7', '30', '90', '365']),
  preFields: z.record(z.string(), z.unknown()),
  reconnectId: z.string().nullable(),
  createdAt: z.number(),
  pipedreamUser: z.string().optional(),
});

const sign = (body: string) =>
  createHmac('sha256', env.BETTER_AUTH_SECRET).update(body).digest('base64url');

export function sealPending(pending: OAuthPending): string {
  const body = Buffer.from(JSON.stringify(pending)).toString('base64url');
  return `${body}.${sign(body)}`;
}

// null : signature fausse, contenu illisible, ou plus de 10 minutes.
export function openPending(cookie: string, now: number): OAuthPending | null {
  const [body, signature, ...rest] = cookie.split('.');
  if (!body || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = PendingSchema.safeParse(value);
  if (!parsed.success) return null;
  const age = now - parsed.data.createdAt;
  return age >= 0 && age <= OAUTH_COOKIE_MAX_AGE * 1000 ? parsed.data : null;
}

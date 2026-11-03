import type { Context, MiddlewareHandler } from 'hono';
import { verifyApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';

export type ApiEnv = { Variables: { ctx: TenantContext; tokenId: string } };

export const BEARER = /^Bearer\s+(\S+)$/i;

// Le seul 401 des routes à jeton : il ne dit pas ce qui a manqué (jeton absent, inconnu, révoqué, membre parti…).
export function unauthorized(c: Context) {
  c.header('WWW-Authenticate', 'Bearer');
  return c.json({ error: 'Missing or invalid token' }, 401);
}

// Jeton personnel en Bearer ; le jeton n'est jamais journalisé ni renvoyé.
export const requireApiToken: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const token = BEARER.exec(c.req.header('Authorization') ?? '')?.[1];
  const verified = token ? await verifyApiToken(token) : null;
  if (!verified) return unauthorized(c);
  c.set('ctx', verified.ctx);
  c.set('tokenId', verified.tokenId);
  await next();
};

import type { MiddlewareHandler } from 'hono';
import { verifyApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';

export type ApiEnv = { Variables: { ctx: TenantContext; tokenId: string } };

const BEARER = /^Bearer\s+(\S+)$/i;

// Jeton personnel en Bearer ; le jeton n'est jamais journalisé ni renvoyé.
export const requireApiToken: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const token = BEARER.exec(c.req.header('Authorization') ?? '')?.[1];
  const verified = token ? await verifyApiToken(token) : null;
  if (!verified) {
    c.header('WWW-Authenticate', 'Bearer');
    return c.json({ error: 'Jeton manquant ou invalide' }, 401);
  }
  c.set('ctx', verified.ctx);
  c.set('tokenId', verified.tokenId);
  await next();
};

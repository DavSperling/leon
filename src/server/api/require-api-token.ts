import type { Context, MiddlewareHandler } from 'hono';
import { verifyApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { MCP_CHALLENGE } from '@/server/oauth/metadata';

export type ApiEnv = { Variables: { ctx: TenantContext; tokenId: string } };

export const BEARER = /^Bearer\s+(\S+)$/i;

// Le seul 401 des routes à jeton : il ne dit pas ce qui a manqué (jeton absent, inconnu, révoqué, membre parti…).
export function unauthorized(c: Context, challenge = 'Bearer') {
  c.header('WWW-Authenticate', challenge);
  return c.json({ error: 'Missing or invalid token' }, 401);
}

// Jeton en Bearer ; le jeton n'est jamais journalisé ni renvoyé. Un jeton d'assistant (OAuth) n'ouvre que la route
// montée avec `assistant: true`, seule /api/mcp (F9) : ailleurs, le même 401 qu'un jeton inconnu. Cette route-là, la
// seule à accepter des jetons obtenus par OAuth, dit dans son 401 où lire les métadonnées de la ressource (L2).
export function apiTokenGuard({
  assistant = false,
}: {
  assistant?: boolean;
} = {}): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const token = BEARER.exec(c.req.header('Authorization') ?? '')?.[1];
    const verified = token ? await verifyApiToken(token) : null;
    if (!verified || (verified.kind === 'assistant' && !assistant))
      return unauthorized(c, assistant ? MCP_CHALLENGE : undefined);
    c.set('ctx', verified.ctx);
    c.set('tokenId', verified.tokenId);
    await next();
  };
}

export const requireApiToken = apiTokenGuard();

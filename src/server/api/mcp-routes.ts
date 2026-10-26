import { requireMcpAuth } from '@better-auth/mcp';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { Hono } from 'hono';
import { z } from 'zod';
import { auth, MCP_RESOURCE } from '@/server/auth/auth';
import { resolveTenantContext } from '@/server/auth/tenant-context';
import { getEmbedder } from '@/server/embeddings/registry';
import { env } from '@/server/env';
import { clientLabelFromUserAgent } from '@/server/mcp/client-label';
import { createLeonMcpServer } from '@/server/mcp/server';
import { type ApiEnv, requireApiToken } from './require-api-token';

const McpAuthExtraSchema = z.object({
  ctx: z.object({
    tenantId: z.uuid(),
    userId: z.uuid(),
    principals: z.array(z.uuid()),
  }),
  client: z.string(),
});

const mcpHandler = createMcpHandler(({ authInfo }) => {
  const { ctx, client } = McpAuthExtraSchema.parse(authInfo?.extra);
  return createLeonMcpServer(ctx, client, { embedder: getEmbedder(env) });
});

const oauthMcpHandler = requireMcpAuth(
  auth,
  async (request, claims) => {
    const identity = z
      .object({
        sub: z.uuid(),
        tenantId: z.uuid(),
        jti: z.string().optional(),
        scope: z.string().optional(),
      })
      .safeParse(claims);
    if (!identity.success) return Response.json({ error: 'Jeton MCP invalide' }, { status: 403 });

    const ctx = await resolveTenantContext(identity.data.sub, identity.data.tenantId);
    if (!ctx) return Response.json({ error: 'Accès refusé' }, { status: 403 });

    return mcpHandler.fetch(request, {
      authInfo: {
        token: identity.data.jti ?? identity.data.sub,
        clientId: typeof claims.client_id === 'string' ? claims.client_id : identity.data.sub,
        scopes: identity.data.scope?.split(' ') ?? [],
        extra: {
          ctx,
          client: clientLabelFromUserAgent(request.headers.get('user-agent') ?? undefined) ?? 'MCP',
        },
      },
    });
  },
  { resource: MCP_RESOURCE, requiredScopes: ['mcp:access'] },
);

export const mcpRoutes = new Hono<ApiEnv>().all(
  '/',
  async (c, next) => {
    const authorization = c.req.header('Authorization') ?? '';
    if (/^Bearer\s+leon_/i.test(authorization)) return requireApiToken(c, next);
    return oauthMcpHandler(c.req.raw);
  },
  (c) =>
    mcpHandler.fetch(c.req.raw, {
      // Le jeton en clair ne quitte jamais Authorization ; MCP ne reçoit que son identifiant.
      authInfo: {
        token: c.var.tokenId,
        clientId: c.var.tokenId,
        scopes: [],
        extra: { ctx: c.var.ctx, client: clientLabelFromUserAgent(c.req.header('user-agent')) },
      },
    }),
);

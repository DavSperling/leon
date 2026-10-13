import { createMcpHandler } from '@modelcontextprotocol/server';
import { Hono } from 'hono';
import { z } from 'zod';
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
  return createLeonMcpServer(ctx, client);
});

export const mcpRoutes = new Hono<ApiEnv>().all('/', requireApiToken, (c) =>
  mcpHandler.fetch(c.req.raw, {
    // Jamais le jeton en clair dans authInfo : seulement son id.
    authInfo: {
      token: c.var.tokenId,
      clientId: c.var.tokenId,
      scopes: [],
      extra: { ctx: c.var.ctx, client: clientLabelFromUserAgent(c.req.header('user-agent')) },
    },
  }),
);

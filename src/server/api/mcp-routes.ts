import { Hono } from 'hono';
import { type ApiEnv, requireApiToken } from './require-api-token';

// Bouchon : le serveur MCP arrive avec T17.
export const mcpRoutes = new Hono<ApiEnv>().all('/', requireApiToken, (c) =>
  c.json({ error: 'MCP pas encore disponible' }, 501),
);

import type { ErrorHandler } from 'hono';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createOAuthRoutes } from '@/server/connectors/oauth-routes';
import { getConnector } from '@/server/connectors/registry';
import { logError } from '@/server/log';
import { authRoutes } from './auth-routes';
import { briefingRoutes } from './briefing-routes';
import { ingestRoutes } from './ingest-routes';
import { mcpRoutes } from './mcp-routes';
import type { ApiEnv } from './require-api-token';
import { sessionRoutes } from './session-routes';

export const app = new Hono<ApiEnv>().basePath('/api');

// Les erreurs inattendues ne sortent jamais telles quelles : ni message, ni pile.
export const handleApiError: ErrorHandler = (error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  logError('api.unhandled', error);
  return c.json({ error: 'Erreur interne' }, 500);
};

app.get('/health', (c) => c.json({ ok: true }));
app.route('/auth', authRoutes);
app.route('/v1', ingestRoutes);
app.route('/v1', briefingRoutes);
// Routes de l'interface, au cookie de session : chacune pose ses propres contrôles (jamais un `use` global,
// qui s'appliquerait aussi aux routes à jeton montées sous /v1).
app.route('/v1', sessionRoutes);
app.route('/mcp', mcpRoutes);
app.route('/v1/connexions/oauth', createOAuthRoutes({ getConnector }));
app.notFound((c) => c.json({ error: 'Introuvable' }, 404));
app.onError(handleApiError);

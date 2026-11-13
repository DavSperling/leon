import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  CAPTURE_KINDS,
  INGEST_BODY_MAX_BYTES,
  IngestPayloadSchema,
  type IngestResult,
} from '@/capture/turn';
import { getViewerProfile } from '@/server/auth/viewer';
import { ingestTurns } from '@/server/ingest/ingest-turns';
import { type ApiEnv, requireApiToken } from './require-api-token';

// Les kinds que la route admet : ceux de la capture, sans la note, que seul writeNote crée (C14, D38, T57). Un enum propre
// à la route : le contrat partagé (IngestPayloadSchema) et SOURCE_KINDS ne changent pas.
const RouteSourceSchema = IngestPayloadSchema.shape.source.extend({
  kind: z.enum(CAPTURE_KINDS).exclude(['mcp_remember']),
});
const RoutePayloadSchema = IngestPayloadSchema.extend({ source: RouteSourceSchema });

export const ingestRoutes = new Hono<ApiEnv>()
  // Le jeton est vérifié avant de lire le corps.
  .post(
    '/ingest',
    requireApiToken,
    bodyLimit({
      maxSize: INGEST_BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Request too large' }, 413),
    }),
    async (c) => {
      const body = await c.req.json().catch(() => undefined);
      const parsed = RoutePayloadSchema.safeParse(body);
      if (!parsed.success) {
        // 400 sans les valeurs reçues : elles peuvent contenir des secrets.
        const issues = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
        }));
        return c.json({ error: 'Invalid request', issues }, 400);
      }
      const result: IngestResult = await ingestTurns(c.var.ctx, parsed.data);
      return c.json(result, 202);
    },
  )
  .get('/me', requireApiToken, async (c) => c.json(await getViewerProfile(c.var.ctx)));

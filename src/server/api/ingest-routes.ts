import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { INGEST_BODY_MAX_BYTES, IngestPayloadSchema, type IngestResult } from '@/capture/turn';
import { getViewerProfile } from '@/server/auth/viewer';
import { ingestTurns } from '@/server/ingest/ingest-turns';
import { type ApiEnv, requireApiToken } from './require-api-token';

export const ingestRoutes = new Hono<ApiEnv>()
  // Le jeton est vérifié avant de lire le corps.
  .post(
    '/ingest',
    requireApiToken,
    bodyLimit({
      maxSize: INGEST_BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Requête trop volumineuse' }, 413),
    }),
    async (c) => {
      const body = await c.req.json().catch(() => undefined);
      const parsed = IngestPayloadSchema.safeParse(body);
      if (!parsed.success) {
        // 400 sans les valeurs reçues : elles peuvent contenir des secrets.
        const issues = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
        }));
        return c.json({ error: 'Requête invalide', issues }, 400);
      }
      const result: IngestResult = await ingestTurns(c.var.ctx, parsed.data);
      return c.json(result, 202);
    },
  )
  .get('/me', requireApiToken, async (c) => c.json(await getViewerProfile(c.var.ctx)));

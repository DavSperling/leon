import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { FAITS_BODY_MAX_BYTES, SessionFactsPayloadSchema } from '@/capture/api-contract';
import { recordFacts } from '@/server/ingest/record-facts';
import { type ApiEnv, requireApiToken } from './require-api-token';

export const faitsRoutes = new Hono<ApiEnv>()
  // Le jeton est vérifié avant de lire le corps.
  .post(
    '/faits',
    requireApiToken,
    bodyLimit({
      maxSize: FAITS_BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Request too large' }, 413),
    }),
    async (c) => {
      const body = await c.req.json().catch(() => undefined);
      const parsed = SessionFactsPayloadSchema.safeParse(body);
      if (!parsed.success) {
        // 400 sans les valeurs reçues : elles peuvent contenir des secrets.
        const issues = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
        }));
        return c.json({ error: 'Invalid request', issues }, 400);
      }
      await recordFacts(c.var.ctx, parsed.data);
      return c.body(null, 202);
    },
  );

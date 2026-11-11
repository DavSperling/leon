import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  FAITS_BODY_MAX_BYTES,
  RETRAIT_BODY_MAX_BYTES,
  RetraitRequestSchema,
  SessionFactsPayloadSchema,
} from '@/capture/api-contract';
import { recordFacts, withdrawUsages } from '@/server/ingest/record-facts';
import { logError } from '@/server/log';
import { enqueueResume } from '@/server/sessions/resume-queue';
import { enqueueRangement } from '@/server/sessions/threads-queue';
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
      const { ctx, tokenId } = c.var;
      const { sourceId, resume } = await recordFacts(ctx, parsed.data, tokenId);
      const job = { tenantId: ctx.tenantId, sourceId, ownerUserId: ctx.userId };
      // Le rangement en fils (T40), sans condition d'usage : il ne lit que les clés des faits, rien ne sort de Leon.
      // Les faits sont rangés : une file indisponible ne les fait pas perdre, et l'envoi suivant remet la session en
      // file. De même pour le résumé (T23), seulement avec l'usage `resume`.
      try {
        await enqueueRangement(job, { fin: parsed.data.fin });
      } catch (error) {
        logError('faits.rangement_enqueue', error, { sourceId });
      }
      if (resume) {
        try {
          await enqueueResume(job, { fin: parsed.data.fin });
        } catch (error) {
          logError('faits.resume_enqueue', error, { sourceId });
        }
      }
      return c.body(null, 202);
    },
  )
  // `leon retirer-crochets` : l'accord de l'outil retiré sur le poste l'est aussi sur le serveur, daté sur ce jeton.
  .post(
    '/retrait',
    requireApiToken,
    bodyLimit({
      maxSize: RETRAIT_BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Request too large' }, 413),
    }),
    async (c) => {
      const parsed = RetraitRequestSchema.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
      await withdrawUsages(c.var.ctx, c.var.tokenId, parsed.data);
      return c.body(null, 204);
    },
  );

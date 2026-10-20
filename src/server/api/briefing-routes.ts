import { Hono } from 'hono';
import { z } from 'zod';
import { BRIEFING_PROJECT_PARAM, type BriefingResponse } from '@/capture/api-contract';
import { PROJECT_KEY_PATTERN } from '@/capture/turn';
import { BRIEFING_PENDING_MARKDOWN, readBriefing } from '@/server/briefing/briefings';
import { type ApiEnv, requireApiToken } from './require-api-token';

// La route du point du matin (C8), lue par le crochet de démarrage de Claude Code (`leon briefing`) : elle rend le
// dernier point prêt, même périmé (son recalcul est déjà en file), sans jamais attendre le modèle. Rien de prêt (ou
// un point qui a reçu une source que l'utilisateur ne voit plus) : le message d'attente, et le recalcul est mis en
// file par readBriefing. Le crochet abandonne au bout de 3 secondes : tout se lit dans une seule transaction.

// La même forme que `source.project` à l'ingestion : la clé calculée par la CLI, jamais une adresse de remote.
const ProjectSchema = z.string().min(1).max(200).regex(PROJECT_KEY_PATTERN);

export const briefingRoutes = new Hono<ApiEnv>().get('/briefing', requireApiToken, async (c) => {
  const project = ProjectSchema.safeParse(c.req.query(BRIEFING_PROJECT_PARAM));
  // Sans la valeur reçue : une adresse de remote peut porter un jeton.
  if (!project.success) return c.json({ error: 'Projet manquant ou invalide' }, 400);
  const briefing = await readBriefing(c.var.ctx, project.data);
  const body: BriefingResponse = briefing
    ? {
        markdown: briefing.markdown,
        projet: project.data,
        preparedAt: briefing.preparedAt.toISOString(),
      }
    : { markdown: BRIEFING_PENDING_MARKDOWN, projet: null, preparedAt: null };
  return c.json(body);
});

import { Hono } from 'hono';
import { z } from 'zod';
import { BRIEFING_PROJECT_PARAM } from '@/capture/api-contract';
import { PROJECT_KEY_PATTERN } from '@/capture/turn';
import { briefingResponse } from '@/server/briefing/briefings';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { type ApiEnv, requireApiToken } from './require-api-token';

// La route du point du matin (C8), lue par le crochet de démarrage de Claude Code (`leon briefing`) : elle rend le
// dernier point prêt, même périmé (son recalcul est déjà en file), sans jamais attendre le modèle. Rien de prêt (ou
// un point qui a reçu une source que l'utilisateur ne voit plus) : le message d'attente, et le recalcul est mis en
// file par readBriefing ; sans modèle sur ce serveur, un message qui le dit, et rien en file (aucun point ne serait
// préparé). Le crochet abandonne au bout de 3 secondes : tout se lit dans une seule transaction.

// La même forme que `source.project` à l'ingestion : la clé calculée par la CLI, jamais une adresse de remote.
const ProjectSchema = z.string().min(1).max(200).regex(PROJECT_KEY_PATTERN);

export const briefingRoutes = new Hono<ApiEnv>().get('/briefing', requireApiToken, async (c) => {
  const project = ProjectSchema.safeParse(c.req.query(BRIEFING_PROJECT_PARAM));
  // Sans la valeur reçue : une adresse de remote peut porter un jeton.
  if (!project.success) return c.json({ error: 'Missing or invalid project' }, 400);
  return c.json(
    await briefingResponse(c.var.ctx, project.data, { modelReady: getLlm(env) !== null }),
  );
});

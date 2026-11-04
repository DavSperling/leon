import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  CONTEXT_BODY_MAX_BYTES,
  CONTEXT_MAX_BYTES,
  ContextRequestSchema,
} from '@/capture/api-contract';
import { briefingResponse } from '@/server/briefing/briefings';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { renderContext } from '@/server/sessions/render-context';
import { readStartSessions, readTeamPrs } from '@/server/sessions/start-context';
import { type ApiEnv, requireApiToken } from './require-api-token';

// Le bloc de démarrage (C3), lu par le crochet de démarrage de chaque outil : mes dernières sessions sur ce dépôt,
// l'équipe sur ce dépôt (T14), puis le point du matin, tel que la route du point le rend. Ni modèle ni vecteur : le
// crochet abandonne au bout de 3 secondes.
// Le jeton est vérifié avant de lire le corps.
export const contextRoutes = new Hono<ApiEnv>().post(
  '/contexte',
  requireApiToken,
  bodyLimit({
    maxSize: CONTEXT_BODY_MAX_BYTES,
    onError: (c) => c.json({ error: 'Request too large' }, 413),
  }),
  async (c) => {
    const parsed = ContextRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    // Sans les valeurs reçues : une adresse de remote peut porter un jeton.
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const { projet, branche, session, max } = parsed.data;
    // Trois transactions indépendantes, en parallèle : le point du matin ouvre la sienne.
    const [sessions, equipe, briefing] = await Promise.all([
      readStartSessions(c.var.ctx, { projet, branche, session }),
      readTeamPrs(c.var.ctx, { projet }),
      briefingResponse(c.var.ctx, projet, { modelReady: getLlm(env) !== null }),
    ]);
    return c.json({
      texte: renderContext({
        project: projet,
        sessions,
        equipe,
        briefing: briefing.markdown,
        max: Math.min(max ?? CONTEXT_MAX_BYTES, CONTEXT_MAX_BYTES),
      }),
    });
  },
);

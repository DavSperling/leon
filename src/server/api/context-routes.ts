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
import { logError } from '@/server/log';
import { renderContext } from '@/server/sessions/render-context';
import { readStartContext } from '@/server/sessions/start-context';
import { enqueueRangement } from '@/server/sessions/threads-queue';
import { type ApiEnv, requireApiToken } from './require-api-token';

// Le bloc de démarrage (C3), lu par le crochet de démarrage de chaque outil : mes dernières sessions sur ce dépôt,
// l'équipe sur ce dépôt (T14), puis le point du matin, tel que la route du point le rend. Avec l'usage `lecture` de
// l'outil (T46 du plan de la mémoire à disposition), le sommaire de mes fils à la place de mes sessions, et la consigne
// de lecture qui cite `commande` ; sans fil, le bloc d'avant. Ni modèle ni vecteur : le crochet abandonne au bout de
// 3 secondes. `commande` n'est jamais journalisée : sous la forme clone, elle porte un chemin du poste.
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
    const { projet, branche, session, max, usages, commande } = parsed.data;
    const { ctx } = c.var;
    // Deux transactions indépendantes, en parallèle : le point du matin ouvre la sienne.
    const [{ sessions, equipe, fils, recentes }, briefing] = await Promise.all([
      readStartContext(ctx, { projet, branche, session, lecture: usages?.includes('lecture') }),
      // Le point injecté est une lecture, notée avec la session (D35) ; le corps n'a pas d'`outil` : `cli`.
      briefingResponse(ctx, projet, {
        modelReady: getLlm(env) !== null,
        client: 'cli',
        session,
      }),
    ]);
    // Les sessions dont le rangement attend encore sont rangées tout de suite, comme à une fin de session : Codex,
    // Cursor et Antigravity n'en envoient presque jamais. Sans l'attendre, et seulement s'il y en a : le sondage de la
    // file coûte. Une file indisponible ne change rien au bloc ; le rangement à 15 min reste en file.
    if (recentes.length > 0) {
      void Promise.all(
        recentes.map((sourceId) =>
          enqueueRangement(
            { tenantId: ctx.tenantId, sourceId, ownerUserId: ctx.userId },
            { fin: true },
          ),
        ),
      ).catch((error) => logError('contexte.rangement_enqueue', error));
    }
    return c.json({
      texte: renderContext({
        project: projet,
        sessions,
        equipe,
        fils,
        commande,
        briefing: briefing.markdown,
        max: Math.min(max ?? CONTEXT_MAX_BYTES, CONTEXT_MAX_BYTES),
      }),
    });
  },
);

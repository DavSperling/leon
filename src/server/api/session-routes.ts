import { Hono, type MiddlewareHandler } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ANSWER_PATH, ANSWER_RESULTS_PARAM, parseAnswerResults } from '@/lib/answer-events';
import { QUERY_MAX_CHARS } from '@/lib/search-limits';
import { answerStream } from '@/server/answer/answer';
import { auth } from '@/server/auth/auth';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { getEmbedder } from '@/server/embeddings/registry';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { logError } from '@/server/log';

// Les routes de l'interface (D7 du plan du deuxième jet) : authentifiées par le cookie de session de Better
// Auth, à côté des routes à jeton de la CLI et du MCP. Le navigateur les appelle depuis les pages de Leon.

export type SessionEnv = { Variables: { ctx: TenantContext } };

// Le contexte de l'utilisateur connecté, résolu comme dans les pages (membre de l'organisation de sa session).
// Jamais getUserContext : il lit `next/headers`, qui lève hors d'une requête Next.
export const requireSession: MiddlewareHandler<SessionEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const ctx = session
    ? await resolveTenantContext(session.user.id, session.session.activeOrganizationId ?? null)
    : null;
  if (!ctx) return c.json({ error: 'Session requise' }, 401);
  c.set('ctx', ctx);
  await next();
};

// Même origine que BETTER_AUTH_URL. Un GET du même site n'envoie pas toujours `Origin` ; le navigateur envoie
// alors `Sec-Fetch-Site`, qui dit d'où vient la requête. Une page d'un autre site (même un sous-domaine) ne
// déclenche pas d'appel au modèle à la place de l'utilisateur.
const ALLOWED_FETCH_SITES = ['same-origin', 'none'];

export const requireSameOrigin: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('origin');
  const site = c.req.header('sec-fetch-site');
  const expected = new URL(env.BETTER_AUTH_URL).origin;
  if (
    (origin !== undefined && origin !== expected) ||
    (site !== undefined && !ALLOWED_FETCH_SITES.includes(site))
  ) {
    return c.json({ error: 'Origine refusée' }, 403);
  }
  await next();
};

// Chemin de la route sous /api/v1, où ces routes sont montées (app.ts).
const ANSWER_ROUTE = ANSWER_PATH.replace(/^\/api\/v1/, '');

export const sessionRoutes = new Hono<SessionEnv>().get(
  ANSWER_ROUTE,
  requireSameOrigin,
  requireSession,
  (c) => {
    // La barre tronque déjà la requête à 300 caractères (url-state.ts) : la même requête, la même clé de cache.
    const query = (c.req.query('q') ?? '').slice(0, QUERY_MAX_CHARS);
    if (query.trim() === '') return c.json({ error: 'Requête vide' }, 400);
    // Les résultats affichés sur la page, dans leur ordre : [n] de la réponse désigne le n-ième.
    const resultIds = parseAnswerResults(c.req.query(ANSWER_RESULTS_PARAM));
    if (resultIds === null) return c.json({ error: 'Liste des résultats invalide' }, 400);
    const events = answerStream(
      c.var.ctx,
      { query, resultIds },
      { llm: getLlm(env), embedder: getEmbedder(env) },
    );
    // Sans modèle, l'encadré ne s'affiche pas : la recherche marche sans lui.
    if (events === null) return c.body(null, 204);
    return streamSSE(c, async (stream) => {
      try {
        for await (const event of events) {
          // Le lecteur est parti : on arrête de lire, ce qui interrompt l'appel au modèle.
          if (stream.aborted) break;
          await stream.writeSSE({ data: JSON.stringify(event) });
        }
      } catch (error) {
        // answerStream ne lève pas ; sans ce filet, Hono écrirait le message de l'erreur dans la console.
        logError('answer.route', error);
      }
    });
  },
);

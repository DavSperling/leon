import { Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { ANSWER_PATH, ANSWER_RESULTS_PARAM, parseAnswerResults } from '@/lib/answer-events';
import {
  DISCUSSION_MESSAGE_MAX_CHARS,
  DISCUSSION_TOO_MANY,
  DISCUSSIONS_PATH,
} from '@/lib/discussion-events';
import { QUERY_MAX_CHARS } from '@/lib/search-limits';
import { answerStream } from '@/server/answer/answer';
import { auth } from '@/server/auth/auth';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { replyStream } from '@/server/discussion/agent';
import { findDiscussion } from '@/server/discussion/discussions';
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

// Chemins des routes sous /api/v1, où ces routes sont montées (app.ts).
const underV1 = (path: string) => path.replace(/^\/api\/v1/, '');
const ANSWER_ROUTE = underV1(ANSWER_PATH);
const DISCUSSION_MESSAGES_ROUTE = `${underV1(DISCUSSIONS_PATH)}/:id/messages`;

// Un message de la discussion : quelques milliers de caractères, dans un corps borné avant d'être lu.
const DISCUSSION_BODY_MAX_BYTES = 64 * 1024;
const DiscussionMessageSchema = z.object({
  message: z.string().trim().min(1).max(DISCUSSION_MESSAGE_MAX_CHARS),
});

// Le signe de vie d'un flux : un commentaire SSE, que la page ignore (event-stream.ts). Sans lui, un proxy coupe
// la connexion restée muette pendant que l'agent cherche ou réfléchit.
const PING_MS = 15_000;

// Les évènements d'un flux, un par évènement serveur. Quand le lecteur s'en va, la réponse en tête s'arrête tout
// de suite (`leaving` interrompt la recherche et l'appel au modèle) ; la discussion (`keepReading`) continue de lire
// sans écrire, pour que la réponse soit finie et gardée : la page rechargée la retrouve.
function streamEvents(
  c: Parameters<typeof streamSSE>[0],
  events: AsyncIterable<unknown>,
  route: string,
  options: { keepReading?: boolean; leaving?: AbortController } = {},
) {
  const { keepReading = false, leaving } = options;
  return streamSSE(c, async (stream) => {
    if (leaving) stream.onAbort(() => leaving.abort());
    const ping = setInterval(() => void stream.write(': ping\n\n'), PING_MS);
    try {
      for await (const event of events) {
        if (stream.aborted) {
          if (keepReading) continue;
          break;
        }
        await stream.writeSSE({ data: JSON.stringify(event) });
      }
    } catch (error) {
      // Les flux ne lèvent pas ; sans ce filet, Hono écrirait le message de l'erreur dans la console.
      logError(route, error);
    } finally {
      clearInterval(ping);
    }
  });
}

export const sessionRoutes = new Hono<SessionEnv>()
  .get(ANSWER_ROUTE, requireSameOrigin, requireSession, (c) => {
    // La barre tronque déjà la requête à 300 caractères (url-state.ts) : la même requête, la même clé de cache.
    const query = (c.req.query('q') ?? '').slice(0, QUERY_MAX_CHARS);
    if (query.trim() === '') return c.json({ error: 'Requête vide' }, 400);
    // Les résultats affichés sur la page, dans leur ordre : [n] de la réponse désigne le n-ième.
    const resultIds = parseAnswerResults(c.req.query(ANSWER_RESULTS_PARAM));
    if (resultIds === null) return c.json({ error: 'Liste des résultats invalide' }, 400);
    const leaving = new AbortController();
    const events = answerStream(
      c.var.ctx,
      { query, resultIds },
      { llm: getLlm(env), embedder: getEmbedder(env), signal: leaving.signal },
    );
    // Sans modèle, l'encadré ne s'affiche pas : la recherche marche sans lui.
    if (events === null) return c.body(null, 204);
    // Déjà trois réponses en cours pour cet utilisateur : l'encadré se masque.
    if (events === 'trop') return c.json({ error: 'Trop de réponses en cours' }, 429);
    return streamEvents(c, events, 'answer.route', { leaving });
  })
  // Une question dans une discussion de l'utilisateur, et la réponse de l'agent en flux (C8). Une discussion qu'il
  // ne voit pas (celle d'un autre, inconnue) n'existe pas pour lui : 404, avant tout appel au modèle.
  .post(
    DISCUSSION_MESSAGES_ROUTE,
    requireSameOrigin,
    requireSession,
    bodyLimit({
      maxSize: DISCUSSION_BODY_MAX_BYTES,
      onError: (c) => c.json({ error: 'Requête trop volumineuse' }, 413),
    }),
    async (c) => {
      const discussion = await findDiscussion(c.var.ctx, c.req.param('id') ?? '');
      if (!discussion) return c.json({ error: 'Introuvable' }, 404);
      const parsed = DiscussionMessageSchema.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: 'Message vide ou trop long' }, 400);
      const events = replyStream(c.var.ctx, discussion.id, parsed.data.message, {
        llm: getLlm(env),
        embedder: getEmbedder(env),
      });
      // Sans modèle, la page dit qu'aucun modèle n'est branché ; la question n'est pas gardée.
      if (events === null) return c.body(null, 204);
      // Déjà deux réponses en cours pour cet utilisateur : rien n'est écrit.
      if (events === 'trop') return c.json({ error: DISCUSSION_TOO_MANY }, 429);
      return streamEvents(c, events, 'discussion.route', { keepReading: true });
    },
  );

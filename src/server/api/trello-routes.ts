import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { oauthClient } from '@/server/connectors/oauth-env';
import { enqueueDueSyncs } from '@/server/connectors/sync';
import { markTrelloAlert, signedByTrello, webhooksUrl } from '@/server/connectors/trello/webhooks';
import { logError } from '@/server/log';

// Les alertes de Trello (trello/webhooks.ts) : publiques, ni session ni jeton. Seule la signature de Trello compte,
// calculée avec le secret de l'appli sur l'adresse de rappel reconstruite depuis l'adresse publique de Leon
// (BETTER_AUTH_URL), jamais depuis l'en-tête Host. Une alerte signée rend la connexion due et sa relève mise en file,
// rien de plus : Trello n'attend que le code de la réponse. `publicUrl` : tests.

// Une alerte porte l'action et le tableau, sans ses cartes.
const ALERT_MAX_BYTES = 1024 * 1024;

export function createTrelloRoutes(deps: { publicUrl?: string } = {}) {
  return (
    new Hono()
      // Trello essaie l'adresse par un HEAD avant de créer le webhook, donc avant que Leon n'en garde le jeton : 200
      // pour tout jeton. Hono répond au HEAD par la route GET, et Next le passe au GET de l'API (test à l'appui).
      .get('/webhooks/:token', (c) => c.body(null, 200))
      .post(
        '/webhooks/:token',
        bodyLimit({ maxSize: ALERT_MAX_BYTES, onError: (c) => c.text('Request too large', 413) }),
        async (c) => {
          const token = c.req.param('token');
          const client = oauthClient('TRELLO');
          const url = webhooksUrl(deps.publicUrl);
          const body = new Uint8Array(await c.req.arrayBuffer());
          const signature = c.req.header('x-trello-webhook');
          const signed =
            client !== null &&
            url !== null &&
            signedByTrello(body, `${url}/${token}`, signature, client.secret);
          if (!signed) return c.body(null, 401);
          // Un jeton inconnu : sa connexion a été supprimée. Le 410 fait retirer le webhook par Trello.
          if (!(await markTrelloAlert(token))) return c.body(null, 410);
          // La file ratée n'est pas une alerte perdue : la connexion est due, le tic de la minute la prendra.
          await enqueueDueSyncs().catch((error) => logError('trello.enqueue_failed', error));
          return c.body(null, 200);
        },
      )
  );
}

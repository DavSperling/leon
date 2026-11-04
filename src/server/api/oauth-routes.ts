import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { registerClient } from '@/server/oauth/clients';

// Les routes publiques du serveur d'autorisation OAuth (RFC 7591) : ni jeton ni session, par nature (un client qui
// s'inscrit n'a encore rien). Elles ne lisent ni n'écrivent rien en base.

const BODY_MAX_BYTES = 4 * 1024;

export const oauthRoutes = new Hono().post(
  '/clients',
  bodyLimit({
    maxSize: BODY_MAX_BYTES,
    onError: (c) => c.json({ error: 'invalid_client_metadata' }, 400),
  }),
  async (c) => {
    // Un corps illisible vaut un corps vide : registerClient le refuse. Jamais les valeurs reçues dans la réponse.
    const result = registerClient(await c.req.json().catch(() => undefined));
    return 'error' in result ? c.json({ error: result.error }, 400) : c.json(result.client, 201);
  },
);

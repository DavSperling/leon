import { Hono } from 'hono';
import { markAlerted } from '@/server/connectors/fathom/webhook';
import { enqueueDueSyncs } from '@/server/connectors/sync';
import { logError } from '@/server/log';

// Le point d'entrée des alertes de Fathom (fathom/webhook.ts) : public, ni session ni jeton d'API. Seul le jeton de
// l'adresse, comparé en base à l'empreinte gardée pour une connexion, fait compter l'alerte. Le corps n'est pas lu : la
// connexion est rendue due et sa relève mise en file, rien de plus.
export const fathomRoutes = new Hono().post('/webhooks/:jeton', async (c) => {
  // La file ratée n'est pas une alerte perdue : la connexion est due, le tic de la minute la prendra.
  if (await markAlerted(c.req.param('jeton')))
    await enqueueDueSyncs().catch((error) => logError('fathom.enqueue_failed', error));
  // 200 aussi pour un jeton inconnu : Fathom réessaie tout autre code, et ne documente pas le 410.
  return c.body(null, 200);
});

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { markNotified } from '@/server/connectors/microsoft-notifications';
import { enqueueDueSyncs } from '@/server/connectors/sync';
import { logError } from '@/server/log';

// Le point d'entrée des notifications de Microsoft Graph (microsoft-notifications.ts) : public, ni session ni jeton.
// Seul le clientState d'une notification, comparé en base à l'empreinte de son abonnement, la fait compter. Microsoft
// veut une réponse sous 3 secondes : la connexion est rendue due et sa relève mise en file, rien de plus.

// Un lot de notifications sans contenu (moins d'un Kio chacune).
const NOTIFICATIONS_MAX_BYTES = 1024 * 1024;

const NotificationsSchema = z.object({
  value: z.array(
    z.object({
      subscriptionId: z.string().min(1).max(200),
      clientState: z.string().max(128).nullish(),
      lifecycleEvent: z.string().max(100).nullish(),
      // Teams : où le changement a eu lieu (la conversation, le canal), relu tout de suite (0098).
      resource: z.string().max(1000).nullish(),
    }),
  ),
});

export const microsoftRoutes = new Hono().post(
  '/notifications',
  bodyLimit({
    maxSize: NOTIFICATIONS_MAX_BYTES,
    onError: (c) => c.text('Request too large', 413),
  }),
  async (c) => {
    // La poignée de main d'un nouvel abonnement : le jeton rendu tel quel, en texte brut, que le navigateur ne lit
    // jamais comme une page.
    const token = c.req.query('validationToken');
    if (token !== undefined) {
      c.header('x-content-type-options', 'nosniff');
      return c.text(token);
    }
    const parsed = NotificationsSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    // La file ratée n'est pas une notification perdue : la connexion est due, le tic de la minute la prendra.
    if ((await markNotified(parsed.data.value)) > 0)
      await enqueueDueSyncs().catch((error) => logError('microsoft.enqueue_failed', error));
    return c.body(null, 202);
  },
);

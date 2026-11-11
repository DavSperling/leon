import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  RAPPEL_BODY_MAX_BYTES,
  RappelRequestSchema,
  type RappelResponse,
} from '@/capture/api-contract';
import { reminderText } from '@/server/sessions/reminder';
import { type ApiEnv, requireApiToken } from './require-api-token';

// La route du rappel (T48 ; C8, D26 du plan de la mémoire à disposition), qu'appelle le crochet de message des outils :
// le jeton avant le corps, 16 Kio au plus en `.strict()`, un 400 qui ne recopie aucune valeur (le message en est une),
// puis la ligne de rappel, ou un texte vide sans l'usage `rappel` (reminder.ts).

const limit = bodyLimit({
  maxSize: RAPPEL_BODY_MAX_BYTES,
  onError: (c) => c.json({ error: 'Request too large' }, 413),
});

export const reminderRoutes = new Hono<ApiEnv>().post(
  '/rappel',
  requireApiToken,
  limit,
  async (c) => {
    const parsed = RappelRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
    const texte = await reminderText(c.var.ctx, parsed.data);
    return c.json({ texte } satisfies RappelResponse);
  },
);

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  NOTER_BODY_MAX_BYTES,
  NoterRequestSchema,
  type NoterResponse,
} from '@/capture/api-contract';
import { writeNote } from '@/server/memory/notes';
import { type ApiEnv, requireApiToken } from './require-api-token';

// La route des notes (T57 ; C14, D30, D38 du plan de la mémoire à disposition), qu'appelle `leon note` : le jeton avant
// le corps, 16 Kio au plus en `.strict()`, un 400 qui ne recopie aucune valeur, l'usage `noter` de l'outil (sans lui,
// le refus des routes de lecture, même avec `lecture`), puis writeNote, le chemin de `remember`. Le texte d'une note
// n'est jamais journalisé. Elle ne lit pas le réglage `noter` du compte : `leon note` suit l'usage de l'outil (T65).
// Aucune restauration ici : le site seul restaure (D33).

const limit = bodyLimit({
  maxSize: NOTER_BODY_MAX_BYTES,
  onError: (c) => c.json({ error: 'Request too large' }, 413),
});

// 409, sans dire laquelle des notes de l'espace existe : une note d'un collègue est introuvable, comme une autre.
const CONFLICTS = {
  depassee: 'Version outdated',
  autre_outil: 'Written by another tool',
  introuvable: 'Note not found',
} as const;

export const notesRoutes = new Hono<ApiEnv>().post('/noter', requireApiToken, limit, async (c) => {
  const parsed = NoterRequestSchema.safeParse(await c.req.json().catch(() => undefined));
  // Sans les valeurs reçues : le texte d'une note en est une.
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
  const { projet, outil, session, texte, note, version, usages } = parsed.data;
  if (!usages.includes('noter')) return c.json({ error: 'Notes not allowed' }, 403);
  const written = await writeNote(c.var.ctx, { texte, outil, session, projet, note, version });
  if (written === 'invalide') return c.json({ error: 'Invalid request' }, 400);
  if (typeof written !== 'object') return c.json({ error: CONFLICTS[written] }, 409);
  return c.json(written satisfies NoterResponse, 201);
});

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { COULISSES_BODY_MAX_BYTES, CoulissesRequestSchema } from '@/capture/api-contract';
import { recordBackstage } from '@/server/ingest/record-backstage';
import { type ApiEnv, requireApiToken } from './require-api-token';

// La route des coulisses (T51 ; C10 amendé le 12/11, D29 du plan de la mémoire à disposition), qu'appellera la CLI
// (T52) : le jeton avant le corps, 256 Kio au plus en `.strict()`, un 400 qui ne recopie aucune valeur (les chemins et
// les codes seulement, comme la route des faits), l'usage `coulisses` de l'outil, puis le retrait daté (recordBackstage).
// Ni un texte de bloc ni une cible ne sont journalisés.
export const backstageRoutes = new Hono<ApiEnv>().post(
  '/coulisses',
  requireApiToken,
  bodyLimit({
    maxSize: COULISSES_BODY_MAX_BYTES,
    onError: (c) => c.json({ error: 'Request too large' }, 413),
  }),
  async (c) => {
    const parsed = CoulissesRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
      }));
      return c.json({ error: 'Invalid request', issues }, 400);
    }
    if (!parsed.data.usages?.includes('coulisses'))
      return c.json({ error: 'Backstage not allowed' }, 403);
    const { ctx, tokenId } = c.var;
    if ((await recordBackstage(ctx, parsed.data, tokenId)) === 'retire')
      return c.json({ error: 'Backstage not allowed' }, 403);
    return c.body(null, 202);
  },
);

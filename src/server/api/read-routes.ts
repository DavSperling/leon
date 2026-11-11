import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { z } from 'zod';
import {
  ChercherRequestSchema,
  DossierRequestSchema,
  FilRequestSchema,
  READ_BODY_MAX_BYTES,
  type ReadResponse,
  VersionsRequestSchema,
} from '@/capture/api-contract';
import type { CodeSessionKind } from '@/capture/turn';
import { getEmbedder } from '@/server/embeddings/registry';
import { env } from '@/server/env';
import {
  renderDossier,
  renderFil,
  renderSearch,
  renderVersions,
  THREAD_NOT_FOUND,
} from '@/server/mcp/tools/render';
import { logHits, mentionThreads } from '@/server/mcp/tools/search-tool';
import type { ReadTool } from '@/server/memory/read-log';
import { searchPassages } from '@/server/search/search';
import { type Journal, readDossier, readThread, readVersions } from '@/server/sessions/thread-read';
import { type ApiEnv, requireApiToken } from './require-api-token';

// Les routes de lecture (T44, T54 ; C9, C11, C12, D27, D30 du plan de la mémoire à disposition), qu'appellent
// `leon threads`, `leon thread`, `leon search` et `leon versions`. Chacune : le jeton avant le corps, 4 Kio au plus en
// `.strict()`, un 400 qui ne recopie aucune valeur, l'usage `lecture` de l'outil, puis la lecture commune sous les
// droits du porteur (thread-read.ts), notée au journal, et son rendu gardé, le même que le MCP. `outil` et `session`
// vont au journal (D35) ; sans outil, la lecture vient de la CLI seule.
// - Un usage absent : 403. Un fil introuvable : 200 et un texte fixe, jamais 404, que la CLI lit comme un serveur
//   ancien (C11).
// - /chercher : la recherche existante, bornée au dépôt du projet par le filtre `depot`, qui ne vient que des
//   paramètres (search.ts) : la requête ne peut pas l'élargir. Sans filtre `type` (QD9), une page, sans pages. Une
//   session trouvée cite son fil et ses PR, comme au MCP.
// - /versions : l'historique d'un fil, sans aucune restauration (D33, T55 la fera sur le site).

type ReadBody = { session?: string; outil?: CodeSessionKind; usages: string[] };

const limit = bodyLimit({
  maxSize: READ_BODY_MAX_BYTES,
  onError: (c) => c.json({ error: 'Request too large' }, 413),
});

async function answer<T extends ReadBody>(
  c: Context<ApiEnv>,
  schema: z.ZodType<T>,
  tool: ReadTool,
  read: (body: T, journal: Journal) => Promise<string>,
) {
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  // Sans les valeurs reçues : une adresse de remote peut porter un jeton.
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
  if (!parsed.data.usages.includes('lecture')) return c.json({ error: 'Reading not allowed' }, 403);
  const { outil, session } = parsed.data;
  const texte = await read(parsed.data, { tool, client: outil ?? 'cli', session: session ?? null });
  return c.json({ texte } satisfies ReadResponse);
}

export const readRoutes = new Hono<ApiEnv>()
  .post('/dossier', requireApiToken, limit, (c) =>
    answer(c, DossierRequestSchema, 'threads', async (body, journal) =>
      renderDossier(await readDossier(c.var.ctx, body, journal)),
    ),
  )
  .post('/fil', requireApiToken, limit, (c) =>
    answer(c, FilRequestSchema, 'thread', async (body, journal) => {
      const read = await readThread(c.var.ctx, body, journal);
      return read === null ? THREAD_NOT_FOUND : renderFil(read);
    }),
  )
  .post('/chercher', requireApiToken, limit, (c) =>
    answer(c, ChercherRequestSchema, 'search', async (body, journal) => {
      const page = await searchPassages(c.var.ctx, {
        query: body.requete,
        filters: { depot: body.projet },
        page: 1,
        embedder: getEmbedder(env),
      });
      await logHits(c.var.ctx, page, journal);
      await mentionThreads(c.var.ctx, page);
      return renderSearch(page, 1, false);
    }),
  )
  .post('/versions', requireApiToken, limit, (c) =>
    answer(c, VersionsRequestSchema, 'versions', async (body, journal) => {
      const read = await readVersions(c.var.ctx, body, journal);
      return read === null ? THREAD_NOT_FOUND : renderVersions(read);
    }),
  );

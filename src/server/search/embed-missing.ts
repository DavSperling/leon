import { and, eq, inArray, notExists, type SQL, sql } from 'drizzle-orm';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { ingestRuns } from '@/server/db/schema/memory';
import { passages, passageVectors } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { EMBEDDING_DIMS, type Embedder, EmbedderError } from '@/server/embeddings/embedder';
import { logError } from '@/server/log';
import { enqueuePipelineStep } from '@/server/pipeline/queue';

// Les deux reprises de l'indexation (C5), lancées par le tic du worker de la recherche :
// - embedMissing complète les vecteurs qui manquent (fournisseur en panne pendant l'indexation, fournisseur
//   ou modèle changé après coup) ;
// - requeueStaleRuns remet en file les runs restés « en attente » sans job (mise en file ratée).

// Textes envoyés au fournisseur en un appel (« Vecteurs », contraintes globales du plan).
export const EMBED_BATCH = 64;
// Runs remis en file à chaque tic : la migration 0010 a remis tout l'historique en attente, et sans borne le
// premier tic en mettrait des milliers d'un coup dans la file.
export const REQUEUE_BATCH = 200;

export type PassageToEmbed = { id: string; text: string; acl: string[] };

// Les passages qui passent `where` et n'ont pas encore de vecteur de ce modèle. Sous la sécurité par ligne
// de `tx`.
export async function passagesWithoutVector(
  tx: Tx,
  model: string,
  where: SQL,
): Promise<PassageToEmbed[]> {
  return tx
    .select({ id: passages.id, text: passages.text, acl: passages.acl })
    .from(passages)
    .where(
      and(
        where,
        notExists(
          tx
            .select({ one: sql`1` })
            .from(passageVectors)
            .where(and(eq(passageVectors.passageId, passages.id), eq(passageVectors.model, model))),
        ),
      ),
    );
}

// Un vecteur doit avoir la dimension de la colonne : une autre dimension serait refusée par la base à
// chaque reprise, sans jamais passer.
function isValid(vectors: unknown, expected: number): vectors is number[][] {
  return (
    Array.isArray(vectors) &&
    vectors.length === expected &&
    vectors.every(
      (vector) =>
        Array.isArray(vector) &&
        vector.length === EMBEDDING_DIMS &&
        vector.every((x) => Number.isFinite(x)),
    )
  );
}

// Le message d'une erreur du fournisseur ne sort jamais dans les journaux : un fournisseur écrit mal peut y
// citer le texte envoyé ou sa clé. Seule une EmbedderError (message fixe) est journalisée telle quelle.
function logEmbedFailure(error: unknown, ids: Record<string, string>): void {
  logError(
    'search.embed_failed',
    error instanceof EmbedderError ? error : new Error('erreur inattendue du fournisseur'),
    ids,
  );
}

// Fabrique et écrit les vecteurs de ces passages, 64 textes à la fois. Le fournisseur est appelé hors de
// toute transaction (un appel réseau ne retient pas de connexion à la base). Rend le nombre de vecteurs
// écrits et `failed` si le fournisseur a échoué : le lot en cours et les suivants sont alors laissés à une
// prochaine reprise. Les erreurs de base remontent à l'appelant.
export async function embedPassages(
  ctx: TenantContext,
  embedder: Embedder,
  rows: PassageToEmbed[],
): Promise<{ stored: number; failed: boolean }> {
  let stored = 0;
  for (let from = 0; from < rows.length; from += EMBED_BATCH) {
    const batch = rows.slice(from, from + EMBED_BATCH);
    let vectors: number[][];
    try {
      const rendered = await embedder.embed(
        batch.map((row) => row.text),
        'document',
      );
      if (!isValid(rendered, batch.length)) {
        throw new EmbedderError('réponse inattendue du fournisseur');
      }
      vectors = rendered;
    } catch (error) {
      logEmbedFailure(error, { tenantId: ctx.tenantId });
      return { stored, failed: true };
    }
    const written = await withTenant(ctx, (tx) =>
      tx
        .insert(passageVectors)
        .values(
          batch.map((row, index) => ({
            passageId: row.id,
            tenantId: ctx.tenantId,
            model: embedder.model,
            embedding: vectors[index] as number[],
            acl: row.acl,
          })),
        )
        .onConflictDoNothing()
        .returning({ passageId: passageVectors.passageId }),
    );
    stored += written.length;
  }
  return { stored, failed: false };
}

type MissingRow = { passage_id: string; tenant_id: string; user_id: string };

// Complète, pour le modèle du fournisseur, les vecteurs des `limit` passages les plus récents qui n'en ont pas.
// La liste vient d'une fonction qui ne rend que des identifiants (passages_sans_vecteur) ; le texte est lu
// ensuite sous les droits du propriétaire de la source, organisation par organisation. Une organisation dont
// le fournisseur échoue n'empêche pas les suivantes. Rend le nombre de vecteurs écrits.
export async function embedMissing(deps: { embedder: Embedder }, limit: number): Promise<number> {
  const { embedder } = deps;
  const { rows } = await db.execute<MissingRow>(
    sql`select passage_id, tenant_id, user_id from passages_sans_vecteur(${embedder.model}, ${limit})`,
  );
  const groups = new Map<string, { tenantId: string; userId: string; ids: string[] }>();
  for (const row of rows) {
    const key = `${row.tenant_id}:${row.user_id}`;
    const group = groups.get(key) ?? { tenantId: row.tenant_id, userId: row.user_id, ids: [] };
    group.ids.push(row.passage_id);
    groups.set(key, group);
  }
  let total = 0;
  for (const group of groups.values()) {
    try {
      const ctx = await resolveTenantContext(group.userId, group.tenantId);
      // Le propriétaire a quitté l'organisation : personne ne peut lire ces passages sous ses droits.
      if (!ctx) continue;
      const missing = await withTenant(ctx, (tx) =>
        passagesWithoutVector(tx, embedder.model, inArray(passages.id, group.ids)),
      );
      total += (await embedPassages(ctx, embedder, missing)).stored;
    } catch (error) {
      logError('search.embed_missing_failed', error, { tenantId: group.tenantId });
    }
  }
  return total;
}

type StaleRunRow = { run_id: string; tenant_id: string; user_id: string };

// Remet en file les runs « en attente » depuis plus de `olderThanMinutes` (au plus REQUEUE_BATCH, les plus
// anciens d'abord). La liste vient de runs_en_attente, qui lit le dernier changement d'état (`updated_at`) :
// chaque run repris est d'abord rajeuni, sans quoi le tic suivant le remettrait en file à nouveau, puis mis
// en file sous les droits du propriétaire de sa source. Un run dont la mise en file échoue n'est pas compté ;
// il sera repris quand il aura de nouveau `olderThanMinutes` minutes. Rend le nombre de runs mis en file.
export async function requeueStaleRuns(olderThanMinutes: number): Promise<number> {
  const { rows } = await db.execute<StaleRunRow>(
    sql`select run_id, tenant_id, user_id from runs_en_attente(${olderThanMinutes}) limit ${REQUEUE_BATCH}`,
  );
  const contexts = new Map<string, Promise<TenantContext | null>>();
  let queued = 0;
  for (const row of rows) {
    const ids = { ingestRunId: row.run_id };
    try {
      const key = `${row.tenant_id}:${row.user_id}`;
      const pending = contexts.get(key) ?? resolveTenantContext(row.user_id, row.tenant_id);
      contexts.set(key, pending);
      const ctx = await pending;
      if (!ctx) continue;
      const claimed = await withTenant(ctx, (tx) =>
        tx
          .update(ingestRuns)
          .set({ updatedAt: new Date() })
          .where(and(eq(ingestRuns.id, row.run_id), eq(ingestRuns.status, 'queued')))
          .returning({ id: ingestRuns.id }),
      );
      if (claimed.length === 0) continue; // un autre tic ou le worker l'a déjà pris
      await enqueuePipelineStep('index', {
        ingestRunId: row.run_id,
        tenantId: row.tenant_id,
        userId: row.user_id,
      });
      queued += 1;
    } catch (error) {
      logError('search.requeue_failed', error, ids);
    }
  }
  return queued;
}

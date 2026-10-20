import { and, asc, eq, inArray, lt, ne, notExists, type SQL, sql } from 'drizzle-orm';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { ingestRuns, sources } from '@/server/db/schema/memory';
import { passages, passageVectors } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { EMBEDDING_DIMS, type Embedder, EmbedderError } from '@/server/embeddings/embedder';
import { logError } from '@/server/log';
import { enqueuePipelineStep, INDEX_PRIORITY } from '@/server/pipeline/queue';

// Les deux reprises de l'indexation (C5), lancées par le tic du worker de la recherche :
// - embedMissing complète les vecteurs qui manquent (fournisseur en panne pendant l'indexation, fournisseur
//   ou modèle changé après coup) ;
// - requeueStaleRuns remet en file les runs restés « en attente » sans job (mise en file ratée), ou restés
//   « en cours » ou « échoués » (processus mort, reprises épuisées).

// Textes envoyés au fournisseur en un appel (« Vecteurs », contraintes globales du plan).
export const EMBED_BATCH = 64;
// Runs remis en file à chaque tic : la migration 0010 a remis tout l'historique en attente, et sans borne le
// premier tic en mettrait des milliers d'un coup dans la file.
export const REQUEUE_BATCH = 200;
// Délai d'un appel au fournisseur de vecteurs. Un fournisseur dont la connexion pend retiendrait sinon un des
// quatre emplacements de la file `index` (ou l'unique emplacement du tic des vecteurs) jusqu'à l'abandon de
// `fetch`, 5 minutes plus tard : quatre runs bloqués et plus aucun run n'est indexé, plein texte compris.
export const EMBED_TIMEOUT_MS = 30_000;

export type PassageToEmbed = { id: string; text: string };

// Les passages qui passent `where` et n'ont pas encore de vecteur de ce modèle. Sous la sécurité par ligne
// de `tx`.
export async function passagesWithoutVector(
  tx: Tx,
  model: string,
  where: SQL,
): Promise<PassageToEmbed[]> {
  return tx
    .select({ id: passages.id, text: passages.text })
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

// Délai dépassé : le fournisseur ne répond pas, pour personne (le tic des vecteurs s'arrête alors).
class EmbedTimeoutError extends EmbedderError {}

// Borne un appel au fournisseur. La réponse tardive est perdue (l'appel lui-même ne s'annule pas : chaque
// fournisseur a sa propre échéance réseau, voir T30) ; son rejet éventuel est absorbé par la course.
function withDeadline<T>(call: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new EmbedTimeoutError('délai dépassé du fournisseur')),
      EMBED_TIMEOUT_MS,
    );
  });
  return Promise.race([call, deadline]).finally(() => clearTimeout(timer));
}

// Verrou partagé sur ces sources, pris avant de lire l'accès qu'on va recopier. Le recalcul d'un accès (retrait
// d'une part, T16) met à jour la source avant ses tours, passages et vecteurs : il attend la fin de notre
// transaction et voit ce qu'elle a écrit ; s'il est déjà passé, on lit l'accès déjà corrigé. Sans ce verrou, un
// passage ou un vecteur écrit pendant le recalcul garderait l'ancien accès. Les sources se verrouillent dans
// l'ordre de leur identifiant : deux transactions ne s'attendent jamais l'une l'autre.
export async function lockSources(tx: Tx, sourceIds: string[]): Promise<void> {
  if (sourceIds.length === 0) return;
  await tx
    .select({ id: sources.id })
    .from(sources)
    .where(inArray(sources.id, sourceIds))
    .orderBy(asc(sources.id))
    .for('share');
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
// toute transaction (un appel réseau ne retient pas de connexion à la base), avec un délai (EMBED_TIMEOUT_MS).
// Rend le nombre de vecteurs écrits, `failed` si le fournisseur a échoué (le lot en cours et les suivants sont
// alors laissés à une prochaine reprise) et `timedOut` s'il n'a pas répondu à temps. Les erreurs de base
// remontent à l'appelant.
//
// Le vecteur prend l'accès que son passage a au moment de l'écriture (sous le verrou de sa source, voir
// lockSources), pas celui qu'on a lu avant l'appel au fournisseur : un accès retiré entre-temps ne revient pas.
// Un passage supprimé pendant l'appel est laissé de côté.
export async function embedPassages(
  ctx: TenantContext,
  embedder: Embedder,
  rows: PassageToEmbed[],
): Promise<{ stored: number; failed: boolean; timedOut: boolean }> {
  let stored = 0;
  for (let from = 0; from < rows.length; from += EMBED_BATCH) {
    const batch = rows.slice(from, from + EMBED_BATCH);
    let vectors: number[][];
    try {
      const rendered = await withDeadline(
        embedder.embed(
          batch.map((row) => row.text),
          'document',
        ),
      );
      if (!isValid(rendered, batch.length)) {
        throw new EmbedderError('réponse inattendue du fournisseur');
      }
      vectors = rendered;
    } catch (error) {
      logEmbedFailure(error, { tenantId: ctx.tenantId });
      return { stored, failed: true, timedOut: error instanceof EmbedTimeoutError };
    }
    const ids = batch.map((row) => row.id);
    const written = await withTenant(ctx, async (tx) => {
      const owners = await tx
        .selectDistinct({ sourceId: passages.sourceId })
        .from(passages)
        .where(inArray(passages.id, ids));
      await lockSources(
        tx,
        owners.map((owner) => owner.sourceId),
      );
      const current = await tx
        .select({ id: passages.id, acl: passages.acl })
        .from(passages)
        .where(inArray(passages.id, ids));
      const aclOf = new Map(current.map((passage) => [passage.id, passage.acl]));
      const values = batch.flatMap((row, index) => {
        const acl = aclOf.get(row.id);
        if (!acl) return [];
        return [
          {
            passageId: row.id,
            tenantId: ctx.tenantId,
            model: embedder.model,
            embedding: vectors[index] as number[],
            acl,
          },
        ];
      });
      if (values.length === 0) return [];
      return tx
        .insert(passageVectors)
        .values(values)
        .onConflictDoNothing()
        .returning({ passageId: passageVectors.passageId });
    });
    stored += written.length;
  }
  return { stored, failed: false, timedOut: false };
}

type MissingRow = { passage_id: string; tenant_id: string; user_id: string };

// Complète, pour le modèle du fournisseur, les vecteurs des `limit` passages les plus récents qui n'en ont pas.
// La liste vient d'une fonction qui ne rend que des identifiants (passages_sans_vecteur) ; le texte est lu
// ensuite sous les droits du propriétaire de la source, organisation par organisation. Une organisation dont
// le fournisseur échoue n'empêche pas les suivantes, sauf s'il ne répond plus : le tic s'arrête alors (il
// attendrait EMBED_TIMEOUT_MS pour chaque organisation) et reprend au suivant. Rend le nombre de vecteurs écrits.
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
      const result = await embedPassages(ctx, embedder, missing);
      total += result.stored;
      if (result.timedOut) break;
    } catch (error) {
      logError('search.embed_missing_failed', error, { tenantId: group.tenantId });
    }
  }
  return total;
}

type StaleRunRow = { run_id: string; tenant_id: string; user_id: string };

// Remet en file les runs « en attente » depuis plus de `olderThanMinutes`, et ceux restés « en cours » ou
// « échoués » depuis plus de 30 minutes (processus mort, reprises de pg-boss épuisées), au plus REQUEUE_BATCH,
// les plus anciens d'abord. La liste vient de runs_en_attente, qui lit le dernier changement d'état
// (`updated_at`) : chaque run repris est d'abord rajeuni, sans quoi le tic suivant le remettrait en file à
// nouveau, puis mis en file sous les droits du propriétaire de sa source (l'indexation refait un run « en
// cours » ou « échoué » sans rien doubler). Un run dont la mise en file échoue n'est pas compté ;
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
          .where(
            and(
              eq(ingestRuns.id, row.run_id),
              ne(ingestRuns.status, 'done'),
              lt(ingestRuns.updatedAt, sql`now() - make_interval(mins => ${olderThanMinutes})`),
            ),
          )
          .returning({ id: ingestRuns.id }),
      );
      if (claimed.length === 0) continue; // un autre tic ou le worker l'a déjà pris (ou terminé)
      await enqueuePipelineStep(
        'index',
        { ingestRunId: row.run_id, tenantId: row.tenant_id, userId: row.user_id },
        { priority: INDEX_PRIORITY.reprise },
      );
      queued += 1;
    } catch (error) {
      logError('search.requeue_failed', error, ids);
    }
  }
  return queued;
}

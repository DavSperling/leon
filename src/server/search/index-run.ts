import { and, eq, inArray, ne } from 'drizzle-orm';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { signalSourceActivity } from '@/server/briefing/queue';
import { ingestRuns, turns } from '@/server/db/schema/memory';
import { passages } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import type { Embedder } from '@/server/embeddings/embedder';
import { logError } from '@/server/log';
import type { PipelineJob } from '@/server/pipeline/queue';
import { chunkText } from './chunk';
import { embedPassages, lockSources, passagesWithoutVector } from './embed-missing';

// L'indexation d'un run (C5) : découpe les tours qu'il nomme en passages, puis demande leurs vecteurs au
// fournisseur s'il y en a un. Le plein texte n'a besoin de rien d'autre : la recherche marche dès que les
// passages sont écrits, avec ou sans fournisseur, avec ou sans panne de celui-ci.

// Tours lus, découpés et écrits à la fois : un fil de 5 000 messages ne tient jamais en mémoire d'un bloc,
// et chaque transaction reste courte. 100 tours de 8 000 caractères donnent environ 800 passages.
const TURNS_PER_SLICE = 100;
// Passages par `insert` : 11 colonnes par ligne, loin de la limite de paramètres de Postgres.
const INSERT_BATCH = 400;

type RunScope = { sourceId: string; turnIds: string[] };

// Prend le run : « en cours », sauf s'il est déjà terminé. Un run `queued` est le cas normal ; `running` et
// `failed` sont la reprise d'une tentative interrompue ou échouée (pg-boss relance le job), qu'on refait
// sans rien doubler (les écritures ci-dessous sont sans effet quand elles existent déjà). Rend null quand
// le run n'existe pas, est déjà terminé, ou n'est pas visible de l'utilisateur du job.
async function claimRun(ctx: TenantContext, runId: string): Promise<RunScope | null> {
  const [run] = await withTenant(ctx, (tx) =>
    tx
      .update(ingestRuns)
      .set({ status: 'running', updatedAt: new Date() })
      .where(and(eq(ingestRuns.id, runId), ne(ingestRuns.status, 'done')))
      .returning({ sourceId: ingestRuns.sourceId, turnIds: ingestRuns.turnIds }),
  );
  return run ?? null;
}

// Découpe et écrit les passages de ces tours. Les passages déjà écrits (même tour, même rang) sont laissés.
// La source est verrouillée avant de lire l'accès des tours qu'on recopie sur les passages : un recalcul d'accès
// (retrait d'une part, T16) attend alors la fin de cette écriture, ou a déjà corrigé les tours (voir lockSources).
async function writePassages(tx: Tx, ctx: TenantContext, scope: RunScope, turnIds: string[]) {
  await lockSources(tx, [scope.sourceId]);
  const rows = await tx
    .select({
      id: turns.id,
      text: turns.text,
      ts: turns.ts,
      authorName: turns.authorName,
      authorEmail: turns.authorEmail,
      acl: turns.acl,
    })
    .from(turns)
    .where(and(inArray(turns.id, turnIds), eq(turns.sourceId, scope.sourceId)));
  const values = rows.flatMap((turn) =>
    chunkText(turn.text).map((chunk) => ({
      tenantId: ctx.tenantId,
      sourceId: scope.sourceId,
      turnId: turn.id,
      ord: chunk.ord,
      text: chunk.text,
      charStart: chunk.start,
      charEnd: chunk.end,
      ts: turn.ts,
      authorName: turn.authorName,
      authorEmail: turn.authorEmail,
      // Un passage a l'accès de son tour (0011).
      acl: turn.acl,
    })),
  );
  for (let from = 0; from < values.length; from += INSERT_BATCH) {
    await tx
      .insert(passages)
      .values(values.slice(from, from + INSERT_BATCH))
      .onConflictDoNothing({ target: [passages.turnId, passages.ord] });
  }
}

// Les vecteurs de tous les passages de ces tours qui n'en ont pas, pas seulement de ceux qu'on vient
// d'écrire : une reprise complète aussi ceux d'une tentative précédente.
async function embedSlice(ctx: TenantContext, embedder: Embedder, turnIds: string[]) {
  const missing = await withTenant(ctx, (tx) =>
    passagesWithoutVector(tx, embedder.model, inArray(passages.turnId, turnIds)),
  );
  return embedPassages(ctx, embedder, missing);
}

// De nouvelles données sur un projet font refaire les points du matin de ce projet (T13) : une session Claude Code
// (son projet), un élément GitHub (son dépôt). Le signal ne fait jamais échouer l'indexation, déjà terminée : un
// point qui n'est pas refait reste lisible, et se refera au prochain signal ou au tic du matin.
async function signalBriefings(ctx: TenantContext, sourceId: string): Promise<void> {
  try {
    await signalSourceActivity(ctx, sourceId);
  } catch (error) {
    logError('search.signal_failed', error, { sourceId });
  }
}

// Rend « indexe » une fois le run traité, « absent » quand il n'y a rien à faire (inconnu, invisible, déjà
// terminé). Une panne de base remonte : le worker marque le run « failed » et pg-boss relance le job.
// Une panne du fournisseur de vecteurs, elle, ne fait pas échouer le run : les passages sont écrits, les
// vecteurs manquants sont complétés plus tard (embedMissingBatch). Un fournisseur qui ne répond pas compte pour une
// panne au bout de EMBED_TIMEOUT_MS : il ne retient pas l'emplacement de la file et ne retarde pas le plein texte.
export async function indexIngestRun(
  job: PipelineJob,
  deps: { embedder: Embedder | null },
): Promise<'indexe' | 'absent'> {
  const ctx = await resolveTenantContext(job.userId, job.tenantId);
  if (!ctx) return 'absent';
  const scope = await claimRun(ctx, job.ingestRunId);
  if (!scope) return 'absent';

  // Une fois le fournisseur tombé, on ne l'interroge plus pour ce run : chaque tranche aurait son appel perdu.
  let embedder = deps.embedder;
  for (let from = 0; from < scope.turnIds.length; from += TURNS_PER_SLICE) {
    const slice = scope.turnIds.slice(from, from + TURNS_PER_SLICE);
    await withTenant(ctx, (tx) => writePassages(tx, ctx, scope, slice));
    if (embedder && (await embedSlice(ctx, embedder, slice)).failed) embedder = null;
  }

  await withTenant(ctx, (tx) =>
    tx
      .update(ingestRuns)
      .set({ status: 'done', step: 'done', error: null, updatedAt: new Date() })
      .where(eq(ingestRuns.id, job.ingestRunId)),
  );
  await signalBriefings(ctx, scope.sourceId);
  return 'indexe';
}

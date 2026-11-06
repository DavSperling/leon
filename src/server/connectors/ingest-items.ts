import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ProviderId } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import {
  createIngestRun,
  enqueueIndexing,
  insertNewTurns,
  updateSource,
} from '@/server/ingest/ingest-turns';
import { textArray } from '@/server/search/filters-sql';
import { unlinkSources } from '@/server/sessions/thread-links';
import type { NormalizedItem } from './normalize';

export type ConnectionRef = {
  id: string;
  provider: ProviderId;
  createdBy: string;
  privateRaw?: boolean; // texte brut privé au créateur (voir Connector.privateRaw)
};

// Une source par élément, au nom du créateur de la connexion, visible de toute l'équipe (sauf
// texte brut privé) : la source garde son origine (outil, nature, lien, espace) pour la future
// couche de droits.
async function upsertItemSource(
  tx: Tx,
  ctx: TenantContext,
  connection: ConnectionRef,
  item: NormalizedItem,
  acl: string[],
): Promise<string> {
  const title = item.title || null;
  const metadata = {
    nature: item.nature,
    url: item.url,
    origin: item.origin,
    updatedAt: item.updatedAt,
  };
  const [source] = await tx
    .insert(sources)
    .values({
      tenantId: ctx.tenantId,
      kind: connection.provider,
      externalId: item.externalId,
      ownerUserId: connection.createdBy,
      title,
      acl,
      connectionId: connection.id,
      metadata,
    })
    .onConflictDoUpdate({
      target: [sources.tenantId, sources.ownerUserId, sources.kind, sources.externalId],
      set: { title, metadata, connectionId: connection.id },
    })
    .returning({ id: sources.id });
  if (!source) throw new Error('source non créée');
  return source.id;
}

// `ctx` est celui du créateur de la connexion. Les éléments d'un appel entrent dans une seule
// transaction ; l'indexation est mise en file après le commit, un échec est journalisé sans faire
// échouer l'ingestion. `sources` compte les sources créées ou mises à jour, `turns` les tours nouveaux.
export async function ingestConnectorItems(
  ctx: TenantContext,
  connection: ConnectionRef,
  items: NormalizedItem[],
): Promise<{ sources: number; turns: number; runs: string[] }> {
  const acl = connection.privateRaw ? [connection.createdBy] : [ctx.tenantId];
  const created = await withTenant(ctx, async (tx) => {
    const result = { turns: 0, runs: [] as string[] };
    for (const item of items) {
      const sourceId = await upsertItemSource(tx, ctx, connection, item, acl);
      const rows = item.turns.map((turn) => ({
        tenantId: ctx.tenantId,
        sourceId,
        externalId: turn.externalId,
        role: turn.role,
        text: turn.text,
        ts: turn.ts,
        captureMode: 'connector' as const,
        authorName: turn.authorName,
        authorEmail: turn.authorEmail,
        authorSide: turn.authorSide,
        internalNote: turn.internalNote,
        acl,
      }));
      const { ids, lastTs } = await insertNewTurns(tx, rows);
      await updateSource(tx, sourceId, undefined, lastTs);
      result.turns += ids.length;
      if (ids.length > 0) result.runs.push(await createIngestRun(tx, ctx, sourceId, ids, acl));
    }
    return result;
  });
  for (const runId of created.runs) await enqueueIndexing(ctx, runId);
  return { sources: items.length, ...created };
}

// Retire les sources que la connexion signale (un événement devenu privé), par la fonction de 0019 (0020) :
// seulement celles de son outil et de son créateur (`ctx`), y compris celles relevées par une connexion supprimée
// depuis. Tours, passages, vecteurs, runs et journal des
// lectures partent avec elles (clés en cascade). L'app n'a pas d'autre droit de supprimer du brut. Elles quittent
// ensuite les fils qui les reliaient (T42).
export async function removeConnectorItems(
  ctx: TenantContext,
  connection: ConnectionRef,
  externalIds: string[],
): Promise<number> {
  const { removed, ids } = await withTenant(ctx, async (tx) => {
    const gone = await tx
      .select({ id: sources.id })
      .from(sources)
      .where(
        and(
          eq(sources.tenantId, ctx.tenantId),
          eq(sources.ownerUserId, connection.createdBy),
          eq(sources.kind, connection.provider),
          inArray(sources.externalId, externalIds),
        ),
      );
    const result = await tx.execute<{ n: number }>(
      sql`select retirer_sources_connexion(${connection.id}, ${textArray(externalIds)}) as n`,
    );
    return { removed: result.rows[0]?.n ?? 0, ids: gone.map((row) => row.id) };
  });
  await unlinkSources(ctx.tenantId, ids);
  return removed;
}

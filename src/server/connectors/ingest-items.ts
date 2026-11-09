import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ProviderId } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { connections } from '@/server/db/schema/connections';
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

// Une source par élément, au nom du créateur de la connexion, à l'accès que la connexion donne : la source garde son
// origine (outil, nature, lien, espace). Une source déjà là garde son accès (seul partager_connexion le change), sauf
// une source reprise d'une connexion supprimée, qui prend celui de la connexion : ses nouveaux tours prennent le sien,
// rendu ici.
async function upsertItemSource(
  tx: Tx,
  ctx: TenantContext,
  connection: ConnectionRef,
  item: NormalizedItem,
  acl: string[],
  reprise: boolean,
): Promise<{ id: string; acl: string[] }> {
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
      set: { title, metadata, connectionId: connection.id, ...(reprise ? { acl } : {}) },
    })
    .returning({ id: sources.id, acl: sources.acl });
  if (!source) throw new Error('source non créée');
  return source;
}

// `ctx` est celui du créateur de la connexion. Les éléments d'un appel entrent dans une seule
// transaction ; l'indexation est mise en file après le commit, un échec est journalisé sans faire
// échouer l'ingestion. `sources` compte les sources créées ou mises à jour, `turns` les tours nouveaux.
export async function ingestConnectorItems(
  ctx: TenantContext,
  connection: ConnectionRef,
  items: NormalizedItem[],
): Promise<{ sources: number; turns: number; runs: string[] }> {
  const created = await withTenant(ctx, async (tx) => {
    // Le partage choisi (0056), sous verrou partagé : partager_connexion attend la fin de cette relève, ou passe avant.
    const [chosen] = await tx
      .select({ partage: connections.partage })
      .from(connections)
      .where(eq(connections.id, connection.id))
      .for('share');
    const acl =
      chosen?.partage ?? (connection.privateRaw ? [connection.createdBy] : [ctx.tenantId]);
    // Les sources d'une connexion supprimée depuis, que celle-ci relit (l'outil rebranché) : elles prennent son accès,
    // et tout ce qui en descend avec, au lieu de garder celui de l'ancienne.
    const reprises = await tx
      .select({ id: sources.id, externalId: sources.externalId })
      .from(sources)
      .where(
        and(
          eq(sources.tenantId, ctx.tenantId),
          eq(sources.ownerUserId, connection.createdBy),
          eq(sources.kind, connection.provider),
          inArray(
            sources.externalId,
            items.map((item) => item.externalId),
          ),
          isNull(sources.connectionId),
        ),
      );
    const repris = new Set(reprises.map((row) => row.externalId));
    const result = { turns: 0, runs: [] as string[] };
    for (const item of items) {
      const { id: sourceId, acl: sourceAcl } = await upsertItemSource(
        tx,
        ctx,
        connection,
        item,
        acl,
        repris.has(item.externalId),
      );
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
        acl: sourceAcl,
      }));
      const { ids, lastTs } = await insertNewTurns(tx, rows);
      await updateSource(tx, sourceId, undefined, lastTs);
      result.turns += ids.length;
      if (ids.length > 0)
        result.runs.push(await createIngestRun(tx, ctx, sourceId, ids, sourceAcl));
    }
    if (reprises.length > 0) {
      const ids = textArray(reprises.map((row) => row.id));
      await tx.execute(sql`select recopier_acl_mes_sources(${ids}::uuid[])`);
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

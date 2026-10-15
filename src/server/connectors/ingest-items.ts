import type { ProviderId } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import {
  createIngestRun,
  enqueueTriage,
  insertNewTurns,
  updateSource,
} from '@/server/ingest/ingest-turns';
import type { NormalizedItem } from './normalize';

export type ConnectionRef = { id: string; provider: ProviderId; createdBy: string };

// Une source par élément, au nom du créateur de la connexion, visible de toute l'équipe : la
// source garde son origine (outil, nature, lien, espace) pour la future couche de droits.
async function upsertItemSource(
  tx: Tx,
  ctx: TenantContext,
  connection: ConnectionRef,
  item: NormalizedItem,
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
      acl: [ctx.tenantId],
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
// transaction ; le triage est mis en file après le commit, un échec est journalisé sans faire
// échouer l'ingestion. `sources` compte les sources créées ou mises à jour, `turns` les tours nouveaux.
export async function ingestConnectorItems(
  ctx: TenantContext,
  connection: ConnectionRef,
  items: NormalizedItem[],
): Promise<{ sources: number; turns: number; runs: string[] }> {
  const acl = [ctx.tenantId];
  const created = await withTenant(ctx, async (tx) => {
    const result = { turns: 0, runs: [] as string[] };
    for (const item of items) {
      const sourceId = await upsertItemSource(tx, ctx, connection, item);
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
  for (const runId of created.runs) await enqueueTriage(ctx, runId);
  return { sources: items.length, ...created };
}

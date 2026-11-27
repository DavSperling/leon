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
import { type NormalizedItem, normalizeAudience, turnStem } from './normalize';
import type { Audience } from './types';

export type ConnectionRef = {
  id: string;
  provider: ProviderId;
  createdBy: string;
  privateRaw?: boolean; // texte brut privé au créateur (voir Connector.privateRaw)
};

type Written = { turns: number; runs: string[] };

const metadataOf = (item: NormalizedItem) => ({
  nature: item.nature,
  url: item.url,
  origin: item.origin,
  updatedAt: item.updatedAt,
});

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
  const metadata = metadataOf(item);
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

// Les tours nouveaux d'un élément, à l'accès de sa source, et un run s'il y en a.
async function writeTurns(
  tx: Tx,
  ctx: TenantContext,
  source: { id: string; acl: string[] },
  item: NormalizedItem,
  result: Written,
): Promise<void> {
  const rows = item.turns.map((turn) => ({
    tenantId: ctx.tenantId,
    sourceId: source.id,
    externalId: turn.externalId,
    role: turn.role,
    text: turn.text,
    ts: turn.ts,
    captureMode: 'connector' as const,
    authorName: turn.authorName,
    authorEmail: turn.authorEmail,
    authorSide: turn.authorSide,
    internalNote: turn.internalNote,
    recipientsTo: turn.recipientsTo,
    recipientsCc: turn.recipientsCc,
    automated: turn.automated,
    acl: source.acl,
  }));
  const { ids, lastTs } = await insertNewTurns(tx, rows);
  await updateSource(tx, source.id, undefined, lastTs);
  result.turns += ids.length;
  if (ids.length > 0) result.runs.push(await createIngestRun(tx, ctx, source.id, ids, source.acl));
}

// Les éléments sans lieu : une source par élément et par créateur, à l'accès de la connexion.
async function writeOwnItems(
  tx: Tx,
  ctx: TenantContext,
  connection: ConnectionRef,
  items: NormalizedItem[],
  result: Written,
): Promise<void> {
  // Le partage choisi (0056), sous verrou partagé : partager_connexion attend la fin de cette relève, ou passe avant.
  const [chosen] = await tx
    .select({ partage: connections.partage })
    .from(connections)
    .where(eq(connections.id, connection.id))
    .for('share');
  const acl = chosen?.partage ?? (connection.privateRaw ? [connection.createdBy] : [ctx.tenantId]);
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
  for (const item of items) {
    const source = await upsertItemSource(
      tx,
      ctx,
      connection,
      item,
      acl,
      repris.has(item.externalId),
    );
    await writeTurns(tx, ctx, source, item, result);
  }
  if (reprises.length > 0) {
    const ids = textArray(reprises.map((row) => row.id));
    await tx.execute(sql`select recopier_acl_mes_sources(${ids}::uuid[])`);
  }
}

// Les lieux de la page (0097) : chacun garde ses membres du jour, et tout ce qui en a déjà été relevé prend leur accès.
async function alignPlaces(
  tx: Tx,
  connection: ConnectionRef,
  audiences: Audience[],
): Promise<void> {
  // Dans l'ordre des clés : aligner_lieu garde la ligne du lieu jusqu'à la fin de la transaction, et deux collègues
  // relevés en même temps, qui listent les mêmes lieux dans un ordre différent, s'interbloqueraient.
  const ordered = [...audiences].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const audience of ordered) {
    const place = normalizeAudience(audience, connection.provider);
    if (!place) continue;
    const members = place.team ? [] : place.members;
    await tx.execute(
      sql`select aligner_lieu(${connection.id}, ${place.key}, ${place.team === true},
            ${textArray(members.map((m) => m.email ?? ''))},
            ${textArray(members.map((m) => m.id ?? ''))},
            ${textArray(members.map((m) => m.since ?? '-infinity'))}::timestamptz[])`,
    );
  }
}

// Les éléments d'un lieu : une seule source par élément dans l'organisation, à l'accès de son lieu. Qui relève n'a pas
// accès à un élément dont le premier message précède son historique : un autre membre l'écrira.
async function writePlacedItems(
  tx: Tx,
  ctx: TenantContext,
  connection: ConnectionRef,
  items: NormalizedItem[],
  result: Written,
): Promise<void> {
  for (const item of items) {
    const start = new Date(Math.min(...item.turns.map((turn) => turn.ts.getTime())));
    const found = await tx.execute<{ source_id: string; source_acl: string[] }>(
      sql`select * from relever_source_lieu(${connection.id}, ${item.audience}, ${item.externalId},
            ${item.title || null}, ${JSON.stringify(metadataOf(item))}::jsonb, ${start.toISOString()}::timestamptz)`,
    );
    const [source] = found.rows;
    if (source)
      await writeTurns(tx, ctx, { id: source.source_id, acl: source.source_acl }, item, result);
  }
}

// `ctx` est celui du créateur de la connexion. Les éléments d'un appel entrent dans une seule
// transaction ; l'indexation est mise en file après le commit, un échec est journalisé sans faire
// échouer l'ingestion. `sources` compte les sources créées ou mises à jour, `turns` les tours nouveaux.
// `audiences` : les lieux lus (0097), alignés même sans élément nouveau.
export async function ingestConnectorItems(
  ctx: TenantContext,
  connection: ConnectionRef,
  items: NormalizedItem[],
  audiences: Audience[] = [],
): Promise<{ sources: number; turns: number; runs: string[] }> {
  const created = await withTenant(ctx, async (tx) => {
    const result: Written = { turns: 0, runs: [] };
    const own = items.filter((item) => item.audience === undefined);
    if (own.length > 0) await writeOwnItems(tx, ctx, connection, own, result);
    const placed = items.filter((item) => item.audience !== undefined);
    await alignPlaces(tx, connection, audiences);
    await writePlacedItems(tx, ctx, connection, placed, result);
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

// Retire des tours précis (un message supprimé dans un fil Teams), par la fonction de 0095, dans les sources de l'outil
// et du créateur de la connexion ; une source restée sans tour part aussi, et quitte les fils qui la reliaient (T42).
// `turnIds` sont ceux de l'outil : la fonction retrouve leurs parts rangées (racine, empreinte). Rend le nombre de
// tours retirés.
export async function removeConnectorTurns(
  ctx: TenantContext,
  connection: ConnectionRef,
  turnIds: string[],
): Promise<number> {
  const result = await withTenant(ctx, (tx) =>
    tx.execute<{ retires: number; vides: string[] }>(
      sql`select * from retirer_tours_connexion(${connection.id}, ${textArray(turnIds.map(turnStem))})`,
    ),
  );
  const [row] = result.rows;
  await unlinkSources(ctx.tenantId, row?.vides ?? []);
  return row?.retires ?? 0;
}

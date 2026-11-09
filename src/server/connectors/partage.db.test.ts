import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteGroup, listGroups, saveGroup, setGroupMembers } from '@/server/auth/groupes';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { enqueuePipelineStep, type PipelineJob } from '@/server/pipeline/queue';
import { indexIngestRun } from '@/server/search/index-run';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { listConnections, shareConnection } from './connections';
import { type ConnectionRef, ingestConnectorItems } from './ingest-items';
import { normalizeItem } from './normalize';

// L'indexation est mise en file ; ici on l'appelle à la main, pour que passages et vecteurs existent.
vi.mock('@/server/pipeline/queue');

// Ana (propriétaire) et Ben (dev) branchent ; Cléo (dev) et Dan (ventes) lisent ; Zoé dans une autre organisation.
const tenantIds: string[] = [];
let ana: TenantContext;
let ben: TenantContext;
let cleo: TenantContext;
let dan: TenantContext;
let zoe: TenantContext;
let dev: string;

beforeAll(async () => {
  const team = await createTestTenant(['Ana', 'Ben', 'Cléo', 'Dan']);
  const other = await createTestTenant(['Zoé']);
  [ana, ben, cleo, dan] = team.members as [
    TenantContext,
    TenantContext,
    TenantContext,
    TenantContext,
  ];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
  const place = (ctx: TenantContext, values: { department: string; role?: string }) =>
    adminDb
      .update(members)
      .set(values)
      .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));
  await place(ana, { department: 'leadership', role: 'owner' });
  await place(ben, { department: 'engineering' });
  await place(cleo, { department: 'engineering' });
  await place(dan, { department: 'sales' });
  const group = (await listGroups(ana)).find((g) => g.service === 'engineering');
  if (!group) throw new Error('pas de groupe dev');
  dev = group.id;
});

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

const fresh = async (ctx: TenantContext) => {
  const next = await resolveTenantContext(ctx.userId, ctx.tenantId);
  if (!next) throw new Error('contexte introuvable');
  return next;
};

// Relève un ticket par la connexion et l'indexe (passages et vecteurs) ; rend l'id de sa source.
async function ingest(ctx: TenantContext, connection: ConnectionRef, externalId: string) {
  const item = normalizeItem(
    {
      externalId,
      nature: 'ticket',
      title: `Ticket ${externalId}`,
      url: `https://github.com/acme/leon/issues/${externalId}`,
      updatedAt: '2026-11-09T09:00:00Z',
      origin: { repo: 'acme/leon' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Ben', email: 'ben@acme.test' },
          text: `Contenu du ticket ${externalId}.`,
          ts: '2026-11-09T09:00:00Z',
        },
      ],
    },
    connection.provider,
  );
  if (!item) throw new Error('élément refusé');
  vi.mocked(enqueuePipelineStep).mockClear();
  await ingestConnectorItems(ctx, connection, [item]);
  for (const [, job] of vi.mocked(enqueuePipelineStep).mock.calls)
    await indexIngestRun(job as PipelineJob, { embedder: createFakeEmbedder() });
  const { rows } = await adminPool.query(
    'select id from sources where connection_id = $1 and external_id = $2',
    [connection.id, externalId],
  );
  return rows[0].id as string;
}

// Toutes les ACL de ce qui descend d'une source, distinctes : une seule si la recopie est complète.
async function aclsBelow(sourceId: string): Promise<string[][]> {
  const { rows } = await adminPool.query<{ acl: string[] }>(
    `select distinct acl from (
       select acl from sources where id = $1
       union all select acl from turns where source_id = $1
       union all select acl from ingest_runs where source_id = $1
       union all select acl from passages where source_id = $1
       union all select v.acl from passage_vectors v join passages p on p.id = v.passage_id
        where p.source_id = $1) t`,
    [sourceId],
  );
  return rows.map((row) => row.acl);
}

const partageOf = async (ctx: TenantContext, id: string) =>
  (await listConnections(ctx)).find((c) => c.id === id)?.partage;

describe('partager une connexion (0056)', () => {
  it("sans choix, l'outil décide : toute l'équipe, ou son créateur seul pour une boîte mail", async () => {
    const github = { id: await seedConnection(ben), provider: 'github', createdBy: ben.userId };
    const gmail = {
      id: await seedConnection(ben, { provider: 'gmail' }),
      provider: 'gmail',
      createdBy: ben.userId,
      privateRaw: true,
    } satisfies ConnectionRef;
    expect(await aclsBelow(await ingest(ben, github as ConnectionRef, 'g1'))).toEqual([
      [ben.tenantId],
    ]);
    expect(await aclsBelow(await ingest(ben, gmail, 'm1'))).toEqual([[ben.userId]]);
    expect(await partageOf(dan, github.id)).toBeNull();
  });

  it('le créateur la partage à un groupe : le déjà relevé suit, et la relève suivante aussi', async () => {
    const connection: ConnectionRef = {
      id: await seedConnection(ben),
      provider: 'github',
      createdBy: ben.userId,
    };
    const before = await ingest(ben, connection, 'a1');
    expect(await shareConnection(await fresh(ben), connection.id, dev)).toBe(true);
    expect(await aclsBelow(before)).toEqual([[ben.userId, dev]]);
    expect(await aclsBelow(await ingest(ben, connection, 'a2'))).toEqual([[ben.userId, dev]]);
    // Tous voient le choix ; seuls Ben et le groupe Dev voient le contenu.
    expect(await partageOf(dan, connection.id)).toBe(dev);

    expect(await shareConnection(await fresh(ben), connection.id, 'moi')).toBe(true);
    expect(await aclsBelow(before)).toEqual([[ben.userId]]);
    expect(await partageOf(cleo, connection.id)).toBe('moi');
  });

  it("une boîte mail s'ouvre à toute l'équipe si son créateur le choisit", async () => {
    const gmail: ConnectionRef = {
      id: await seedConnection(ben, { provider: 'gmail' }),
      provider: 'gmail',
      createdBy: ben.userId,
      privateRaw: true,
    };
    const mail = await ingest(ben, gmail, 'm2');
    expect(await shareConnection(await fresh(ben), gmail.id, 'equipe')).toBe(true);
    expect(await aclsBelow(mail)).toEqual([[ben.tenantId]]);
    expect(await partageOf(dan, gmail.id)).toBe('equipe');
  });

  it("personne d'autre que le créateur ne la partage, pas même un administrateur", async () => {
    const connection: ConnectionRef = {
      id: await seedConnection(ben),
      provider: 'github',
      createdBy: ben.userId,
    };
    const source = await ingest(ben, connection, 'b1');
    expect(await shareConnection(await fresh(cleo), connection.id, 'equipe')).toBe(false);
    expect(await shareConnection(await fresh(ana), connection.id, 'moi')).toBe(false);
    expect(await shareConnection(zoe, connection.id, 'moi')).toBe(false);
    expect(await aclsBelow(source)).toEqual([[ben.tenantId]]);
    expect(await partageOf(ben, connection.id)).toBeNull();
  });

  it("refuse un groupe d'une autre organisation", async () => {
    const theirs = await saveGroup(ana, null, 'Groupe à part');
    if (typeof theirs === 'string') throw new Error(theirs);
    const connection = await seedConnection(zoe);
    expect(await shareConnection(zoe, connection, theirs.id)).toBe(false);
    expect(await partageOf(zoe, connection)).toBeNull();
  });

  it('supprimer un groupe rend ses connexions et ce qu’elles ont relevé à leur créateur', async () => {
    const created = await saveGroup(ana, null, 'Éphémère connexions');
    if (typeof created === 'string') throw new Error(created);
    const memberIds = await adminPool.query<{ id: string }>(
      'select id from member where "userId" = any($1) and "organizationId" = $2',
      [[ben.userId, dan.userId], ben.tenantId],
    );
    expect(
      await setGroupMembers(
        ana,
        created.id,
        memberIds.rows.map((row) => row.id),
      ),
    ).toBe(true);
    const connection: ConnectionRef = {
      id: await seedConnection(ben),
      provider: 'github',
      createdBy: ben.userId,
    };
    const source = await ingest(ben, connection, 'c1');
    expect(await shareConnection(await fresh(ben), connection.id, created.id)).toBe(true);

    expect(await deleteGroup(ana, created.id)).toBe(true);
    expect(await aclsBelow(source)).toEqual([[ben.userId]]);
    expect(await partageOf(ben, connection.id)).toBe('moi');
    // La relève suivante écrit aussi à l'accès réduit.
    expect(await aclsBelow(await ingest(ben, connection, 'c2'))).toEqual([[ben.userId]]);
  });
});

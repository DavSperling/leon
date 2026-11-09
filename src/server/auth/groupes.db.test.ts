import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { members } from '@/server/db/schema/auth';
import { addDocument, listDocuments, shareDocuments } from '@/server/documents/documents';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { enqueuePipelineStep, type PipelineJob } from '@/server/pipeline/queue';
import { indexIngestRun } from '@/server/search/index-run';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { deleteGroup, listGroups, saveGroup, setGroupMembers } from './groupes';
import { resolveTenantContext, type TenantContext } from './tenant-context';

// L'ajout d'un document met en file l'indexation ; ici on l'appelle à la main.
vi.mock('@/server/pipeline/queue');
vi.mock('@/server/briefing/queue');

// Ana (propriétaire, direction), Ben (dev), Cléo (dev), Dan (ventes) ; Zoé dans une autre organisation.
const tenantIds: string[] = [];
let tenantId: string;
let ana: TenantContext;
let ben: TenantContext;
let cleo: TenantContext;
let dan: TenantContext;
let zoe: TenantContext;

const memberIdOf = async (ctx: TenantContext) => {
  const [row] = await adminDb
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));
  if (!row) throw new Error('membre introuvable');
  return row.id;
};
// Les principals se lisent à chaque requête : après un changement de groupe, on relit le contexte.
const fresh = async (ctx: TenantContext) => {
  const next = await resolveTenantContext(ctx.userId, ctx.tenantId);
  if (!next) throw new Error('contexte introuvable');
  return next;
};
const titles = async (ctx: TenantContext) =>
  (await listDocuments(await fresh(ctx))).map((d) => d.title);

async function upload(ctx: TenantContext, name: string, partage: string) {
  await addDocument(ctx, new File([`Contenu de ${name}.`], name), undefined, partage);
  const job = vi.mocked(enqueuePipelineStep).mock.lastCall?.[1] as PipelineJob;
  await indexIngestRun(job, { embedder: createFakeEmbedder() });
  const { rows } = await adminPool.query('select source_id from ingest_runs where id = $1', [
    job.ingestRunId,
  ]);
  return rows[0].source_id as string;
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

beforeAll(async () => {
  const team = await createTestTenant(['Ana', 'Ben', 'Cléo', 'Dan']);
  const other = await createTestTenant(['Zoé']);
  tenantId = team.tenantId;
  [ana, ben, cleo, dan] = team.members as [
    TenantContext,
    TenantContext,
    TenantContext,
    TenantContext,
  ];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
  const place = (ctx: TenantContext, department: string) =>
    adminDb
      .update(members)
      .set({ department })
      .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));
  await adminDb
    .update(members)
    .set({ role: 'owner' })
    .where(and(eq(members.userId, ana.userId), eq(members.organizationId, tenantId)));
  await place(ana, 'leadership');
  await place(ben, 'engineering');
  await place(cleo, 'engineering');
  await place(dan, 'sales');
});

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

const serviceGroup = async (service: string) => {
  const groups = await listGroups(ana);
  const group = groups.find((g) => g.service === service);
  if (!group) throw new Error(`pas de groupe ${service}`);
  return group;
};

describe('groupes de service (0055)', () => {
  it('chaque service des membres devient un groupe, et ses membres sont ceux du service', async () => {
    const dev = await serviceGroup('engineering');
    expect(dev.nom).toBeNull();
    expect(dev.membres.sort()).toEqual([await memberIdOf(ben), await memberIdOf(cleo)].sort());
    expect((await fresh(ben)).principals).toContain(dev.id);
    expect((await fresh(dan)).principals).not.toContain(dev.id);
  });

  it('un groupe de service ne se renomme, ne se compose ni ne se supprime', async () => {
    const dev = await serviceGroup('engineering');
    expect(await saveGroup(ana, dev.id, 'Autre')).toBe('refuse');
    expect(await setGroupMembers(ana, dev.id, [await memberIdOf(dan)])).toBe(false);
    expect(await deleteGroup(ana, dev.id)).toBe(false);
    expect((await fresh(dan)).principals).not.toContain(dev.id);
  });
});

describe('groupes libres', () => {
  it('seul un propriétaire ou un administrateur en crée et en choisit les membres', async () => {
    expect(await saveGroup(ben, null, 'Club de Ben')).toBe('refuse');
    const created = await saveGroup(ana, null, 'Direction');
    if (typeof created === 'string') throw new Error(created);
    expect(await saveGroup(ana, null, 'direction')).toBe('nom_pris');
    expect(await setGroupMembers(ben, created.id, [await memberIdOf(ben)])).toBe(false);
    expect((await fresh(ben)).principals).not.toContain(created.id);

    expect(
      await setGroupMembers(ana, created.id, [await memberIdOf(ana), await memberIdOf(dan)]),
    ).toBe(true);
    expect((await fresh(dan)).principals).toContain(created.id);
    // Dan sort : il perd le groupe à la requête suivante.
    expect(await setGroupMembers(ana, created.id, [await memberIdOf(ana)])).toBe(true);
    expect((await fresh(dan)).principals).not.toContain(created.id);
  });

  it("refuse un membre d'une autre organisation, sans rien changer", async () => {
    const created = await saveGroup(ana, null, 'Projet X');
    if (typeof created === 'string') throw new Error(created);
    expect(
      await setGroupMembers(ana, created.id, [await memberIdOf(ben), await memberIdOf(zoe)]),
    ).toBe(false);
    const group = (await listGroups(ana)).find((g) => g.id === created.id);
    expect(group?.membres).toEqual([]);
  });

  it('une autre organisation ne voit pas les groupes, ni ne peut y partager', async () => {
    const dev = await serviceGroup('engineering');
    expect((await listGroups(zoe)).some((g) => g.id === dev.id)).toBe(false);
    await expect(
      addDocument(zoe, new File(['secret'], 'zoe.txt'), undefined, dev.id),
    ).rejects.toThrow();
  });
});

describe('partager un document à un groupe', () => {
  it("n'est visible que du groupe et de l'auteur, sur tout ce qui en descend", async () => {
    const dev = await serviceGroup('engineering');
    const sourceId = await upload(ben, 'archi.txt', dev.id);
    expect(await aclsBelow(sourceId)).toEqual([[ben.userId, dev.id]]);
    expect(await titles(ben)).toContain('archi.txt');
    expect(await titles(cleo)).toContain('archi.txt');
    expect(await titles(dan)).not.toContain('archi.txt');
    expect(await titles(ana)).not.toContain('archi.txt');
  });

  it("l'auteur change le partage ; la recopie touche tours, runs, passages et vecteurs", async () => {
    const dev = await serviceGroup('engineering');
    const sourceId = await upload(ben, 'plan.txt', 'equipe');
    expect(await titles(dan)).toContain('plan.txt');

    expect(await shareDocuments(await fresh(ben), { id: sourceId }, dev.id)).toBe(1);
    expect(await aclsBelow(sourceId)).toEqual([[ben.userId, dev.id]]);
    expect(await titles(dan)).not.toContain('plan.txt');

    expect(await shareDocuments(await fresh(ben), { id: sourceId }, 'moi')).toBe(1);
    expect(await aclsBelow(sourceId)).toEqual([[ben.userId]]);
    expect(await titles(cleo)).not.toContain('plan.txt');
  });

  it("personne d'autre que l'auteur ne change le partage, pas même un membre du groupe", async () => {
    const dev = await serviceGroup('engineering');
    const sourceId = await upload(ben, 'note.txt', dev.id);
    expect(await shareDocuments(await fresh(cleo), { id: sourceId }, 'equipe')).toBe(0);
    expect(await shareDocuments(await fresh(ana), { id: sourceId }, 'equipe')).toBe(0);
    expect(await aclsBelow(sourceId)).toEqual([[ben.userId, dev.id]]);
  });

  it('supprimer un groupe rend ses documents à leur seul auteur', async () => {
    const created = await saveGroup(ana, null, 'Éphémère');
    if (typeof created === 'string') throw new Error(created);
    await setGroupMembers(ana, created.id, [await memberIdOf(ben), await memberIdOf(dan)]);
    const sourceId = await upload(await fresh(ben), 'brouillon.txt', created.id);
    expect(await titles(dan)).toContain('brouillon.txt');

    expect(await deleteGroup(ben, created.id)).toBe(false);
    expect(await deleteGroup(ana, created.id)).toBe(true);
    expect(await aclsBelow(sourceId)).toEqual([[ben.userId]]);
    expect(await titles(dan)).not.toContain('brouillon.txt');
    expect(await titles(ben)).toContain('brouillon.txt');
  });
});

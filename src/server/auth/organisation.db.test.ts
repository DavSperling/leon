import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { FOLLOW_FAMILIES } from '@/lib/providers';
import { members } from '@/server/db/schema/auth';
import { sources, turns } from '@/server/db/schema/memory';
import {
  managerFollows,
  reglagesOrganisation,
  reportingLines,
} from '@/server/db/schema/organisation';
import { passages, passageVectors } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { searchPassages } from '@/server/search/search';
import { adminDb } from '@/test/db';
import { dropTeams, emailOf, newTeam, seedIndexed } from '@/test/seed-indexed';
import { listMembers, removeMember, setMemberRole } from './members';
import {
  listReports,
  managersSeeAll,
  reportActivity,
  setFollowed,
  setManager,
  setManagersSeeAll,
  setSeeAll,
} from './organisation';
import { resolveTenantContext, type TenantContext } from './tenant-context';

const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

const memberIdOf = async (ctx: TenantContext) => {
  const [row] = await adminDb
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));
  if (!row) throw new Error('membre introuvable');
  return row.id;
};

const setRole = (ctx: TenantContext, role: string) =>
  adminDb
    .update(members)
    .set({ role })
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));

// Claire (propriétaire) dirige Marc, qui dirige Inès ; Paul n'est rattaché à personne.
async function orgChart() {
  const team = await newTeam(['Claire', 'Marc', 'Inès', 'Paul'], tenantIds);
  const [claire, marc, ines, paul] = team.members as [
    TenantContext,
    TenantContext,
    TenantContext,
    TenantContext,
  ];
  await setRole(claire, 'owner');
  const ids = {
    claire: await memberIdOf(claire),
    marc: await memberIdOf(marc),
    ines: await memberIdOf(ines),
    paul: await memberIdOf(paul),
  };
  expect(await setManager(claire, ids.marc, ids.claire)).toBe('ok');
  expect(await setManager(claire, ids.ines, ids.marc)).toBe('ok');
  return { ...team, claire, marc, ines, paul, ids };
}

describe('setManager', () => {
  it("n'est permis qu'aux propriétaires et administrateurs", async () => {
    const { marc, ids } = await orgChart();
    expect(await setManager(marc, ids.paul, ids.marc)).toBe('refuse');
  });

  it('refuse une boucle, directe ou par plusieurs niveaux', async () => {
    const { claire, ids } = await orgChart();
    expect(await setManager(claire, ids.claire, ids.claire)).toBe('boucle');
    expect(await setManager(claire, ids.claire, ids.ines)).toBe('boucle');
  });

  it("ne laisse qu'un propriétaire changer qui est au-dessus d'un propriétaire, qu'un administrateur lirait", async () => {
    const { claire, ines, paul, ids } = await orgChart();
    await setRole(paul, 'admin');
    expect(await setManager(paul, ids.claire, ids.paul)).toBe('proprietaire');
    expect(await setManager(paul, ids.paul, ids.claire)).toBe('ok');
    // Inès, propriétaire elle aussi, est sous Marc, sous Claire : Paul ne déplace pas Marc, même pour le détacher.
    await setRole(ines, 'owner');
    expect(await setManager(paul, ids.marc, ids.paul)).toBe('proprietaire');
    expect(await setManager(paul, ids.marc, null)).toBe('proprietaire');
    expect(await setManager(claire, ids.marc, ids.paul)).toBe('ok');
  });

  it("refuse un membre d'une autre organisation", async () => {
    const { claire, ids } = await orgChart();
    const other = await orgChart();
    expect(await setManager(claire, ids.paul, other.ids.marc)).toBe('refuse');
  });

  it('détache un membre avec null', async () => {
    const { claire, ids } = await orgChart();
    expect(await setManager(claire, ids.ines, null)).toBe('ok');
    const rows = await adminDb
      .select()
      .from(reportingLines)
      .where(eq(reportingLines.memberId, ids.ines));
    expect(rows).toEqual([]);
  });
});

describe('listReports', () => {
  it("rend les gens sous le lecteur, directs puis indirects, dans l'ordre de l'arbre", async () => {
    const { claire, marc, paul } = await orgChart();
    const reports = await listReports(claire);
    expect(reports.map((r) => [r.name, r.depth, r.managerName])).toEqual([
      ['Marc', 1, 'Claire'],
      ['Inès', 2, 'Marc'],
    ]);
    expect((await listReports(marc)).map((r) => r.name)).toEqual(['Inès']);
    expect(await listReports(paul)).toEqual([]);
  });

  it('survit à une boucle écrite hors de setManager, chacun une fois', async () => {
    const { claire, ids } = await orgChart();
    // Claire sous Inès, écrit en base : Claire → Marc → Inès → Claire.
    await adminDb
      .insert(reportingLines)
      .values({ tenantId: claire.tenantId, memberId: ids.claire, managerId: ids.ines });
    expect((await listReports(claire)).map((r) => r.name)).toEqual(['Marc', 'Inès', 'Claire']);
  });
});

describe('reportActivity', () => {
  it('rend ce que le lecteur lit de la personne, privé compris, dans les familles suivies', async () => {
    const { claire, marc, tenantId, ids } = await orgChart();
    const email = await emailOf(marc);
    const turn = (text: string) => [{ text, authorEmail: email }];
    await seedIndexed(marc, { kind: 'linear', acl: [tenantId], title: 'Ticket', turns: turn('t') });
    await seedIndexed(marc, {
      kind: 'hubspot',
      acl: [tenantId],
      title: 'Affaire',
      turns: turn('a'),
    });
    // Privés : à Marc seul, ou à Claire seule (un mail de Marc dans sa boîte).
    await seedIndexed(marc, { kind: 'gmail', title: 'Mail privé', turns: turn('m') });
    await seedIndexed(claire, { kind: 'linear', title: 'Note de Claire', turns: turn('n') });

    // Relue à chaque fois : les familles suivies et l'interrupteur viennent avec la personne.
    const titles = async () => {
      const [report] = await listReports(claire);
      if (!report) throw new Error('Marc absent');
      return (await reportActivity(claire, report)).hits.map((hit) => hit.title).sort();
    };
    expect(await titles()).toEqual(['Affaire', 'Mail privé', 'Note de Claire', 'Ticket']);

    expect(await setSeeAll(claire, ids.marc, false)).toBe(true);
    expect(await titles()).toEqual(['Affaire', 'Note de Claire', 'Ticket']);
    expect(await setFollowed(claire, ids.marc, ['crm'])).toBe(true);
    expect(await titles()).toEqual(['Affaire']);
    // Choisir les familles ne rallume pas la lecture du privé.
    expect((await listReports(claire))[0]?.voitTout).toBe(false);
    expect(await setFollowed(claire, ids.marc, [])).toBe(true);
    expect(await titles()).toEqual([]);
  });

  it('refuse de suivre quelqu’un qui n’est pas sous le lecteur', async () => {
    const { marc, ids } = await orgChart();
    expect(await setFollowed(marc, ids.paul, ['crm'])).toBe(false);
    expect(await setFollowed(marc, ids.claire, ['crm'])).toBe(false);
  });
});

describe('setMemberRole et removeMember', () => {
  it('changent le rôle et retirent un membre, qui perd son accès et ses rattachements', async () => {
    const { claire, marc, ines, tenantId, ids } = await orgChart();
    expect(await setMemberRole(claire, ids.marc, 'admin')).toBe(true);
    expect(await removeMember(marc, ids.ines)).toBe(true);
    expect(await resolveTenantContext(ines.userId, tenantId)).toBeNull();
    expect((await listMembers(claire)).map((m) => m.name)).toEqual(['Claire', 'Marc', 'Paul']);
  });

  it('refusent un simple membre, un propriétaire et soi-même', async () => {
    const { claire, marc, paul, ids } = await orgChart();
    expect(await removeMember(paul, ids.ines)).toBe(false);
    expect(await setMemberRole(paul, ids.marc, 'admin')).toBe(false);
    await setRole(marc, 'admin');
    expect(await removeMember(marc, ids.claire)).toBe(false);
    expect(await setMemberRole(marc, ids.claire, 'member')).toBe(false);
    expect(await removeMember(claire, ids.claire)).toBe(false);
  });

  it('listMembers donne le manager de chacun', async () => {
    const { claire, ids } = await orgChart();
    const managers = Object.fromEntries(
      (await listMembers(claire)).map((m) => [m.id, m.managerId]),
    );
    expect(managers).toEqual({
      [ids.claire]: null,
      [ids.marc]: ids.claire,
      [ids.ines]: ids.marc,
      [ids.paul]: null,
    });
  });
});

// Ce que `ctx` lit d'une source, table par table : avec le privé des gens sous lui (la recherche, l'aperçu, « Mon
// équipe »), ou sous ses seuls droits (`equipe` faux : le chat, le MCP, le point du matin…).
async function seen(ctx: TenantContext, sourceId: string, equipe = true) {
  const { rows } = await withTenant({ ...ctx, equipe }, (tx) =>
    tx.execute<{ s: number; t: number; p: number; v: number }>(sql`
      select (select count(*)::int from sources where id = ${sourceId}) as s,
             (select count(*)::int from turns where source_id = ${sourceId}) as t,
             (select count(*)::int from passages where source_id = ${sourceId}) as p,
             (select count(*)::int from passage_vectors v join passages p on p.id = v.passage_id
               where p.source_id = ${sourceId}) as v`),
  );
  return rows[0];
}
const TOUT = { s: 1, t: 1, p: 1, v: 1 };
const RIEN = { s: 0, t: 0, p: 0, v: 0 };

// L'organigramme de orgChart, et une note privée de chacun (un mail, à lui seul).
async function privateNotes() {
  const org = await orgChart();
  const note = async (ctx: TenantContext, name: string) =>
    (
      await seedIndexed(ctx, {
        kind: 'gmail',
        title: name,
        turns: [{ text: `Contrat signé par ${name}.` }],
      })
    ).sourceId;
  const notes = {
    claire: await note(org.claire, 'Claire'),
    marc: await note(org.marc, 'Marc'),
    ines: await note(org.ines, 'Inès'),
    paul: await note(org.paul, 'Paul'),
  };
  return { ...org, notes };
}

describe('le manager lit le privé des gens sous lui (0057)', () => {
  it('en descendant toute la chaîne, jamais en montant ni à côté, et seulement là où l’écran le demande', async () => {
    const { claire, marc, paul, notes } = await privateNotes();
    expect(await seen(claire, notes.marc)).toEqual(TOUT);
    expect(await seen(claire, notes.ines)).toEqual(TOUT);
    expect(await seen(claire, notes.paul)).toEqual(RIEN);
    expect(await seen(marc, notes.ines)).toEqual(TOUT);
    expect(await seen(marc, notes.claire)).toEqual(RIEN);
    expect(await seen(paul, notes.marc)).toEqual(RIEN);
    expect(await seen(claire, notes.marc, false)).toEqual(RIEN);
    // Une autre organisation ne lit rien, même en le demandant.
    expect(await seen((await orgChart()).claire, notes.marc)).toEqual(RIEN);

    const page = await searchPassages(
      { ...claire, equipe: true },
      { query: 'contrat', embedder: createFakeEmbedder() },
    );
    expect(page.hits.map((hit) => hit.title).sort()).toEqual(['Claire', 'Inès', 'Marc']);
  });

  it('un manager le coupe pour une personne, et pour lui seul', async () => {
    const { claire, marc, ids, notes } = await privateNotes();
    expect(await setSeeAll(claire, ids.ines, false)).toBe(true);
    expect(await seen(claire, notes.ines)).toEqual(RIEN);
    expect(await seen(claire, notes.marc)).toEqual(TOUT);
    expect(await seen(marc, notes.ines)).toEqual(TOUT);
    // Une ligne posée pour l'interrupteur seul suit toutes les familles.
    expect((await listReports(claire)).map((r) => [r.name, r.voitTout, r.families.length])).toEqual(
      [
        ['Marc', true, FOLLOW_FAMILIES.length],
        ['Inès', false, FOLLOW_FAMILIES.length],
      ],
    );
    expect(await setSeeAll(claire, ids.ines, true)).toBe(true);
    expect(await seen(claire, notes.ines)).toEqual(TOUT);
    expect(await setSeeAll(marc, ids.claire, false)).toBe(false);
  });

  it('l’organisation le coupe pour tous, et seul un propriétaire ou un administrateur le change', async () => {
    const { claire, marc, notes } = await privateNotes();
    expect(await managersSeeAll(marc)).toBe(true);
    expect(await setManagersSeeAll(marc, false)).toBe(false);
    // Même en base : un simple membre n'écrit pas le réglage.
    await expect(
      withTenant(marc, (tx) =>
        tx
          .insert(reglagesOrganisation)
          .values({ tenantId: marc.tenantId, managersVoientTout: false }),
      ),
    ).rejects.toThrow();

    expect(await setManagersSeeAll(claire, false)).toBe(true);
    expect(await managersSeeAll(marc)).toBe(false);
    expect(await seen(claire, notes.marc)).toEqual(RIEN);
    expect(await seen(marc, notes.ines)).toEqual(RIEN);
    // Postgres écarte sans erreur la modification refusée.
    await withTenant(marc, (tx) =>
      tx.update(reglagesOrganisation).set({ managersVoientTout: true }),
    );
    expect(await managersSeeAll(claire)).toBe(false);

    expect(await setManagersSeeAll(claire, true)).toBe(true);
    expect(await seen(claire, notes.marc)).toEqual(TOUT);
  });

  it('lire seulement : le manager ne modifie, ne supprime ni n’écrit rien au nom des gens sous lui', async () => {
    const { claire, marc, tenantId, notes } = await privateNotes();
    const asManager = { ...claire, equipe: true };
    const touched = await withTenant(asManager, async (tx) => {
      const passageIds = (
        await tx.select({ id: passages.id }).from(passages).where(eq(passages.sourceId, notes.marc))
      ).map((row) => row.id);
      expect(passageIds).toHaveLength(1);
      return [
        ...(await tx
          .update(sources)
          .set({ title: 'Changé' })
          .where(eq(sources.id, notes.marc))
          .returning({ id: sources.id })),
        ...(await tx
          .update(turns)
          .set({ text: 'Changé' })
          .where(eq(turns.sourceId, notes.marc))
          .returning({ id: turns.id })),
        ...(await tx
          .delete(passageVectors)
          .where(inArray(passageVectors.passageId, passageIds))
          .returning({ id: passageVectors.passageId })),
        ...(await tx
          .delete(passages)
          .where(eq(passages.sourceId, notes.marc))
          .returning({ id: passages.id })),
      ];
    });
    expect(touched).toEqual([]);
    await expect(
      withTenant(asManager, (tx) =>
        tx.insert(turns).values({
          tenantId,
          sourceId: notes.marc,
          externalId: 'ajout-du-manager',
          role: 'user',
          text: 'Écrit par Claire sous le nom de Marc.',
          ts: new Date(),
          captureMode: 'manual',
          acl: [marc.userId],
        }),
      ),
    ).rejects.toThrow();
    expect(await seen(marc, notes.marc, false)).toEqual(TOUT);
  });

  it('l’organigramme et les choix d’un manager ne s’écrivent, même en base, que par qui en a le droit', async () => {
    const { marc, ids } = await orgChart();
    await expect(
      withTenant(marc, (tx) =>
        tx
          .insert(reportingLines)
          .values({ tenantId: marc.tenantId, memberId: ids.claire, managerId: ids.marc }),
      ),
    ).rejects.toThrow();
    const touched = await withTenant(marc, async (tx) => [
      ...(await tx
        .update(reportingLines)
        .set({ managerId: ids.paul })
        .where(eq(reportingLines.memberId, ids.ines))
        .returning()),
      ...(await tx.delete(reportingLines).where(eq(reportingLines.memberId, ids.marc)).returning()),
    ]);
    expect(touched).toEqual([]);
    // Marc ne pose pas un choix au nom de Claire.
    await expect(
      withTenant(marc, (tx) =>
        tx.insert(managerFollows).values({
          tenantId: marc.tenantId,
          managerId: ids.claire,
          memberId: ids.ines,
          voitTout: false,
        }),
      ),
    ).rejects.toThrow();
  });
});

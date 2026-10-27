import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { members } from '@/server/db/schema/auth';
import { reportingLines } from '@/server/db/schema/organisation';
import { adminDb } from '@/test/db';
import { dropTeams, emailOf, newTeam, seedIndexed } from '@/test/seed-indexed';
import { listMembers, removeMember, setMemberRole } from './members';
import { listReports, reportActivity, setFollowed, setManager } from './organisation';
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
});

describe('reportActivity', () => {
  it('ne rend que ce que toute l’équipe voit, de la personne, dans les familles suivies', async () => {
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

    // Relue à chaque fois : les familles suivies viennent avec la personne.
    const titles = async () => {
      const [report] = await listReports(claire);
      if (!report) throw new Error('Marc absent');
      return (await reportActivity(claire, report)).hits.map((hit) => hit.title).sort();
    };
    expect(await titles()).toEqual(['Affaire', 'Ticket']);

    expect(await setFollowed(claire, ids.marc, ['crm'])).toBe(true);
    expect(await titles()).toEqual(['Affaire']);
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

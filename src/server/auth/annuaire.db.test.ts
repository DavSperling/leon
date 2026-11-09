import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { members } from '@/server/db/schema/auth';
import { reportingLines } from '@/server/db/schema/organisation';
import { adminDb } from '@/test/db';
import { dropTeams, emailOf, newTeam } from '@/test/seed-indexed';
import { applyImport, type Person, previewImport } from './annuaire';
import { setManager } from './organisation';
import type { TenantContext } from './tenant-context';

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

// Claire (propriétaire), Marc, Inès et Paul dans Leon, personne rattaché. Dans l'annuaire : Marc sous Claire, Inès et
// Paul sous Marc, et Zoé, absente de Leon, sous Claire.
async function company() {
  const team = await newTeam(['Claire', 'Marc', 'Inès', 'Paul'], tenantIds);
  const [claire, marc, ines, paul] = team.members as [
    TenantContext,
    TenantContext,
    TenantContext,
    TenantContext,
  ];
  await adminDb
    .update(members)
    .set({ role: 'owner' })
    .where(and(eq(members.userId, claire.userId), eq(members.organizationId, team.tenantId)));
  const email = async (ctx: TenantContext) => (await emailOf(ctx)).toLowerCase();
  const [c, m, i, p] = await Promise.all([claire, marc, ines, paul].map(email));
  const directory: Person[] = [
    { emails: [c as string], manager: null },
    { emails: [m as string], manager: c as string },
    { emails: [i as string], manager: m as string },
    { emails: [p as string], manager: m as string },
    { emails: ['zoe@ailleurs.test'], manager: c as string },
  ];
  const ids = {
    claire: await memberIdOf(claire),
    marc: await memberIdOf(marc),
    ines: await memberIdOf(ines),
    paul: await memberIdOf(paul),
  };
  return { claire, marc, ids, directory };
}

const lines = async (tenantId: string) =>
  Object.fromEntries(
    (
      await adminDb
        .select({ member: reportingLines.memberId, manager: reportingLines.managerId })
        .from(reportingLines)
        .where(eq(reportingLines.tenantId, tenantId))
    ).map((row) => [row.member, row.manager]),
  );

describe("import de l'organigramme", () => {
  it("montre l'aperçu sans rien écrire, puis l'écrit", async () => {
    const { claire, ids, directory } = await company();
    const plan = await previewImport(claire, directory);
    expect(plan.changes.map((change) => change.memberId).sort()).toEqual(
      [ids.ines, ids.marc, ids.paul].sort(),
    );
    expect(plan.outside).toBe(1);
    expect(await lines(claire.tenantId)).toEqual({});

    expect(await applyImport(claire, directory)).toBe(3);
    expect(await lines(claire.tenantId)).toEqual({
      [ids.marc]: ids.claire,
      [ids.ines]: ids.marc,
      [ids.paul]: ids.marc,
    });
    // Relancé, il n'a plus rien à faire.
    expect(await applyImport(claire, directory)).toBe(0);
  });

  it('ne touche jamais à un rattachement fait ou retiré à la main', async () => {
    const { claire, ids, directory } = await company();
    expect(await setManager(claire, ids.paul, ids.claire)).toBe('ok');
    expect(await setManager(claire, ids.ines, null)).toBe('ok');

    expect(await applyImport(claire, directory)).toBe(1);
    expect(await lines(claire.tenantId)).toEqual({
      [ids.marc]: ids.claire,
      [ids.paul]: ids.claire,
    });
    expect((await previewImport(claire, directory)).kept).toBe(2);
  });

  it("n'est permis qu'aux propriétaires et administrateurs", async () => {
    const { claire, marc, directory } = await company();
    expect(await applyImport(marc, directory)).toBeNull();
    expect(await lines(claire.tenantId)).toEqual({});
  });
});

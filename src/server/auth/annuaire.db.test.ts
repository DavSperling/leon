import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { members } from '@/server/db/schema/auth';
import { reportingLines } from '@/server/db/schema/organisation';
import { adminDb } from '@/test/db';
import { dropTeams, emailOf, newTeam } from '@/test/seed-indexed';
import { applyImport, type Person, previewImport } from './annuaire';
import { deleteAccount } from './delete-account';
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
  const emails = { claire: c as string, marc: m as string, ines: i as string, paul: p as string };
  return { claire, marc, paul, ids, emails, directory };
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

  it("ne laisse qu'un propriétaire changer qui est au-dessus d'un propriétaire", async () => {
    const { claire, marc, ids, emails } = await company();
    await adminDb
      .update(members)
      .set({ role: 'admin' })
      .where(and(eq(members.userId, marc.userId), eq(members.organizationId, marc.tenantId)));
    // Claire, propriétaire, est sous Paul ; l'annuaire met Paul et Inès sous Marc, administrateur.
    expect(await setManager(claire, ids.claire, ids.paul)).toBe('ok');
    const directory: Person[] = [
      { emails: [emails.marc], manager: null },
      { emails: [emails.paul], manager: emails.marc },
      { emails: [emails.ines], manager: emails.marc },
    ];
    expect(await applyImport(marc, directory)).toBe(1);
    expect(await lines(claire.tenantId)).toEqual({
      [ids.claire]: ids.paul,
      [ids.ines]: ids.marc,
    });
    expect(await applyImport(claire, directory)).toBe(1);
    expect((await lines(claire.tenantId))[ids.paul]).toBe(ids.marc);
  });

  it('voit les comptes supprimés, qui gardent leur place : pas de boucle à travers eux', async () => {
    const { claire, paul, ids, emails } = await company();
    // À la main, Inès sous Paul, sous Marc ; puis Paul supprime son compte.
    expect(await setManager(claire, ids.paul, ids.marc)).toBe('ok');
    expect(await setManager(claire, ids.ines, ids.paul)).toBe('ok');
    await deleteAccount(paul, null, false);
    // Marc sous Inès fermerait la boucle Inès → Paul → Marc → Inès.
    const directory: Person[] = [
      { emails: [emails.marc], manager: emails.ines },
      { emails: [emails.ines], manager: null },
    ];
    expect(await applyImport(claire, directory)).toBe(0);
    expect(await lines(claire.tenantId)).toEqual({ [ids.paul]: ids.marc, [ids.ines]: ids.paul });
  });
});

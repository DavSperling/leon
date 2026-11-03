import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { members, organizations, users } from '@/server/db/schema/auth';
import { dropPoints, pointIsStale, queuedRefreshes, seedPoint } from '@/test/briefing-points';
import { adminDb } from '@/test/db';
import { createTestTenant, createTestUser } from '@/test/fixtures';
import {
  completeMemberStep,
  completeOwnerStep,
  isSoleMember,
  type OwnerStep,
  readOnboardingMember,
  spaceRole,
} from './onboarding';
import type { TenantContext } from './tenant-context';

const step: OwnerStep = {
  department: 'engineering',
  job: 'backend',
  seniority: 5,
  size: '11-50',
  goals: ['find', 'briefing'],
};

// Chaque test a son espace : Ana en est propriétaire, Bob membre. Les updates visent leurs propres lignes
// (la base de test est partagée entre les workers).
const tenantIds: string[] = [];
let tenantId: string;
let ana: TenantContext;
let bob: TenantContext;

const setRole = (ctx: TenantContext, role: string) =>
  adminDb
    .update(members)
    .set({ role })
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));

const sizeOf = async () =>
  (await adminDb.select().from(organizations).where(eq(organizations.id, tenantId)))[0]?.size;

beforeEach(async () => {
  const tenant = await createTestTenant(['Ana', 'Bob']);
  tenantId = tenant.tenantId;
  tenantIds.push(tenantId);
  [ana, bob] = tenant.members as [TenantContext, TenantContext];
  await setRole(ana, 'owner');
});

// Les points marqués périmés touchent le vrai pg-boss de la base de test : on retire leurs travaux à la fin.
afterAll(() => dropPoints(tenantIds));

describe('readOnboardingMember', () => {
  it("un membre neuf n'a ni poste ni étape validée", async () => {
    expect(await readOnboardingMember(bob)).toEqual(
      expect.objectContaining({
        department: null,
        job: null,
        seniority: null,
        goals: [],
        onboardedAt: null,
        role: 'member',
      }),
    );
  });

  it("rend null pour qui n'est pas membre de l'espace", async () => {
    expect(await readOnboardingMember({ ...bob, tenantId: crypto.randomUUID() })).toBeNull();
  });
});

describe('completeOwnerStep', () => {
  it('le propriétaire enregistre son poste, son niveau, ses attentes et la taille', async () => {
    expect(await completeOwnerStep(ana, step)).toBe(true);
    expect(await readOnboardingMember(ana)).toEqual(
      expect.objectContaining({
        department: 'engineering',
        job: 'backend',
        seniority: 5,
        goals: ['find', 'briefing'],
        onboardedAt: expect.any(Date),
      }),
    );
    expect(await sizeOf()).toBe('11-50');
  });

  it("ne réécrit rien une fois l'étape validée", async () => {
    await completeOwnerStep(ana, step);
    expect(await completeOwnerStep(ana, { ...step, job: 'cto', size: '201+' })).toBe(false);
    expect(await readOnboardingMember(ana)).toEqual(expect.objectContaining({ job: 'backend' }));
    expect(await sizeOf()).toBe('11-50');
  });

  it("garde la taille déjà posée quand un autre propriétaire passe l'étape, mais écrit son poste", async () => {
    await adminDb.update(organizations).set({ size: '201+' }).where(eq(organizations.id, tenantId));
    await setRole(bob, 'owner');

    expect(await completeOwnerStep(bob, step)).toBe(true);
    expect(await sizeOf()).toBe('201+');
    expect(await readOnboardingMember(bob)).toEqual(
      expect.objectContaining({
        department: 'engineering',
        job: 'backend',
        onboardedAt: expect.any(Date),
      }),
    );
  });

  it("refuse l'étape du propriétaire à un membre", async () => {
    expect(await completeOwnerStep(bob, step)).toBe(false);
    expect(await readOnboardingMember(bob)).toEqual(
      expect.objectContaining({
        department: null,
        job: null,
        seniority: null,
        goals: [],
        onboardedAt: null,
      }),
    );
    expect(await sizeOf()).toBeNull();
  });

  it('accepte un propriétaire qui a plusieurs rôles (« owner,admin »)', async () => {
    await setRole(ana, 'owner,admin');
    expect(await completeOwnerStep(ana, step)).toBe(true);
    expect(await sizeOf()).toBe('11-50');
  });

  it("refuse l'étape à un administrateur qui n'est pas propriétaire", async () => {
    await setRole(bob, 'admin');
    expect(await completeOwnerStep(bob, step)).toBe(false);
    expect(await sizeOf()).toBeNull();
  });
});

describe('le point du matin après l’étape 1', () => {
  it('le propriétaire qui valide son poste voit ses points périmés et remis en file, pas ceux des autres', async () => {
    const mine = await seedPoint(ana);
    const theirs = await seedPoint(bob);

    expect(await completeOwnerStep(ana, step)).toBe(true);

    expect(await pointIsStale(ana, mine)).toBe(true);
    expect(await pointIsStale(bob, theirs)).toBe(false);
    const [queued] = await queuedRefreshes(ana, mine);
    expect((queued?.startAfter.getTime() ?? 0) - Date.now()).toBeGreaterThan(20 * 60_000);
    expect(await queuedRefreshes(bob, theirs)).toEqual([]);
  });

  it('un refus, ou les seules attentes d’un membre, ne touchent à aucun point', async () => {
    const hers = await seedPoint(ana);
    const his = await seedPoint(bob);

    expect(await completeOwnerStep(bob, step)).toBe(false);
    expect(await completeMemberStep(bob, ['find'])).toBe(true);

    expect(await pointIsStale(ana, hers)).toBe(false);
    expect(await pointIsStale(bob, his)).toBe(false);
    expect(await queuedRefreshes(bob, his)).toEqual([]);
  });
});

describe('completeMemberStep', () => {
  it('le membre enregistre ses attentes sans toucher au poste fixé par un administrateur', async () => {
    await adminDb
      .update(members)
      .set({ department: 'sales', job: 'sdr', seniority: 3 })
      .where(and(eq(members.userId, bob.userId), eq(members.organizationId, tenantId)));

    expect(await completeMemberStep(bob, ['meetings'])).toBe(true);
    expect(await readOnboardingMember(bob)).toEqual(
      expect.objectContaining({
        department: 'sales',
        job: 'sdr',
        seniority: 3,
        goals: ['meetings'],
        onboardedAt: expect.any(Date),
      }),
    );
    expect(await completeMemberStep(bob, ['find'])).toBe(false);
    expect(await readOnboardingMember(bob)).toEqual(
      expect.objectContaining({ goals: ['meetings'] }),
    );
  });
});

describe('spaceRole', () => {
  it('lit les rôles séparés par des virgules, owner avant admin', () => {
    expect(spaceRole('owner')).toBe('owner');
    expect(spaceRole('admin,owner')).toBe('owner');
    expect(spaceRole('admin')).toBe('admin');
    expect(spaceRole('member')).toBe('member');
  });
});

describe('isSoleMember', () => {
  it('vrai seul, faux à deux, vrai si le second compte est supprimé', async () => {
    const solo = (await createTestTenant(['Seule'])).members[0] as TenantContext;
    expect(await isSoleMember(solo)).toBe(true);

    const second = await createTestUser(solo.tenantId, 'Bob');
    expect(await isSoleMember(solo)).toBe(false);

    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, second.userId));
    expect(await isSoleMember(solo)).toBe(true);
  });
});

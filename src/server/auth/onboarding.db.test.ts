import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { members, organizations } from '@/server/db/schema/auth';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import {
  completeMemberStep,
  completeOwnerStep,
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
  [ana, bob] = tenant.members as [TenantContext, TenantContext];
  await setRole(ana, 'owner');
});

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

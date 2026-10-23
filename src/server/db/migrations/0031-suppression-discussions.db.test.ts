import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { discussionMessages, discussions } from '@/server/db/schema/search';
import { createDiscussion, deleteDiscussion } from '@/server/discussion/discussions';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Migration 0031 : l'auteur supprime ses discussions (et leurs messages, en cascade), personne d'autre.

const tenantIds: string[] = [];
let alice: TenantContext;
let bob: TenantContext;
let zoe: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice', 'Bob']);
  const other = await createTestTenant(['Zoé']);
  [alice, bob] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
});

afterAll(async () => {
  await adminPool.query('delete from discussions where tenant_id = any($1)', [tenantIds]);
});

const exists = async (id: string) =>
  (await adminDb.select({ id: discussions.id }).from(discussions).where(eq(discussions.id, id)))
    .length > 0;

describe('0031 : suppression des discussions', () => {
  it('l’auteur supprime sa discussion, et ses messages partent avec', async () => {
    const id = await createDiscussion(alice, { question: 'Que dit le contrat ACME ?' });
    expect(await deleteDiscussion(alice, id)).toBe(true);
    expect(await exists(id)).toBe(false);
    const messages = await adminDb
      .select({ id: discussionMessages.id })
      .from(discussionMessages)
      .where(eq(discussionMessages.discussionId, id));
    expect(messages).toEqual([]);
  });

  it('un collègue ne supprime pas la discussion d’un autre', async () => {
    const id = await createDiscussion(alice, { question: 'Qui suit le dossier ?' });
    expect(await deleteDiscussion(bob, id)).toBe(false);
    expect(await exists(id)).toBe(true);
  });

  it('une autre organisation non plus', async () => {
    const id = await createDiscussion(alice, { question: 'Quel budget ?' });
    expect(await deleteDiscussion(zoe, id)).toBe(false);
    expect(await exists(id)).toBe(true);
  });

  it('un identifiant invalide ne touche pas la base', async () => {
    expect(await deleteDiscussion(alice, 'pas-un-uuid')).toBe(false);
  });
});

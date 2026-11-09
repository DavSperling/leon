import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { principalsFor, type TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource, seedThread } from '@/test/fixtures';

// Migration 0051 : supprimer_fil retire un fil de travail (D21), et rien d'autre : un fil de l'organisation courante,
// appelé par son auteur. L'app n'a toujours pas le droit de supprimer une source (rls-coverage.db.test.ts).

const supprimerFil = async (ctx: TenantContext, id: string) =>
  (
    await withTenant(ctx, (tx) =>
      tx.execute<{ deleted: boolean }>(sql`select supprimer_fil(${id}) as deleted`),
    )
  ).rows[0]?.deleted;

const exists = async (id: string) =>
  (await adminDb.select({ id: sources.id }).from(sources).where(eq(sources.id, id))).length === 1;

async function pair(): Promise<[TenantContext, TenantContext]> {
  const { members } = await createTestTenant(['Alice', 'Bob']);
  return members as [TenantContext, TenantContext];
}

describe('supprimer_fil', () => {
  it('supprime le fil de son auteur', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);

    expect(await supprimerFil(alice, thread)).toBe(true);
    expect(await exists(thread)).toBe(false);
  });

  it("refuse le fil d'un collègue", async () => {
    const [alice, bob] = await pair();
    const thread = await seedThread(alice);

    expect(await supprimerFil(bob, thread)).toBe(false);
    expect(await exists(thread)).toBe(true);
  });

  it("refuse son propre fil hors de l'organisation courante", async () => {
    const [alice] = await pair();
    const [elsewhere] = await pair();
    const thread = await seedThread(alice);
    const outside = {
      tenantId: elsewhere.tenantId,
      userId: alice.userId,
      principals: await principalsFor(alice.userId, elsewhere.tenantId),
    };

    expect(await supprimerFil(outside, thread)).toBe(false);
    expect(await exists(thread)).toBe(true);
  });

  it('refuse tout autre type de source, même de son auteur', async () => {
    const [alice] = await pair();
    for (const kind of ['claude_code', 'mcp_remember', 'document', 'github'] as const) {
      const { sourceId } = await seedSource(alice, { kind });

      expect(await supprimerFil(alice, sourceId), kind).toBe(false);
      expect(await exists(sourceId), kind).toBe(true);
    }
  });
});

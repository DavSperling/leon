import { eq, inArray, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { principalsFor, type TenantContext } from '@/server/auth/tenant-context';
import { sources, versionsMemoire } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource, seedThread } from '@/test/fixtures';

// Migration 0067 : supprimer_notes_du_compte retire les notes (kind `mcp_remember`, D38) de la personne qui agit, dans
// l'organisation courante, et rien d'autre ; leurs versions partent en cascade. L'app n'a toujours pas le droit de
// supprimer une source (rls-coverage.db.test.ts).

const supprimerNotes = async (ctx: TenantContext) =>
  (
    await withTenant(ctx, (tx) =>
      tx.execute<{ count: number }>(sql`select supprimer_notes_du_compte() as count`),
    )
  ).rows[0]?.count;

const remaining = async (ids: string[]) =>
  (await adminDb.select({ id: sources.id }).from(sources).where(inArray(sources.id, ids)))
    .map((row) => row.id)
    .sort();

async function pair(): Promise<[TenantContext, TenantContext]> {
  const { members } = await createTestTenant(['Alice', 'Bob']);
  return members as [TenantContext, TenantContext];
}

describe('supprimer_notes_du_compte', () => {
  it('supprime les notes de la personne et leurs versions, et rend leur nombre', async () => {
    const [alice] = await pair();
    const { sourceId: one } = await seedSource(alice, { kind: 'mcp_remember' });
    const { sourceId: two } = await seedSource(alice, { kind: 'mcp_remember' });
    await adminDb.insert(versionsMemoire).values({
      tenantId: alice.tenantId,
      ownerUserId: alice.userId,
      sourceId: one,
      n: 1,
      texte: 'Note.',
      ecritPar: 'agent',
      motif: 'note',
      acl: [alice.userId],
    });

    expect(await supprimerNotes(alice)).toBe(2);
    expect(await remaining([one, two])).toEqual([]);
    expect(
      await adminDb.select().from(versionsMemoire).where(eq(versionsMemoire.sourceId, one)),
    ).toEqual([]);
  });

  it("garde les notes d'un collègue, même visibles de l'équipe, et toute autre source de la personne", async () => {
    const [alice, bob] = await pair();
    const { sourceId: bobNote } = await seedSource(bob, { kind: 'mcp_remember' });
    await adminDb
      .update(sources)
      .set({ acl: [bob.tenantId] })
      .where(eq(sources.id, bobNote));
    const others = [
      bobNote,
      await seedThread(alice),
      ...(await Promise.all(
        (['claude_code', 'document', 'github'] as const).map(
          async (kind) => (await seedSource(alice, { kind })).sourceId,
        ),
      )),
    ];

    expect(await supprimerNotes(alice)).toBe(0);
    expect(await remaining(others)).toEqual([...others].sort());
  });

  it("garde ses propres notes hors de l'organisation courante", async () => {
    const [alice] = await pair();
    const [elsewhere] = await pair();
    const { sourceId: note } = await seedSource(alice, { kind: 'mcp_remember' });
    const outside = {
      tenantId: elsewhere.tenantId,
      userId: alice.userId,
      principals: await principalsFor(alice.userId, elsewhere.tenantId),
    };

    expect(await supprimerNotes(outside)).toBe(0);
    expect(await remaining([note])).toEqual([note]);
  });
});

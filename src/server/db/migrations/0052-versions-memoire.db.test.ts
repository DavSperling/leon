import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { versionsMemoire } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource, seedThread } from '@/test/fixtures';

// Migration 0052 : versions_memoire garde les versions de l'état d'un fil et des notes (C12 du plan de la mémoire à
// disposition), en ajout seul, privées à leur auteur quoi qu'écrive le code.

async function pair(): Promise<[TenantContext, TenantContext]> {
  const { members } = await createTestTenant(['Alice', 'Bob']);
  return members as [TenantContext, TenantContext];
}

// Une version posée par le propriétaire (hors RLS), comme l'écrirait writeVersion.
const insertVersion = (
  ctx: TenantContext,
  sourceId: string,
  values: { acl?: string[]; ecritPar?: string; entrees?: string[] } = {},
) =>
  adminPool.query(
    `insert into versions_memoire (tenant_id, owner_user_id, source_id, n, texte, entrees, ecrit_par, motif, acl)
     values ($1, $2, $3, 1, 'Où j''en suis.', $4::uuid[], $5, 'rangement', $6::uuid[])`,
    [
      ctx.tenantId,
      ctx.userId,
      sourceId,
      values.entrees ?? [],
      values.ecritPar ?? 'serveur',
      values.acl ?? [ctx.userId],
    ],
  );

const CHECK_VIOLATION = { code: '23514' };

describe('versions_memoire', () => {
  it("la version d'un collègue est introuvable", async () => {
    const [alice, bob] = await pair();
    const thread = await seedThread(alice);
    await insertVersion(alice, thread);

    const read = (ctx: TenantContext) =>
      withTenant(ctx, (tx) =>
        tx.select().from(versionsMemoire).where(eq(versionsMemoire.sourceId, thread)),
      );

    expect(await read(bob)).toEqual([]);
    expect(await read(alice)).toHaveLength(1);
  });

  it('une ACL élargie est refusée par la base', async () => {
    const [alice, bob] = await pair();
    const thread = await seedThread(alice);

    await expect(
      insertVersion(alice, thread, { acl: [alice.userId, alice.tenantId] }),
    ).rejects.toMatchObject(CHECK_VIOLATION);
    await expect(insertVersion(alice, thread, { acl: [bob.userId] })).rejects.toMatchObject(
      CHECK_VIOLATION,
    );
  });

  it('une mise à jour est refusée', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    await insertVersion(alice, thread);

    await expect(
      withTenant(alice, (tx) =>
        tx
          .update(versionsMemoire)
          .set({ texte: 'Réécrit.' })
          .where(eq(versionsMemoire.sourceId, thread)),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('une version écrite par le modèle sans entrée est refusée', async () => {
    const [alice] = await pair();
    const thread = await seedThread(alice);
    const { sourceId: session } = await seedSource(alice);

    await expect(insertVersion(alice, thread, { ecritPar: 'modele' })).rejects.toMatchObject(
      CHECK_VIOLATION,
    );
    await expect(
      insertVersion(alice, thread, { ecritPar: 'modele', entrees: [session] }),
    ).resolves.toBeDefined();
  });
});

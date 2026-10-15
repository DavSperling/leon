import { verifyPassword } from 'better-auth/crypto';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hashApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members, organizations } from '@/server/db/schema/auth';
import { ingestRuns, sources } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { remettreAZero, runsEnCours } from './organisation';
import type { Entreprise } from './schema';

const ENTREPRISE: Entreprise = {
  organisation: 'Atelier Numérique Lebrun',
  slug: 'essai-atelier-lebrun',
  domaine: 'essai.leon.local',
  motDePasse: 'essai-leon-2026',
  personnages: [
    { cle: 'claire', nom: 'Claire Lebrun', role: 'Dirigeante' },
    { cle: 'hugo', nom: 'Hugo Martin', role: 'Dev' },
  ],
  secrets: [],
};

// Un seul fichier touche à cette organisation : ses tests s'exécutent dans l'ordre.
describe('remettreAZero', () => {
  it('crée l organisation, les comptes avec mot de passe et un jeton valide par personnage', async () => {
    const { tenantId, comptes } = await remettreAZero(adminDb, ENTREPRISE);

    expect(comptes.map((c) => c.cle)).toEqual(['claire', 'hugo']);
    const roles = await adminDb
      .select({ role: members.role })
      .from(members)
      .where(eq(members.organizationId, tenantId));
    expect(roles.map((r) => r.role).sort()).toEqual(['member', 'owner']);
    for (const compte of comptes) {
      const [token] = await adminDb
        .select({ userId: apiTokens.userId })
        .from(apiTokens)
        .where(
          and(
            eq(apiTokens.tokenHash, hashApiToken(compte.token)),
            eq(apiTokens.tenantId, tenantId),
          ),
        );
      expect(token?.userId).toBe(compte.userId);
      const { rows } = await adminDb.execute<{ password: string }>(
        sql`select password from account where "userId" = ${compte.userId} and "providerId" = 'credential'`,
      );
      expect(
        await verifyPassword({ hash: rows[0]?.password ?? '', password: 'essai-leon-2026' }),
      ).toBe(true);
    }
  });

  it('efface la mémoire du passage précédent et ne touche pas aux autres organisations', async () => {
    const autre = await createTestTenant(['Paul']);
    const [paul] = autre.members as [TenantContext];
    const { sourceId: sourcePaul } = await seedSource(paul);
    const premier = await remettreAZero(adminDb, ENTREPRISE);
    const [hugo] = premier.comptes.slice(1);
    if (!hugo) throw new Error('hugo manquant');
    await seedSource({
      tenantId: premier.tenantId,
      userId: hugo.userId,
      principals: [hugo.userId, premier.tenantId],
    });

    const second = await remettreAZero(adminDb, ENTREPRISE);

    expect(second.tenantId).not.toBe(premier.tenantId);
    expect(
      await adminDb.select().from(organizations).where(eq(organizations.id, premier.tenantId)),
    ).toEqual([]);
    expect(
      await adminDb.select().from(sources).where(eq(sources.tenantId, premier.tenantId)),
    ).toEqual([]);
    expect(
      await adminDb.select({ id: sources.id }).from(sources).where(eq(sources.id, sourcePaul)),
    ).toHaveLength(1);
  });
});

describe('runsEnCours', () => {
  it('compte les runs queued ou running de l organisation d essai', async () => {
    const { tenantId, comptes } = await remettreAZero(adminDb, ENTREPRISE);
    const [claire] = comptes;
    if (!claire) throw new Error('claire manquante');
    const { sourceId, turnId } = await seedSource({
      tenantId,
      userId: claire.userId,
      principals: [claire.userId, tenantId],
    });
    await adminDb
      .insert(ingestRuns)
      .values({ tenantId, sourceId, turnIds: [turnId], acl: [claire.userId] });

    expect(await runsEnCours(adminDb, ENTREPRISE.slug)).toBe(1);
  });
});

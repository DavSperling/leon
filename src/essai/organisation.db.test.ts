import { randomUUID } from 'node:crypto';
import { verifyPassword } from 'better-auth/crypto';
import { and, eq, like, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hashApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members, organizations, users } from '@/server/db/schema/auth';
import { facts, ingestRuns, sources } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { createTestTenant, seedCard, seedSource } from '@/test/fixtures';
import { remettreAZero, runsEnCours, runsEnCoursParTenant } from './organisation';
import { type Entreprise, ESSAI_DOMAINE } from './schema';

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
    const { sourceId, turnId } = await seedSource({
      tenantId: premier.tenantId,
      userId: hugo.userId,
      principals: [hugo.userId, premier.tenantId],
    });
    // Une fiche et un fait exercent vraiment l'ordre de suppression (l'organisation avant les
    // comptes : facts.author_id référence « user » sans cascade).
    const cardId = await seedCard(premier.tenantId, {
      title: 'Menuiserie Dupont',
      typeSlug: 'client',
      acl: [premier.tenantId],
    });
    await adminDb.insert(facts).values({
      tenantId: premier.tenantId,
      cardId,
      predicate: 'note',
      statement: 'Dupont paie à 45 jours.',
      quote: 'paie à 45 jours',
      sourceId,
      turnId,
      quoteStart: 0,
      quoteEnd: 15,
      sourceKind: 'claude_code',
      authorId: hugo.userId,
      validFrom: new Date(),
      status: 'active',
      sensitivity: 'shareable',
      singleValued: false,
      confidence: 0.9,
      acl: [premier.tenantId],
    });
    // Un compte hors de tout domaine d'essai : la remise à zéro ne doit pas y toucher.
    const emailHorsEssai = `${randomUUID()}@sub.essai.leon.local`;
    const [horsEssai] = await adminDb
      .insert(users)
      .values({ name: 'Hors essai', email: emailHorsEssai, emailVerified: true })
      .returning({ id: users.id });
    if (!horsEssai) throw new Error('compte hors essai non créé');

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
    expect(
      await adminDb
        .select()
        .from(users)
        .where(like(users.email, `%@${ESSAI_DOMAINE}`)),
    ).toHaveLength(ENTREPRISE.personnages.length);
    expect(await adminDb.select().from(users).where(eq(users.id, horsEssai.id))).toHaveLength(1);
  });

  it('refuse si un compte d essai appartient à une autre organisation', async () => {
    const premier = await remettreAZero(adminDb, ENTREPRISE);
    const [hugo] = premier.comptes.slice(1);
    if (!hugo) throw new Error('hugo manquant');
    const autre = await createTestTenant([]);
    await adminDb.insert(members).values({
      organizationId: autre.tenantId,
      userId: hugo.userId,
      role: 'member',
      createdAt: new Date(),
    });

    await expect(remettreAZero(adminDb, ENTREPRISE)).rejects.toThrow(
      "Remise à zéro refusée : un compte d'essai appartient à une autre organisation.",
    );

    // Nettoyage : sinon la double appartenance de hugo refuserait aussi les tests suivants.
    await adminDb
      .delete(members)
      .where(and(eq(members.organizationId, autre.tenantId), eq(members.userId, hugo.userId)));
  });
});

describe('runsEnCours', () => {
  it('distingue les runs actifs des runs bloqués (figés depuis plus de 15 minutes)', async () => {
    const { tenantId, comptes } = await remettreAZero(adminDb, ENTREPRISE);
    const [claire] = comptes;
    if (!claire) throw new Error('claire manquante');
    const { sourceId, turnId } = await seedSource({
      tenantId,
      userId: claire.userId,
      principals: [claire.userId, tenantId],
    });
    const [recent] = await adminDb
      .insert(ingestRuns)
      .values({ tenantId, sourceId, turnIds: [turnId], acl: [claire.userId] })
      .returning({ id: ingestRuns.id });
    const [vieux] = await adminDb
      .insert(ingestRuns)
      .values({ tenantId, sourceId, turnIds: [turnId], acl: [claire.userId] })
      .returning({ id: ingestRuns.id });
    if (!recent || !vieux) throw new Error('runs de test non créés');
    await adminDb
      .update(ingestRuns)
      .set({ updatedAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(ingestRuns.id, vieux.id));

    expect(await runsEnCours(adminDb, ENTREPRISE.slug)).toEqual({ actifs: 1, bloques: 1 });
  });
});

describe('runsEnCoursParTenant', () => {
  it('distingue les runs actifs des runs bloqués pour un tenant donné', async () => {
    const { tenantId, comptes } = await remettreAZero(adminDb, ENTREPRISE);
    const [claire] = comptes;
    if (!claire) throw new Error('claire manquante');
    const { sourceId, turnId } = await seedSource({
      tenantId,
      userId: claire.userId,
      principals: [claire.userId, tenantId],
    });
    const [recent] = await adminDb
      .insert(ingestRuns)
      .values({ tenantId, sourceId, turnIds: [turnId], acl: [claire.userId] })
      .returning({ id: ingestRuns.id });
    const [vieux] = await adminDb
      .insert(ingestRuns)
      .values({ tenantId, sourceId, turnIds: [turnId], acl: [claire.userId] })
      .returning({ id: ingestRuns.id });
    if (!recent || !vieux) throw new Error('runs de test non créés');
    await adminDb
      .update(ingestRuns)
      .set({ updatedAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(ingestRuns.id, vieux.id));

    expect(await runsEnCoursParTenant(adminDb, tenantId)).toEqual({ actifs: 1, bloques: 1 });
  });
});

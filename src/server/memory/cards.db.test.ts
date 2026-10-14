import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cardAliases, cards, cardTypes } from '@/server/db/schema/memory';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { seedRightsScenario } from '@/test/rights-scenario';
import { unionAcl } from './acl';
import {
  addCardAliases,
  createCard,
  findCardCandidates,
  findCardsByHardKey,
  widenCardAcl,
} from './cards';
import { loadCatalog } from './catalog';

async function typeId(tx: Tx, slug: string): Promise<string> {
  const type = (await loadCatalog(tx)).types.find((t) => t.slug === slug);
  if (!type) throw new Error(`type absent : ${slug}`);
  return type.id;
}

const cardAcl = async (cardId: string) =>
  (await adminDb.select({ acl: cards.acl }).from(cards).where(eq(cards.id, cardId)))[0]?.acl;
const typeAcl = async (id: string) =>
  (await adminDb.select({ acl: cardTypes.acl }).from(cardTypes).where(eq(cardTypes.id, id)))[0]
    ?.acl;

function newCard(ctx: TenantContext, typeSlug: string, acl: string[]) {
  return withTenant(ctx, async (tx) =>
    createCard(tx, ctx, {
      typeId: await typeId(tx, typeSlug),
      title: 'Atelier Nord',
      status: 'confirmed',
      acl,
    }),
  );
}

describe('findCardsByHardKey', () => {
  it('trouve ACME par son domaine pour Paul et Marie, pas pour Zoé', async () => {
    const { paul, marie, zoe, ids } = await seedRightsScenario();
    const keys = { emails: [], domains: ['acme.fr'] };

    expect(await withTenant(paul, (tx) => findCardsByHardKey(tx, keys))).toEqual([ids.acmeCard]);
    expect(await withTenant(marie, (tx) => findCardsByHardKey(tx, keys))).toEqual([ids.acmeCard]);
    expect(await withTenant(zoe, (tx) => findCardsByHardKey(tx, keys))).toEqual([]);
  });

  it('compare les e-mails et les domaines en minuscules', async () => {
    const { paul, ids } = await seedRightsScenario();
    await withTenant(paul, (tx) =>
      addCardAliases(
        tx,
        paul,
        ids.acmeCard,
        [{ alias: 'Compta@ACME.fr', kind: 'email' }],
        [paul.userId],
      ),
    );

    const found = await withTenant(paul, (tx) =>
      findCardsByHardKey(tx, { emails: ['compta@acme.fr'], domains: ['ACME.FR'] }),
    );
    expect(found).toEqual([ids.acmeCard]);
  });
});

describe('findCardCandidates', () => {
  it('trouve Orion pour Paul et rien pour Marie', async () => {
    const { paul, marie, ids } = await seedRightsScenario();

    const forPaul = await withTenant(paul, (tx) => findCardCandidates(tx, 'Orion'));
    expect(forPaul).toEqual([
      {
        id: ids.orionCard,
        title: 'Orion',
        typeSlug: 'projet',
        status: 'confirmed',
        aliases: ['orion'],
        similarity: 1,
      },
    ]);
    expect(await withTenant(marie, (tx) => findCardCandidates(tx, 'Orion'))).toEqual([]);
  });

  it('trouve ACME par similarité', async () => {
    const { marie, ids } = await seedRightsScenario();

    const [candidate] = await withTenant(marie, (tx) => findCardCandidates(tx, 'ACM'));
    expect(candidate).toMatchObject({ id: ids.acmeCard, title: 'ACME', aliases: ['acme.fr'] });
    expect(candidate?.similarity).toBeGreaterThan(0.3);
  });
});

describe('createCard et widenCardAcl', () => {
  it("élargit l'ACL d'une fiche par union", async () => {
    const { paul, tenantId } = await seedRightsScenario();
    const cardId = await newCard(paul, 'client', [paul.userId]);
    const [created] = await adminDb.select().from(cards).where(eq(cards.id, cardId));
    expect(created).toMatchObject({ createdBy: paul.userId, status: 'confirmed', tenantId });

    await withTenant(paul, (tx) => widenCardAcl(tx, cardId, [tenantId]));

    expect(await cardAcl(cardId)).toEqual(unionAcl([paul.userId], [tenantId]));
  });

  it('élargit aussi le type propre au tenant, que Marie voit alors', async () => {
    const { paul, marie, tenantId, ids } = await seedRightsScenario();
    const cardId = await newCard(paul, 'chantier', [paul.userId]);
    expect(await typeAcl(ids.proposedType)).toEqual([paul.userId]);

    await withTenant(paul, (tx) => widenCardAcl(tx, cardId, [tenantId]));

    expect(await typeAcl(ids.proposedType)).toEqual(unionAcl([paul.userId], [tenantId]));
    const catalog = await withTenant(marie, (tx) => loadCatalog(tx));
    expect(catalog.types.map((t) => t.slug)).toContain('chantier');
  });

  it("élargit le type propre au tenant dès la création d'une fiche d'équipe", async () => {
    const { paul, tenantId, ids } = await seedRightsScenario();
    await newCard(paul, 'chantier', [tenantId]);

    expect(await typeAcl(ids.proposedType)).toEqual(unionAcl([paul.userId], [tenantId]));
  });

  it('lève sur une fiche invisible et ne change rien', async () => {
    const { marie, paul, tenantId, ids } = await seedRightsScenario();

    await expect(
      withTenant(marie, (tx) => widenCardAcl(tx, ids.orionCard, [tenantId])),
    ).rejects.toThrow();
    expect(await cardAcl(ids.orionCard)).toEqual([paul.userId]);
  });
});

describe('addCardAliases', () => {
  it('ignore un alias déjà présent', async () => {
    const { paul, tenantId, ids } = await seedRightsScenario();
    await withTenant(paul, (tx) =>
      addCardAliases(
        tx,
        paul,
        ids.acmeCard,
        [
          { alias: 'acme.fr', kind: 'domain' },
          { alias: 'ACME', kind: 'name' },
        ],
        [tenantId],
      ),
    );

    const aliases = await adminDb
      .select({ alias: cardAliases.alias, id: cardAliases.id })
      .from(cardAliases)
      .where(eq(cardAliases.cardId, ids.acmeCard));
    expect(aliases.map((a) => a.alias).sort()).toEqual(['ACME', 'acme.fr']);
    expect(aliases.find((a) => a.alias === 'acme.fr')?.id).toBe(ids.acmeTeamAlias);
  });
});

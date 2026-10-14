import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { cardTypes } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { seedRightsScenario } from '@/test/rights-scenario';
import { createProposedType, loadCatalog, predicatesForType } from './catalog';

const BASE_SLUGS = [
  'client',
  'concurrent',
  'decision',
  'fournisseur',
  'outil',
  'personne',
  'produit',
  'projet',
  'regle',
];

describe('loadCatalog', () => {
  it('donne à Paul le socle et son type proposé', async () => {
    const { paul } = await seedRightsScenario();
    const catalog = await withTenant(paul, (tx) => loadCatalog(tx));

    const base = catalog.types.filter((type) => type.isBase).map((type) => type.slug);
    expect(base.sort()).toEqual(BASE_SLUGS);
    expect(catalog.types.find((type) => type.slug === 'chantier')).toMatchObject({
      label: 'Chantier',
      parentSlug: 'projet',
      status: 'proposed',
      isBase: false,
    });
  });

  it('ne donne pas à Marie le type proposé de Paul', async () => {
    const { marie } = await seedRightsScenario();
    const catalog = await withTenant(marie, (tx) => loadCatalog(tx));

    expect(catalog.types.map((type) => type.slug)).not.toContain('chantier');
    expect(catalog.types.filter((type) => type.isBase)).toHaveLength(9);
  });
});

describe('predicatesForType', () => {
  it('fait hériter un type dérivé des prédicats de son parent', async () => {
    const { paul } = await seedRightsScenario();
    const catalog = await withTenant(paul, (tx) => loadCatalog(tx));

    const projet = predicatesForType(catalog, 'projet');
    expect(projet.map((p) => p.slug).sort()).toEqual([
      'budget',
      'decision',
      'echeance',
      'note',
      'objectif',
      'responsable',
      'risque',
      'statut',
    ]);
    expect(projet.find((p) => p.slug === 'echeance')).toEqual({
      typeSlug: 'projet',
      slug: 'echeance',
      label: 'Échéance',
      singleValued: true,
    });
    expect(predicatesForType(catalog, 'chantier')).toEqual(projet);
  });
});

describe('createProposedType', () => {
  it("crée un type proposé à l'ACL donnée", async () => {
    const { paul, tenantId } = await seedRightsScenario();
    const created = await withTenant(paul, (tx) =>
      createProposedType(tx, paul, {
        slug: 'atelier',
        label: 'Atelier',
        parentSlug: 'projet',
        acl: [tenantId],
      }),
    );

    expect(created).toMatchObject({
      slug: 'atelier',
      label: 'Atelier',
      parentSlug: 'projet',
      status: 'proposed',
      isBase: false,
    });
    const [row] = await adminDb
      .select()
      .from(cardTypes)
      .where(eq(cardTypes.id, created?.id ?? ''));
    expect(row).toMatchObject({ tenantId, acl: [tenantId], status: 'proposed' });
  });

  it('renvoie le type existant quand le slug est déjà visible', async () => {
    const { paul, ids } = await seedRightsScenario();
    const again = await withTenant(paul, (tx) =>
      createProposedType(tx, paul, {
        slug: 'chantier',
        label: 'Chantier',
        parentSlug: 'projet',
        acl: [paul.userId],
      }),
    );

    expect(again?.id).toBe(ids.proposedType);
  });

  it('renvoie null sans lever quand le slug est pris par un type invisible', async () => {
    const { paul, marie, tenantId, ids } = await seedRightsScenario();
    const result = await withTenant(marie, (tx) =>
      createProposedType(tx, marie, {
        slug: 'chantier',
        label: 'Chantier',
        parentSlug: 'projet',
        acl: [tenantId],
      }),
    );

    expect(result).toBeNull();
    const rows = await adminDb
      .select({ id: cardTypes.id, acl: cardTypes.acl })
      .from(cardTypes)
      .where(eq(cardTypes.tenantId, tenantId));
    expect(rows).toEqual([{ id: ids.proposedType, acl: [paul.userId] }]);
  });
});

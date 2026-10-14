import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { seedCard } from '@/test/fixtures';
import { type RightsScenario, seedRightsScenario } from '@/test/rights-scenario';
import { insertFact } from './facts';
import { listCardTree, type TreeType } from './tree';

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

const find = (tree: TreeType[], slug: string) => tree.find((type) => type.slug === slug);
const cardIds = (type: TreeType | undefined) => type?.cards.map((card) => card.id) ?? [];

async function shareChantierCard({ tenantId, paul, ids }: RightsScenario): Promise<string> {
  const cardId = await seedCard(tenantId, {
    title: 'Chantier Lyon',
    typeSlug: 'chantier',
    acl: [paul.userId],
    createdBy: paul.userId,
  });
  await withTenant(paul, (tx) =>
    insertFact(tx, paul, {
      cardId,
      predicate: 'note',
      statement: 'Le chantier de Lyon démarre lundi.',
      value: null,
      quote: 'Le chantier de Lyon démarre lundi.',
      quoteStart: 0,
      quoteEnd: 33,
      sourceId: ids.paulSource,
      turnId: ids.paulTurn,
      sourceKind: 'claude_code',
      authorId: paul.userId,
      validFrom: new Date(),
      validTo: null,
      status: 'active',
      sensitivity: 'shareable',
      singleValued: false,
      confidence: 0.9,
      acl: [tenantId],
      candidateId: null,
    }),
  );
  return cardId;
}

describe('listCardTree', () => {
  it('montre toujours les 8 types du socle, triés par libellé', async () => {
    const { zoe } = await seedRightsScenario();
    const tree = await listCardTree(zoe);
    expect(tree.map((type) => type.slug).sort()).toEqual(BASE_SLUGS);
    expect(tree.map((type) => type.label)).toEqual(
      tree.map((type) => type.label).sort((a, b) => a.localeCompare(b, 'fr')),
    );
    expect(find(tree, 'projet')?.cardCount).toBe(0);
    expect(cardIds(find(tree, 'client'))).toHaveLength(1);
  });

  it('range Orion sous projet pour Paul, et le type proposé en enfant', async () => {
    const { paul, ids } = await seedRightsScenario();
    const projet = find(await listCardTree(paul), 'projet');
    expect(cardIds(projet)).toEqual([ids.orionCard]);
    expect(projet?.cardCount).toBe(1);
    expect(projet?.children.map((child) => [child.slug, child.status, child.isBase])).toEqual([
      ['chantier', 'proposed', false],
    ]);
  });

  it('ne montre à Marie ni Orion ni le type proposé de Paul', async () => {
    const { marie, ids } = await seedRightsScenario();
    const tree = await listCardTree(marie);
    const projet = find(tree, 'projet');
    expect(cardIds(projet)).toEqual([]);
    expect(projet?.children).toEqual([]);
    expect(cardIds(find(tree, 'client'))).toEqual([ids.acmeCard]);
    expect(JSON.stringify(tree)).not.toContain('Orion');
  });

  it("montre à Marie une fiche de type dérivé dès qu'elle reçoit un fait d'équipe", async () => {
    const scenario = await seedRightsScenario();
    const cardId = await shareChantierCard(scenario);
    const projet = find(await listCardTree(scenario.marie), 'projet');
    expect(projet?.children).toEqual([
      {
        slug: 'chantier',
        label: 'Chantier',
        status: 'proposed',
        isBase: false,
        cardCount: 1,
        cards: [{ id: cardId, title: 'Chantier Lyon', status: 'confirmed' }],
        children: [],
      },
    ]);
  });

  it("ne montre une fiche non confirmée qu'à son auteur", async () => {
    const { tenantId, paul, marie } = await seedRightsScenario();
    const cardId = await seedCard(tenantId, {
      title: 'Atelier Sud',
      typeSlug: 'fournisseur',
      acl: [paul.userId],
      status: 'unconfirmed',
      createdBy: paul.userId,
    });
    const cardsOf = async (ctx: TenantContext) =>
      find(await listCardTree(ctx), 'fournisseur')?.cards;
    expect(await cardsOf(paul)).toEqual([
      { id: cardId, title: 'Atelier Sud', status: 'unconfirmed' },
    ]);
    expect(await cardsOf(marie)).toEqual([]);
  });

  it('trie les fiches par titre', async () => {
    const { tenantId, marie } = await seedRightsScenario();
    for (const title of ['Zèbre', 'éclair', 'Alpha']) {
      await seedCard(tenantId, { title, typeSlug: 'outil', acl: [tenantId] });
    }
    const outil = find(await listCardTree(marie), 'outil');
    expect(outil?.cards.map((card) => card.title)).toEqual(['Alpha', 'éclair', 'Zèbre']);
  });
});

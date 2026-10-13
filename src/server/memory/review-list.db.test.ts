import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { reviewItems } from '@/server/db/schema/memory';
import { adminDb } from '@/test/db';
import { seedCard, seedFact, seedSource } from '@/test/fixtures';
import { seedRightsScenario } from '@/test/rights-scenario';
import { resolveReviewItem } from './review-items';
import { listReviewItems } from './review-list';

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id).sort();

describe('listReviewItems', () => {
  it('donne à Paul son fait sensible et la contradiction, avec leur détail', async () => {
    const { paul, ids: s } = await seedRightsScenario();

    const items = await listReviewItems(paul, { status: 'open' });

    expect(ids(items)).toEqual([s.paulReview, s.teamReview].sort());
    const sensitive = items.find((item) => item.id === s.paulReview);
    expect(sensitive?.detail).toMatchObject({
      kind: 'sensitive_fact',
      cardId: s.acmeCard,
      cardTitle: 'ACME',
      categoryLabel: 'Juridique',
      fact: {
        id: s.acmePaulFact,
        statement: 'Le contrat ACME contient une clause zanzibar confidentielle.',
        authorName: 'Paul Martin',
        sourceKindLabel: 'Claude Code',
      },
    });
    const conflict = items.find((item) => item.id === s.teamReview);
    expect(conflict?.detail).toMatchObject({
      kind: 'conflict',
      cardId: s.acmeCard,
      cardTitle: 'ACME',
      predicateLabel: 'Paiement',
    });
    expect(conflict?.detail.kind === 'conflict' && conflict.detail.facts.map((f) => f.id)).toEqual([
      s.acmeTeamFact,
      s.acmeConflictFact,
    ]);
    expect(conflict?.status).toBe('open');
    expect(conflict?.resolution).toBeNull();
  });

  it('ne donne à Marie que la contradiction, sans rien du fait privé de Paul', async () => {
    const { marie, ids: s } = await seedRightsScenario();

    const items = await listReviewItems(marie, { status: 'open' });

    expect(ids(items)).toEqual([s.teamReview]);
    expect(JSON.stringify(items)).not.toContain('zanzibar');
  });

  it("ne donne à Zoé rien de l'autre organisation", async () => {
    const { zoe } = await seedRightsScenario();

    expect(await listReviewItems(zoe, { status: 'open' })).toEqual([]);
    expect(await listReviewItems(zoe, { status: 'resolved' })).toEqual([]);
  });

  it("passe un élément résolu dans « resolved » avec le nom de qui l'a tranché", async () => {
    const { paul, marie, ids: s } = await seedRightsScenario();

    await resolveReviewItem(paul, s.paulReview, {
      kind: 'sensitive_fact',
      decision: 'keep_private',
    });

    const open = await listReviewItems(paul, { status: 'open' });
    const resolved = await listReviewItems(paul, { status: 'resolved' });
    expect(ids(open)).toEqual([s.teamReview]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      id: s.paulReview,
      status: 'resolved',
      resolvedByName: 'Paul Martin',
      resolution: { kind: 'sensitive_fact', decision: 'keep_private' },
    });
    expect(resolved[0]?.resolvedAt).toBeInstanceOf(Date);
    expect(await listReviewItems(marie, { status: 'resolved' })).toEqual([]);
  });

  it('trie les éléments traités du dernier tranché au premier', async () => {
    const { paul, ids: s } = await seedRightsScenario();

    await resolveReviewItem(paul, s.teamReview, { kind: 'conflict', decision: 'keep_first' });
    await resolveReviewItem(paul, s.paulReview, { kind: 'sensitive_fact', decision: 'share' });

    const resolved = await listReviewItems(paul, { status: 'resolved' });
    expect(resolved.map((item) => item.id)).toEqual([s.paulReview, s.teamReview]);
  });

  it('affiche un élément clos sans décision comme obsolète, sans nom', async () => {
    const { paul, ids: s } = await seedRightsScenario();
    await adminDb
      .update(reviewItems)
      .set({ status: 'resolved', resolution: { kind: 'obsolete' }, resolvedAt: new Date() })
      .where(eq(reviewItems.id, s.teamReview));

    const [item] = await listReviewItems(paul, { status: 'resolved' });

    expect(item).toMatchObject({
      id: s.teamReview,
      resolvedByName: null,
      resolution: { kind: 'obsolete' },
    });
  });

  it("omet sans lever un élément dont une ligne référencée n'est pas visible", async () => {
    const { tenantId, paul, marie, ids: s } = await seedRightsScenario();
    const [orphan] = await adminDb
      .insert(reviewItems)
      .values({
        tenantId,
        kind: 'sensitive_fact',
        payload: { kind: 'sensitive_fact', factId: s.acmePaulFact, category: null },
        acl: [tenantId],
      })
      .returning({ id: reviewItems.id });

    const forMarie = await listReviewItems(marie, { status: 'open' });
    const forPaul = await listReviewItems(paul, { status: 'open' });

    expect(ids(forMarie)).toEqual([s.teamReview]);
    expect(ids(forPaul)).toContain(orphan?.id);
  });

  it('respecte la limite, le plus récent en premier', async () => {
    const { paul, ids: s } = await seedRightsScenario();
    await adminDb
      .update(reviewItems)
      .set({ createdAt: new Date('2026-10-01T09:00:00Z') })
      .where(eq(reviewItems.id, s.paulReview));

    const items = await listReviewItems(paul, { status: 'open', limit: 1 });

    expect(items.map((item) => item.id)).toEqual([s.teamReview]);
  });

  it('décrit une fiche à rapprocher : titre, type, nombre de faits et premier fait', async () => {
    const { tenantId, paul, ids: s } = await seedRightsScenario();
    const source = await seedSource(paul, { kind: 'claude_ai' });
    const acl = [paul.userId];
    const newCard = await seedCard(tenantId, {
      title: 'Marie D.',
      typeSlug: 'personne',
      acl,
      status: 'unconfirmed',
      createdBy: paul.userId,
    });
    const candidateCard = await seedCard(tenantId, {
      title: 'Marie Dupont',
      typeSlug: 'personne',
      acl,
      createdBy: paul.userId,
    });
    const fact = (cardId: string, statement: string, sourceKind?: 'claude_ai') =>
      seedFact(tenantId, {
        cardId,
        ...source,
        authorId: paul.userId,
        predicate: 'note',
        statement,
        acl,
        sourceKind,
      });
    const mention = await fact(newCard, 'Marie D. signe les devis.', 'claude_ai');
    await fact(candidateCard, 'Marie Dupont est gérante.');
    await fact(candidateCard, 'Marie Dupont a un chantier à Brest.');
    const [item] = await adminDb
      .insert(reviewItems)
      .values({
        tenantId,
        kind: 'entity_match',
        payload: { kind: 'entity_match', newCardId: newCard, candidateCardId: candidateCard },
        acl,
      })
      .returning({ id: reviewItems.id });

    const items = await listReviewItems(paul, { status: 'open' });

    const detail = items.find((i) => i.id === item?.id)?.detail;
    expect(detail).toMatchObject({
      kind: 'entity_match',
      newCard: {
        id: newCard,
        title: 'Marie D.',
        typeLabel: 'Personne',
        factCount: 1,
        firstFact: { id: mention, sourceKindLabel: 'claude.ai', authorName: 'Paul Martin' },
      },
      candidateCard: {
        id: candidateCard,
        title: 'Marie Dupont',
        typeLabel: 'Personne',
        factCount: 2,
      },
    });
    expect(ids(items)).toContain(s.paulReview);
  });

  it('décrit un type proposé : libellé, parent et nombre de fiches', async () => {
    const { tenantId, paul, ids: s } = await seedRightsScenario();
    await seedCard(tenantId, { title: 'Chantier Brest', typeSlug: 'chantier', acl: [paul.userId] });
    const [item] = await adminDb
      .insert(reviewItems)
      .values({
        tenantId,
        kind: 'proposed_type',
        payload: { kind: 'proposed_type', typeId: s.proposedType },
        acl: [paul.userId],
      })
      .returning({ id: reviewItems.id });

    const items = await listReviewItems(paul, { status: 'open' });

    expect(items.find((i) => i.id === item?.id)?.detail).toEqual({
      kind: 'proposed_type',
      type: { id: s.proposedType, slug: 'chantier', label: 'Chantier', parentLabel: 'Projet' },
      cardCount: 1,
    });
  });
});

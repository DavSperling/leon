import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { facts, ingestRuns } from '@/server/db/schema/memory';
import { llmUsage } from '@/server/db/schema/usage';
import { adminDb } from '@/test/db';
import { createTestTenant, seedCard, seedSource } from '@/test/fixtures';
import { etatRuns, lireFaits, lireUsage } from './collect';

async function seed() {
  const { tenantId, members } = await createTestTenant(['Paul']);
  const [paul] = members as [TenantContext];
  const { sourceId, turnId } = await seedSource(paul, {
    title: 'Devis',
    text: 'Dupont paie à 45 jours.',
  });
  const cardId = await seedCard(tenantId, {
    title: 'Menuiserie Dupont',
    typeSlug: 'client',
    acl: [tenantId],
  });
  await adminDb.insert(facts).values({
    tenantId,
    cardId,
    predicate: 'note',
    statement: 'Dupont paie à 45 jours.',
    quote: 'paie à 45 jours',
    sourceId,
    turnId,
    quoteStart: 7,
    quoteEnd: 22,
    sourceKind: 'claude_code',
    authorId: paul.userId,
    validFrom: new Date(),
    status: 'active',
    sensitivity: 'shareable',
    singleValued: false,
    confidence: 0.9,
    acl: [tenantId],
  });
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({
      tenantId,
      sourceId,
      turnIds: [turnId],
      acl: [paul.userId],
      status: 'done',
      step: 'done',
    })
    .returning({ id: ingestRuns.id });
  await adminDb.insert(llmUsage).values([
    {
      tenantId,
      ingestRunId: run?.id,
      step: 'extraction',
      model: 'claude-sonnet-5-5',
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: '0.00030000',
    },
    {
      tenantId,
      ingestRunId: run?.id,
      step: 'extraction',
      model: 'claude-sonnet-5-5',
      inputTokens: 50,
      outputTokens: 5,
      cacheReadTokens: 20,
      cacheWriteTokens: 0,
      costUsd: '0.00015000',
    },
  ]);
  return { tenantId };
}

describe('collect', () => {
  it('lit les faits avec leur source, leur tour, leur fiche et leur partage', async () => {
    const { tenantId } = await seed();
    const [fait] = await lireFaits(adminDb, tenantId);
    expect(fait).toMatchObject({
      statement: 'Dupont paie à 45 jours.',
      ficheTitre: 'Menuiserie Dupont',
      typeFiche: 'client',
      status: 'active',
      sensitivity: 'shareable',
      partage: true,
    });
    expect(fait?.sourceExternalId).toEqual(expect.any(String));
    expect(fait?.turnExternalId).toEqual(expect.any(String));
  });

  it('additionne l usage par étape', async () => {
    const { tenantId } = await seed();
    const usage = await lireUsage(adminDb, tenantId);
    expect(usage.extraction).toEqual({
      appels: 2,
      inputTokens: 150,
      outputTokens: 15,
      cacheReadTokens: 20,
      cacheWriteTokens: 0,
      costUsd: expect.closeTo(0.00045, 8),
    });
    expect(usage.triage.appels).toBe(0);
  });

  it('compte les runs par statut', async () => {
    const { tenantId } = await seed();
    expect(await etatRuns(adminDb, tenantId)).toMatchObject({
      total: 1,
      done: 1,
      failed: 0,
      enCours: 0,
    });
  });

  it('lit supersededBy et départage un même horodatage par l id', async () => {
    const { tenantId, members } = await createTestTenant(['Paul']);
    const [paul] = members as [TenantContext];
    const { sourceId, turnId } = await seedSource(paul, {
      title: 'Devis',
      text: 'Dupont paie à 45 jours puis à 60 jours.',
    });
    const cardId = await seedCard(tenantId, {
      title: 'Menuiserie Dupont',
      typeSlug: 'client',
      acl: [tenantId],
    });
    const base = {
      tenantId,
      cardId,
      predicate: 'note',
      quote: 'paie',
      sourceId,
      turnId,
      quoteStart: 0,
      quoteEnd: 4,
      sourceKind: 'claude_code' as const,
      authorId: paul.userId,
      validFrom: new Date(),
      sensitivity: 'shareable' as const,
      singleValued: false,
      confidence: 0.9,
      acl: [tenantId],
    };
    const [nouveau] = await adminDb
      .insert(facts)
      .values({ ...base, statement: 'Dupont paie à 60 jours.', status: 'active' })
      .returning({ id: facts.id });
    if (!nouveau) throw new Error('fait non créé');
    await adminDb.insert(facts).values({
      ...base,
      statement: 'Dupont paie à 45 jours.',
      status: 'superseded',
      supersededBy: nouveau.id,
    });
    const lus = await lireFaits(adminDb, tenantId);
    expect(lus).toHaveLength(2);
    const ancien = lus.find((f) => f.status === 'superseded');
    const recent = lus.find((f) => f.status === 'active');
    expect(ancien?.supersededBy).toBe(nouveau.id);
    expect(recent?.supersededBy).toBeNull();
  });

  it('un fait sensible en attente de revue n est pas partagé', async () => {
    const { tenantId, members } = await createTestTenant(['Paul']);
    const [paul] = members as [TenantContext];
    const { sourceId, turnId } = await seedSource(paul, {
      title: 'RH',
      text: 'Le salaire de Hugo est de 52 000 euros.',
    });
    const cardId = await seedCard(tenantId, {
      title: 'Hugo Martin',
      typeSlug: 'personne',
      acl: [tenantId],
    });
    await adminDb.insert(facts).values({
      tenantId,
      cardId,
      predicate: 'note',
      statement: 'Le salaire de Hugo est de 52 000 euros.',
      quote: '52 000 euros',
      sourceId,
      turnId,
      quoteStart: 0,
      quoteEnd: 12,
      sourceKind: 'claude_code',
      authorId: paul.userId,
      validFrom: new Date(),
      status: 'pending_review',
      sensitivity: 'sensitive',
      singleValued: false,
      confidence: 0.9,
      acl: [paul.userId], // privé à son auteur : jamais à l'organisation
    });
    const [fait] = await lireFaits(adminDb, tenantId);
    expect(fait).toMatchObject({
      status: 'pending_review',
      sensitivity: 'sensitive',
      partage: false,
    });
  });
});

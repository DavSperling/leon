import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { cards, factCandidates, ingestRuns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { advanceRun } from '../runs';
import { applyPlacement } from './apply';
import { buildPlacementContext } from './context';
import type { PlacementAction } from './plan';

// Le deuxième insertFact échoue comme une écriture concurrente (violation de la contrainte EXCLUDE).
vi.mock('@/server/memory/facts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/memory/facts')>();
  let calls = 0;
  return {
    ...actual,
    insertFact: vi.fn(async (...args: Parameters<typeof actual.insertFact>) => {
      calls += 1;
      if (calls === 2) {
        throw Object.assign(new Error('conflicting key value violates exclusion constraint'), {
          code: '23P01',
        });
      }
      return actual.insertFact(...args);
    }),
  };
});

async function setup() {
  const { tenantId, members } = await createTestTenant(['Paul Martin']);
  const [paul] = members as [TenantContext];
  const source = await seedSource(paul);
  const acl = [paul.userId];
  const [run] = await adminDb
    .insert(ingestRuns)
    .values({
      tenantId,
      sourceId: source.sourceId,
      turnIds: [source.turnId],
      step: 'placement',
      acl,
    })
    .returning({ id: ingestRuns.id });
  if (!run) throw new Error('run de test non créé');
  const candidate = (statement: string) => ({
    tenantId,
    ingestRunId: run.id,
    turnId: source.turnId,
    statement,
    predicate: 'note',
    typeHint: 'client',
    mentions: { subject: { name: statement, email: null, domain: null }, others: [] },
    quote: 'Tour de test.',
    quoteStart: 0,
    quoteEnd: 13,
    confidence: 0.8,
    sensitivity: 'shareable' as const,
    factAcl: [tenantId],
    acl,
  });
  const rows = await adminDb
    .insert(factCandidates)
    .values([candidate('Alpha est un client.'), candidate('Beta est un client.')])
    .returning();
  return { tenantId, paul, runId: run.id, rows };
}

describe('applyPlacement, échec au milieu', () => {
  it('annule toute la transaction : rien d écrit, candidats en attente, run à l étape placement', async () => {
    const { tenantId, paul, runId, rows } = await setup();
    const actions: PlacementAction[] = rows.map((row, n) => ({
      kind: 'place',
      candidateId: row.id,
      target: {
        kind: 'new',
        title: n === 0 ? 'Alpha' : 'Beta',
        type: { kind: 'existing', slug: 'client' },
        unconfirmedMatchCardId: null,
      },
      predicate: 'note',
      relation: { kind: 'new' },
      aliases: [],
    }));

    const write = withTenant(paul, async (tx) => {
      const context = await buildPlacementContext(tx, rows);
      await applyPlacement(tx, paul, context, rows, actions);
      await advanceRun(tx, runId, 'done');
    });

    await expect(write).rejects.toMatchObject({ code: '23P01' });
    expect(await adminDb.select().from(cards).where(eq(cards.tenantId, tenantId))).toEqual([]);
    const candidates = await adminDb
      .select({ status: factCandidates.status })
      .from(factCandidates)
      .where(eq(factCandidates.ingestRunId, runId));
    expect(candidates).toEqual([{ status: 'pending' }, { status: 'pending' }]);
    const [run] = await adminDb.select().from(ingestRuns).where(eq(ingestRuns.id, runId));
    expect(run?.step).toBe('placement');
  });
});

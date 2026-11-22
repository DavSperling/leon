import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeLlm } from '@/server/llm/fake-llm';

// Le démarrage du worker de la fiche, sur un pg-boss simulé : la file qu'il lit, et ce que fait son gestionnaire. Le
// travail lui-même se teste sur base (worker.db.test.ts).

const mocks = vi.hoisted(() => ({
  work: vi.fn(),
  resolveTenantContext: vi.fn(),
  buildFiche: vi.fn(),
  synthesizeFiche: vi.fn(),
}));

vi.mock('./queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queue')>()),
  getFicheBoss: async () => ({ work: mocks.work, getWipData: () => [] }),
}));
vi.mock('./fiche', () => ({ buildFiche: mocks.buildFiche }));
vi.mock('./synthese', () => ({ synthesizeFiche: mocks.synthesizeFiche }));
vi.mock('@/server/auth/tenant-context', () => ({
  resolveTenantContext: mocks.resolveTenantContext,
}));

const { startFicheWorker } = await import('./worker');

const globalForWorker = globalThis as typeof globalThis & { leonFicheWorker?: Promise<void> };
const ctx = { tenantId: randomUUID(), userId: randomUUID(), principals: [] };

beforeEach(() => {
  delete globalForWorker.leonFicheWorker;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.resolveTenantContext.mockResolvedValue(ctx);
});

describe('startFicheWorker', () => {
  it('lit la file fiche-construire, un travail à la fois par appel, et ne s’enregistre qu’une fois', async () => {
    await startFicheWorker({ llm: null });
    await startFicheWorker({ llm: null });

    expect(mocks.work).toHaveBeenCalledOnce();
    expect(mocks.work.mock.calls[0]?.slice(0, 2)).toEqual([
      'fiche-construire',
      expect.objectContaining({ batchSize: 1 }),
    ]);
  });

  it('son gestionnaire construit la fiche de la personne du travail, puis la donne au modèle réglé', async () => {
    const llm = createFakeLlm({ texts: [] });
    await startFicheWorker({ llm });
    const handler = mocks.work.mock.calls[0]?.at(-1) as (jobs: unknown[]) => Promise<void>;

    await handler([{ data: { tenantId: ctx.tenantId, userId: ctx.userId } }]);

    expect(mocks.resolveTenantContext).toHaveBeenCalledExactlyOnceWith(ctx.userId, ctx.tenantId);
    expect(mocks.buildFiche).toHaveBeenCalledExactlyOnceWith(ctx);
    expect(mocks.synthesizeFiche).toHaveBeenCalledExactlyOnceWith(ctx, { llm });
    expect(mocks.buildFiche.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.synthesizeFiche.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

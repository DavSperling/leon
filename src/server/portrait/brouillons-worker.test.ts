import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeLlm } from '@/server/llm/fake-llm';

// Le worker des brouillons, sur un pg-boss simulé : la file qu'il lit, et ce que fait son gestionnaire. Le passage
// lui-même se teste sur base (brouillons.db.test.ts), la file aussi (brouillons-queue.db.test.ts).

const mocks = vi.hoisted(() => ({
  work: vi.fn(),
  resolveTenantContext: vi.fn(),
  writeBrouillons: vi.fn(),
}));

vi.mock('./brouillons-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./brouillons-queue')>()),
  getBrouillonsBoss: async () => ({ work: mocks.work, getWipData: () => [] }),
}));
vi.mock('./brouillons', () => ({ writeBrouillons: mocks.writeBrouillons }));
vi.mock('@/server/auth/tenant-context', () => ({
  resolveTenantContext: mocks.resolveTenantContext,
}));

const { processBrouillonsJob, startBrouillonsWorker } = await import('./brouillons-worker');

const globalForWorker = globalThis as typeof globalThis & {
  leonBrouillonsWorker?: Promise<void>;
};
const ctx = { tenantId: randomUUID(), userId: randomUUID(), principals: [] };
const job = { tenantId: ctx.tenantId, userId: ctx.userId };

beforeEach(() => {
  delete globalForWorker.leonBrouillonsWorker;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.resolveTenantContext.mockResolvedValue(ctx);
});

describe('startBrouillonsWorker', () => {
  it('lit la file brouillons-ecrire, un travail à la fois par appel, et ne s’enregistre qu’une fois', async () => {
    await startBrouillonsWorker({ llm: null });
    await startBrouillonsWorker({ llm: null });

    expect(mocks.work).toHaveBeenCalledOnce();
    expect(mocks.work.mock.calls[0]?.slice(0, 2)).toEqual([
      'brouillons-ecrire',
      expect.objectContaining({ batchSize: 1 }),
    ]);
  });

  it('son gestionnaire lance un passage pour la personne du travail, avec le modèle réglé', async () => {
    const llm = createFakeLlm({ texts: [] });
    await startBrouillonsWorker({ llm });
    const handler = mocks.work.mock.calls[0]?.at(-1) as (jobs: unknown[]) => Promise<void>;

    await handler([{ data: job }]);

    expect(mocks.resolveTenantContext).toHaveBeenCalledExactlyOnceWith(ctx.userId, ctx.tenantId);
    expect(mocks.writeBrouillons).toHaveBeenCalledExactlyOnceWith(ctx, { llm });
  });
});

describe('processBrouillonsJob', () => {
  it('sans modèle branché, le passage ne fait rien', async () => {
    await processBrouillonsJob(job, { llm: null });

    expect(mocks.resolveTenantContext).not.toHaveBeenCalled();
    expect(mocks.writeBrouillons).not.toHaveBeenCalled();
  });

  it('saute sans erreur une personne partie de l’organisation, et refuse un travail sans ses deux identifiants', async () => {
    const llm = createFakeLlm({ texts: [] });
    mocks.resolveTenantContext.mockResolvedValue(null);

    await expect(processBrouillonsJob(job, { llm })).resolves.toBeUndefined();
    await expect(processBrouillonsJob({ ...job, userId: 'x' }, { llm })).rejects.toThrow();
    await expect(processBrouillonsJob({ ...job, userId: 'x' }, { llm: null })).rejects.toThrow();

    expect(mocks.writeBrouillons).not.toHaveBeenCalled();
  });

  it('un passage qui échoue relance le travail avec le résumé de l’erreur, jamais son message de base', async () => {
    const llm = createFakeLlm({ texts: [] });
    const failure = Object.assign(new Error("insert … values ('Bonjour Léa')"), {
      code: '23505',
      severity: 'ERROR',
      constraint: 'brouillons_tenant_id_source_id_user_id_message_key',
    });
    mocks.writeBrouillons.mockRejectedValue(failure);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const thrown = await processBrouillonsJob(job, { llm }).catch((error: Error) => error);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('code=23505');
    expect((thrown as Error).message).not.toContain('Bonjour');
    const logged = log.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('brouillons.pass_failed');
    expect(logged).not.toContain('Bonjour');
    log.mockRestore();
  });
});

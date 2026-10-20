import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { productionSources, readText } from '@/test/contracts/files';

type Handler = (jobs?: Array<{ data: unknown }>) => Promise<void>;

const mocks = vi.hoisted(() => ({
  work: vi.fn(),
  schedule: vi.fn(),
  unschedule: vi.fn(),
  indexIngestRun: vi.fn(),
  embedMissing: vi.fn(),
  dropOldVectors: vi.fn(),
  requeueStaleRuns: vi.fn(),
  failRun: vi.fn(),
  resolveTenantContext: vi.fn(),
}));

vi.mock('@/server/pipeline/queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/pipeline/queue')>()),
  getBoss: async () => ({
    work: mocks.work,
    schedule: mocks.schedule,
    unschedule: mocks.unschedule,
  }),
}));
vi.mock('@/server/pipeline/runs', () => ({ failRun: mocks.failRun }));
vi.mock('@/server/auth/tenant-context', () => ({
  resolveTenantContext: mocks.resolveTenantContext,
}));
vi.mock('./index-run', () => ({ indexIngestRun: mocks.indexIngestRun }));
vi.mock('./embed-missing', () => ({
  embedMissing: mocks.embedMissing,
  dropOldVectors: mocks.dropOldVectors,
  requeueStaleRuns: mocks.requeueStaleRuns,
}));

const { startSearchWorker } = await import('./worker');

const globalForWorker = globalThis as typeof globalThis & { leonSearchWorker?: Promise<void> };

const ctx: TenantContext = {
  tenantId: randomUUID(),
  userId: randomUUID(),
  principals: [],
};
const job = { ingestRunId: randomUUID(), tenantId: ctx.tenantId, userId: ctx.userId };

// Le gestionnaire que le worker a enregistré sur cette file.
function handlerOf(queue: string): Handler {
  const call = mocks.work.mock.calls.find(([name]) => name === queue);
  if (!call) throw new Error(`aucun gestionnaire sur ${queue}`);
  return call[call.length - 1] as Handler;
}

function optionsOf(queue: string): Record<string, unknown> {
  const call = mocks.work.mock.calls.find(([name]) => name === queue);
  return (call?.[1] ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  delete globalForWorker.leonSearchWorker;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.work.mockResolvedValue('worker-id');
  mocks.schedule.mockResolvedValue(undefined);
  mocks.unschedule.mockResolvedValue(undefined);
  mocks.indexIngestRun.mockResolvedValue('indexe');
  mocks.embedMissing.mockResolvedValue(0);
  mocks.dropOldVectors.mockResolvedValue(0);
  mocks.requeueStaleRuns.mockResolvedValue(0);
  mocks.resolveTenantContext.mockResolvedValue(ctx);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startSearchWorker', () => {
  it('lit la file « index », un job à la fois par appel et quatre au plus en parallèle', async () => {
    await startSearchWorker({ embedder: null });

    expect(optionsOf('pipeline-index')).toMatchObject({ batchSize: 1, localConcurrency: 4 });
  });

  // Un emplacement de pg-boss ne prend qu'un job par sondage : au sondage par défaut (2 s), la file `index` se
  // vide à 2 jobs par seconde (voir worker.db.test.ts, qui le mesure sur le vrai pg-boss).
  it('sonde la file « index » toutes les 0,5 s, le minimum de pg-boss, quand aucun sondage n’est fourni', async () => {
    await startSearchWorker({ embedder: null });

    expect(optionsOf('pipeline-index')).toMatchObject({ pollingIntervalSeconds: 0.5 });
  });

  // pg-boss rejette `pollingIntervalSeconds: undefined` (il teste la présence de la clé) :
  // sans option, la clé doit être absente des tics, sinon le serveur ne démarre pas.
  it('laisse aux tics le sondage par défaut de pg-boss quand aucun sondage n’est fourni', async () => {
    await startSearchWorker({ embedder: createFakeEmbedder() });

    const ticks = (mocks.work.mock.calls as unknown as Array<[string, object]>).filter(
      ([name]) => name !== 'pipeline-index',
    );
    expect(ticks.map(([name]) => name).sort()).toEqual(['pipeline-reindex', 'pipeline-requeue']);
    for (const [, options] of ticks) expect(options).not.toHaveProperty('pollingIntervalSeconds');
  });

  it('transmet pollingIntervalSeconds à pg-boss quand il est fourni', async () => {
    await startSearchWorker({ embedder: null }, { pollingIntervalSeconds: 1 });

    expect(optionsOf('pipeline-index')).toMatchObject({ pollingIntervalSeconds: 1 });
    expect(optionsOf('pipeline-requeue')).toMatchObject({ pollingIntervalSeconds: 1 });
  });

  it('planifie un tic par minute qui remet en file les runs en attente depuis 5 minutes', async () => {
    await startSearchWorker({ embedder: null });

    expect(mocks.schedule).toHaveBeenCalledWith('pipeline-requeue', '* * * * *');
    await handlerOf('pipeline-requeue')();
    expect(mocks.requeueStaleRuns).toHaveBeenCalledExactlyOnceWith(5);
  });

  it('complète les vecteurs manquants, 500 à la fois, à chaque tic quand un fournisseur est réglé', async () => {
    const embedder = createFakeEmbedder();

    await startSearchWorker({ embedder });

    expect(mocks.schedule).toHaveBeenCalledWith('pipeline-reindex', '* * * * *');
    expect(mocks.unschedule).not.toHaveBeenCalled();
    await handlerOf('pipeline-reindex')();
    expect(mocks.embedMissing).toHaveBeenCalledExactlyOnceWith({ embedder }, 500);
  });

  // Audit n° 19 : 500 vecteurs par minute, c'était deux jours pour rattraper un million de passages.
  it('enchaîne les lots de 500 dans un tic tant qu’il en reste', async () => {
    mocks.embedMissing.mockResolvedValueOnce(500).mockResolvedValueOnce(500).mockResolvedValue(120);
    await startSearchWorker({ embedder: createFakeEmbedder() });

    await handlerOf('pipeline-reindex')();

    expect(mocks.embedMissing).toHaveBeenCalledTimes(3);
  });

  // Audit 2 n° 7 bis : les vecteurs d'un ancien modèle restaient pour toujours à côté de ceux du courant.
  it('retire à chaque tic, par lot de 5 000, les vecteurs des autres modèles', async () => {
    const embedder = createFakeEmbedder();
    await startSearchWorker({ embedder });

    await handlerOf('pipeline-reindex')();

    expect(mocks.dropOldVectors).toHaveBeenCalledExactlyOnceWith(embedder.model, 5000);
  });

  it('rend la main au bout de 45 secondes, même s’il en reste', async () => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    mocks.embedMissing.mockImplementation(async () => {
      now += 20_000;
      return 500;
    });
    await startSearchWorker({ embedder: createFakeEmbedder() });

    await handlerOf('pipeline-reindex')();

    expect(mocks.embedMissing).toHaveBeenCalledTimes(3);
  });

  it('ne lit pas la file des vecteurs et retire son tic planifié quand aucun fournisseur n’est réglé', async () => {
    await startSearchWorker({ embedder: null });

    expect(mocks.work.mock.calls.map(([name]) => name)).not.toContain('pipeline-reindex');
    // Le tic d'un lancement précédent, avec fournisseur, resterait planifié dans la base sans lecteur.
    expect(mocks.unschedule).toHaveBeenCalledWith('pipeline-reindex');
    expect(mocks.schedule).not.toHaveBeenCalledWith('pipeline-reindex', expect.anything());
    expect(mocks.embedMissing).not.toHaveBeenCalled();
  });

  it('indexe le run du job avec le fournisseur réglé', async () => {
    const embedder = createFakeEmbedder();
    await startSearchWorker({ embedder });

    await handlerOf('pipeline-index')([{ data: job }]);

    expect(mocks.indexIngestRun).toHaveBeenCalledExactlyOnceWith(job, { embedder });
  });

  it('refuse un job qui ne porte pas des identifiants valides, sans indexer', async () => {
    await startSearchWorker({ embedder: null });

    await expect(
      handlerOf('pipeline-index')([{ data: { ingestRunId: 'pas-un-uuid' } }]),
    ).rejects.toThrow();
    expect(mocks.indexIngestRun).not.toHaveBeenCalled();
  });

  describe('quand l’indexation échoue', () => {
    const SECRET = 'mot de passe: violet-éléphant-7731';

    it('marque le run « failed », le journalise avec son identifiant et relance l’échec à pg-boss', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      mocks.indexIngestRun.mockRejectedValue(new Error('délai dépassé'));
      await startSearchWorker({ embedder: null });

      const failure = handlerOf('pipeline-index')([{ data: job }]);

      await expect(failure).rejects.toThrow(/^Error: délai dépassé/);
      expect(mocks.failRun).toHaveBeenCalledOnce();
      expect(mocks.failRun.mock.calls[0]?.slice(0, 2)).toEqual([ctx, job.ingestRunId]);
      expect(log.mock.calls.flat().map(String).join('\n')).toContain(job.ingestRunId);
    });

    it('relance, pour une erreur de base, un message qui ne cite ni la requête ni ses valeurs', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const databaseError = Object.assign(new Error(`insert ... values ('${SECRET}')`), {
        code: '23505',
        severity: 'ERROR',
        constraint: 'passages_turn_id_ord_key',
      });
      mocks.indexIngestRun.mockRejectedValue(databaseError);
      await startSearchWorker({ embedder: null });

      const failure = await handlerOf('pipeline-index')([{ data: job }]).catch(
        (error: Error) => error,
      );

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).not.toContain('violet');
      expect(log.mock.calls.flat().map(String).join('\n')).not.toContain('violet');
    });

    it('relance quand même l’échec si le marquage du run échoue', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mocks.indexIngestRun.mockRejectedValue(new Error('base indisponible'));
      mocks.failRun.mockRejectedValue(new Error('base indisponible'));
      await startSearchWorker({ embedder: null });

      await expect(handlerOf('pipeline-index')([{ data: job }])).rejects.toThrow(
        /base indisponible/,
      );
    });

    it('ne marque rien quand le propriétaire du run n’est plus membre', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mocks.indexIngestRun.mockRejectedValue(new Error('échec'));
      mocks.resolveTenantContext.mockResolvedValue(null);
      await startSearchWorker({ embedder: null });

      await expect(handlerOf('pipeline-index')([{ data: job }])).rejects.toThrow();
      expect(mocks.failRun).not.toHaveBeenCalled();
    });
  });

  it('relance l’échec d’un tic sans texte capté, pour que pg-boss le reprenne', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.requeueStaleRuns.mockRejectedValue(new Error('pool épuisé'));
    await startSearchWorker({ embedder: createFakeEmbedder() });
    mocks.embedMissing.mockRejectedValue(new Error('pool épuisé'));

    await expect(handlerOf('pipeline-requeue')()).rejects.toThrow(/pool épuisé/);
    await expect(handlerOf('pipeline-reindex')()).rejects.toThrow(/pool épuisé/);

    expect(log).toHaveBeenCalledTimes(2);
  });

  it('est idempotent : un deuxième démarrage ne réenregistre rien', async () => {
    await startSearchWorker({ embedder: null });
    const calls = mocks.work.mock.calls.length;

    await startSearchWorker({ embedder: null });

    expect(mocks.work.mock.calls.length).toBe(calls);
  });

  it('peut être relancé après un démarrage raté', async () => {
    mocks.work.mockRejectedValueOnce(new Error('pg-boss pas prêt'));

    await expect(startSearchWorker({ embedder: null })).rejects.toThrow('pg-boss pas prêt');
    await startSearchWorker({ embedder: null });

    expect(mocks.work.mock.calls.map(([name]) => name)).toContain('pipeline-requeue');
  });
});

// L'indexation plein texte doit tourner sans clé Anthropic et sans jamais appeler le modèle : ni le worker ni
// ce qu'il appelle ne touchent à l'interface du modèle ni à la clé (voir aussi instrumentation-node.test.ts, qui
// démarre le worker sans clé).
describe('indépendance du modèle', () => {
  const FILES = [
    'src/server/search/worker.ts',
    'src/server/search/index-run.ts',
    'src/server/search/embed-missing.ts',
    'src/server/search/chunk.ts',
  ];

  it.each(FILES)('%s n’importe ni le modèle ni la clé Anthropic', (path) => {
    const code = readText(path)
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    expect(code).not.toMatch(/@\/server\/llm|\.\/llm|anthropic/i);
  });

  it('trouve ces fichiers parmi les sources de production', () => {
    const found = productionSources('src/server/search/*.ts').map(({ path }) => path);

    expect(found).toEqual(expect.arrayContaining(FILES));
  });
});

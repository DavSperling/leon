import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { LlmError } from '@/server/llm/llm';
import { readText } from '@/test/contracts/files';

// Le worker du point du matin, sur un pg-boss simulé : ce qu'il enregistre, ce que fait chaque job. Le vrai
// pg-boss n'est pas lu ici : la file `point-refresh` est partagée par les fichiers de test, et un vrai lecteur y
// prendrait leurs jobs (voir worker.db.test.ts pour le planning réel du tic).

type Handler = (jobs?: Array<{ data: unknown }>) => Promise<void>;

const mocks = vi.hoisted(() => ({
  work: vi.fn(),
  schedule: vi.fn(),
  send: vi.fn(),
  execute: vi.fn(),
  enqueueBriefingRefresh: vi.fn(),
  refreshBriefing: vi.fn(),
  briefingIsFresh: vi.fn(),
  resolveTenantContext: vi.fn(),
  listAboutCandidates: vi.fn(),
  proposeAbout: vi.fn(),
}));

vi.mock('./queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queue')>()),
  getBriefingBoss: async () => ({ work: mocks.work, schedule: mocks.schedule, send: mocks.send }),
  enqueueBriefingRefresh: mocks.enqueueBriefingRefresh,
}));
vi.mock('./briefings', () => ({
  refreshBriefing: mocks.refreshBriefing,
  briefingIsFresh: mocks.briefingIsFresh,
}));
vi.mock('./about-suggestion', () => ({
  listAboutCandidates: mocks.listAboutCandidates,
  proposeAbout: mocks.proposeAbout,
}));
vi.mock('@/server/db/client', () => ({ db: { execute: mocks.execute } }));
vi.mock('@/server/auth/tenant-context', () => ({
  resolveTenantContext: mocks.resolveTenantContext,
}));

const { enqueueAboutProposals, enqueueMorningRefreshes, MORNING_READ_DAYS, startBriefingWorker } =
  await import('./worker');

const globalForWorker = globalThis as typeof globalThis & { leonBriefingWorker?: Promise<void> };

const ctx: TenantContext = { tenantId: randomUUID(), userId: randomUUID(), principals: [] };
const job = { tenantId: ctx.tenantId, userId: ctx.userId, project: 'github.com/acme/leon' };
const aboutJob = { tenantId: ctx.tenantId, userId: ctx.userId };

function handlerOf(queue: string): Handler {
  const call = mocks.work.mock.calls.find(([name]) => name === queue);
  if (!call) throw new Error(`aucun gestionnaire sur ${queue}`);
  return call[call.length - 1] as Handler;
}

const optionsOf = (queue: string) =>
  (mocks.work.mock.calls.find(([name]) => name === queue)?.[1] ?? {}) as Record<string, unknown>;

beforeEach(() => {
  delete globalForWorker.leonBriefingWorker;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.work.mockResolvedValue('worker-id');
  mocks.schedule.mockResolvedValue(undefined);
  mocks.execute.mockResolvedValue({ rows: [] });
  mocks.enqueueBriefingRefresh.mockResolvedValue(true);
  mocks.refreshBriefing.mockResolvedValue(undefined);
  mocks.briefingIsFresh.mockResolvedValue(false);
  mocks.resolveTenantContext.mockResolvedValue(ctx);
  mocks.send.mockResolvedValue('job-id');
  mocks.listAboutCandidates.mockResolvedValue([]);
  mocks.proposeAbout.mockResolvedValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('startBriefingWorker', () => {
  it('planifie le tic du matin chaque jour à 6 h, heure de Paris, et rattrape un tic manqué une fois', async () => {
    await startBriefingWorker({ llm: null });

    expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith('point-matin', '0 6 * * *', null, {
      tz: 'Europe/Paris',
      missed: 'once',
    });
    expect(optionsOf('point-matin')).toMatchObject({ batchSize: 1, localConcurrency: 1 });
  });

  it('lit la file des recalculs, un job à la fois par appel', async () => {
    await startBriefingWorker({ llm: null });

    expect(optionsOf('point-refresh')).toMatchObject({ batchSize: 1 });
    expect(optionsOf('point-refresh')).not.toHaveProperty('pollingIntervalSeconds');
  });

  it('est idempotent : un second démarrage n’enregistre rien de plus', async () => {
    await startBriefingWorker({ llm: null });
    await startBriefingWorker({ llm: null });

    expect(mocks.work).toHaveBeenCalledTimes(3);
  });

  it('refait le point du job avec le modèle réglé, sous les droits de son utilisateur', async () => {
    const llm = createFakeLlm({ texts: ['Point.'] });
    await startBriefingWorker({ llm });

    await handlerOf('point-refresh')([{ data: job }]);

    expect(mocks.resolveTenantContext).toHaveBeenCalledExactlyOnceWith(job.userId, job.tenantId);
    expect(mocks.refreshBriefing).toHaveBeenCalledExactlyOnceWith(ctx, job.project, { llm });
  });

  // Audit de la #28 : le tic du matin ne paie pas un appel au modèle pour réécrire un point sur lequel rien n'a bougé.
  it('ne refait pas un point à jour (aucun signal depuis sa préparation)', async () => {
    mocks.briefingIsFresh.mockResolvedValue(true);
    await startBriefingWorker({ llm: createFakeLlm({ texts: ['Point.'] }) });

    await handlerOf('point-refresh')([{ data: job }]);

    expect(mocks.briefingIsFresh).toHaveBeenCalledExactlyOnceWith(ctx, job.project);
    expect(mocks.refreshBriefing).not.toHaveBeenCalled();
  });

  // Choix le plus simple : sans modèle, le job se termine sans rien faire (aucune reprise, aucune boucle). Le point
  // se refera au prochain signal, à la prochaine lecture ou au tic du matin, une fois la clé réglée.
  it('sans modèle, termine le job sans rien faire et sans échec', async () => {
    await startBriefingWorker({ llm: null });

    await expect(handlerOf('point-refresh')([{ data: job }])).resolves.toBeUndefined();

    expect(mocks.resolveTenantContext).not.toHaveBeenCalled();
    expect(mocks.refreshBriefing).not.toHaveBeenCalled();
  });

  it('saute sans erreur un utilisateur parti de l’organisation', async () => {
    mocks.resolveTenantContext.mockResolvedValue(null);
    await startBriefingWorker({ llm: createFakeLlm({ texts: [] }) });

    await expect(handlerOf('point-refresh')([{ data: job }])).resolves.toBeUndefined();

    expect(mocks.refreshBriefing).not.toHaveBeenCalled();
  });

  it('refuse un job qui ne porte pas une clé de projet valide, sans rien refaire', async () => {
    await startBriefingWorker({ llm: createFakeLlm({ texts: [] }) });

    await expect(
      handlerOf('point-refresh')([{ data: { ...job, project: 'evil' } }]),
    ).rejects.toThrow();
    expect(mocks.refreshBriefing).not.toHaveBeenCalled();
  });

  it('relance à pg-boss un échec du recalcul, journalisé sans son message de base', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const databaseError = Object.assign(new Error("insert … values ('mot de passe: violet')"), {
      code: '23514',
      severity: 'ERROR',
      constraint: 'briefings_markdown_check',
    });
    mocks.refreshBriefing.mockRejectedValueOnce(databaseError);
    await startBriefingWorker({ llm: createFakeLlm({ texts: [] }) });

    const failure = await handlerOf('point-refresh')([{ data: job }]).catch(
      (error: Error) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('briefings_markdown_check');
    expect((failure as Error).message).not.toContain('violet');
    const logged = log.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('briefing.refresh_failed');
    expect(logged).not.toContain('violet');
  });

  it('relance une panne du modèle, que pg-boss reprendra', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.refreshBriefing.mockRejectedValueOnce(new LlmError('erreur du modèle'));
    await startBriefingWorker({ llm: createFakeLlm({ texts: [] }) });

    await expect(handlerOf('point-refresh')([{ data: job }])).rejects.toThrow(/erreur du modèle/);
  });

  it('lit la file des propositions « About you », un job à la fois par appel', async () => {
    await startBriefingWorker({ llm: null });

    expect(optionsOf('apropos-proposer')).toMatchObject({ batchSize: 1, localConcurrency: 1 });
    expect(optionsOf('apropos-proposer')).not.toHaveProperty('pollingIntervalSeconds');
  });

  it('le tic du matin met en file les points lus dans la semaine, puis les propositions « About you »', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await startBriefingWorker({ llm: null });

    await handlerOf('point-matin')();

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.listAboutCandidates).toHaveBeenCalledOnce();
  });

  it('le tic du matin envoie une proposition par personne prête, avec sa clé', async () => {
    mocks.listAboutCandidates.mockResolvedValue([
      { tenantId: ctx.tenantId, userId: ctx.userId },
      { tenantId: job.tenantId, userId: randomUUID() },
    ]);
    await startBriefingWorker({ llm: null });

    await handlerOf('point-matin')();

    const { calls } = mocks.send.mock;
    expect(calls).toHaveLength(2);
    for (const [queue, data, options] of calls) {
      const { tenantId, userId } = data as typeof aboutJob;
      expect(queue).toBe('apropos-proposer');
      expect(options).toEqual({ singletonKey: `${tenantId}:${userId}` });
    }
    expect(calls[0]?.[1]).toEqual(aboutJob);
  });

  // Les deux envois tournent toujours : un échec de l'un ne retire pas à l'autre son tic du jour, et l'erreur remonte
  // quand même, pour que pg-boss reprenne le tic (comme avant les propositions).
  it('le tic du matin envoie les propositions même si la mise en file des points échoue, et relance l’erreur', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.execute.mockRejectedValueOnce(new Error('base indisponible'));
    mocks.listAboutCandidates.mockResolvedValue([aboutJob]);
    await startBriefingWorker({ llm: null });

    await expect(handlerOf('point-matin')()).rejects.toThrow(/base indisponible/);

    expect(mocks.send).toHaveBeenCalledExactlyOnceWith('apropos-proposer', aboutJob, {
      singletonKey: `${aboutJob.tenantId}:${aboutJob.userId}`,
    });
    expect(log.mock.calls.flat().map(String).join('\n')).toContain('briefing.morning_tick_failed');
  });

  it('le tic du matin met les points en file même si la liste des propositions échoue, et relance l’erreur', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.execute.mockResolvedValue({
      rows: [{ tenant_id: ctx.tenantId, user_id: ctx.userId, project: job.project }],
    });
    mocks.listAboutCandidates.mockRejectedValueOnce(new Error('liste indisponible'));
    await startBriefingWorker({ llm: null });

    await expect(handlerOf('point-matin')()).rejects.toThrow(/liste indisponible/);

    expect(mocks.enqueueBriefingRefresh).toHaveBeenCalledOnce();
  });

  it('le tic du matin relance la première erreur et journalise les deux', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.execute.mockRejectedValueOnce(new Error('base indisponible'));
    mocks.listAboutCandidates.mockRejectedValueOnce(new Error('liste indisponible'));
    await startBriefingWorker({ llm: null });

    await expect(handlerOf('point-matin')()).rejects.toThrow(/base indisponible/);

    const logged = log.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('base indisponible');
    expect(logged).toContain('liste indisponible');
  });
});

describe('processAboutJob (file apropos-proposer)', () => {
  it('écrit la proposition avec le modèle réglé, sous les droits de la personne', async () => {
    const llm = createFakeLlm({ texts: ['Proposition.'] });
    await startBriefingWorker({ llm });

    await handlerOf('apropos-proposer')([{ data: aboutJob }]);

    expect(mocks.resolveTenantContext).toHaveBeenCalledExactlyOnceWith(
      aboutJob.userId,
      aboutJob.tenantId,
    );
    expect(mocks.proposeAbout).toHaveBeenCalledExactlyOnceWith(ctx, { llm });
  });

  it('sans modèle, termine le job sans rien appeler et sans échec', async () => {
    await startBriefingWorker({ llm: null });

    await expect(handlerOf('apropos-proposer')([{ data: aboutJob }])).resolves.toBeUndefined();

    expect(mocks.resolveTenantContext).not.toHaveBeenCalled();
    expect(mocks.proposeAbout).not.toHaveBeenCalled();
  });

  it('saute sans erreur une personne partie de l’organisation', async () => {
    mocks.resolveTenantContext.mockResolvedValue(null);
    await startBriefingWorker({ llm: createFakeLlm({ texts: [] }) });

    await expect(handlerOf('apropos-proposer')([{ data: aboutJob }])).resolves.toBeUndefined();

    expect(mocks.proposeAbout).not.toHaveBeenCalled();
  });

  it('refuse un job qui ne porte pas deux identifiants, sans rien écrire', async () => {
    await startBriefingWorker({ llm: createFakeLlm({ texts: [] }) });

    await expect(
      handlerOf('apropos-proposer')([{ data: { ...aboutJob, userId: 'evil' } }]),
    ).rejects.toThrow();
    expect(mocks.proposeAbout).not.toHaveBeenCalled();
  });

  it('relance à pg-boss une panne du modèle en résumé, journalisée sans son message de base', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.proposeAbout.mockRejectedValueOnce(new LlmError('erreur du modèle'));
    await startBriefingWorker({ llm: createFakeLlm({ texts: [] }) });

    await expect(handlerOf('apropos-proposer')([{ data: aboutJob }])).rejects.toThrow(
      /LlmError.*erreur du modèle/,
    );
    expect(log.mock.calls.flat().map(String).join('\n')).toContain('about.propose_failed');
  });
});

describe('enqueueAboutProposals', () => {
  it('continue après l’échec d’un envoi, et ne compte que les propositions mises en file', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.listAboutCandidates.mockResolvedValue(
      Array.from({ length: 3 }, () => ({ tenantId: ctx.tenantId, userId: randomUUID() })),
    );
    mocks.send
      .mockRejectedValueOnce(new Error('pg-boss indisponible'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('job-id');

    expect(await enqueueAboutProposals()).toBe(1);
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });
});

describe('enqueueMorningRefreshes', () => {
  it(`met en file tout de suite chaque point lu depuis moins de ${MORNING_READ_DAYS} jours`, async () => {
    const rows = [
      { tenant_id: ctx.tenantId, user_id: ctx.userId, project: 'github.com/acme/leon' },
      { tenant_id: randomUUID(), user_id: randomUUID(), project: 'dossier:0123456789abcdef' },
    ];
    mocks.execute.mockResolvedValue({ rows });

    expect(await enqueueMorningRefreshes()).toBe(2);

    expect(MORNING_READ_DAYS).toBe(7);
    const query = mocks.execute.mock.calls[0]?.[0] as { queryChunks: unknown[] };
    expect(JSON.stringify(query.queryChunks)).toContain('briefings_a_rafraichir');
    expect(query.queryChunks).toContain(7);
    expect(mocks.enqueueBriefingRefresh.mock.calls).toEqual(
      rows.map((row) => [{ tenantId: row.tenant_id, userId: row.user_id, project: row.project }]),
    );
  });

  it('continue après l’échec d’une mise en file, et ne compte que les points mis en file', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.execute.mockResolvedValue({
      rows: [
        { tenant_id: ctx.tenantId, user_id: ctx.userId, project: 'github.com/acme/a' },
        { tenant_id: ctx.tenantId, user_id: ctx.userId, project: 'github.com/acme/b' },
        { tenant_id: ctx.tenantId, user_id: ctx.userId, project: 'github.com/acme/c' },
      ],
    });
    mocks.enqueueBriefingRefresh
      .mockRejectedValueOnce(new Error('pg-boss indisponible'))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    expect(await enqueueMorningRefreshes()).toBe(1);
    expect(mocks.enqueueBriefingRefresh).toHaveBeenCalledTimes(3);
  });
});

// L'indexation signale les projets touchés (signalSourceActivity) et doit tourner sans clé Anthropic : la file du
// point du matin, qu'elle importe, ne touche ni au modèle ni à la clé (voir search/worker.test.ts).
describe('indépendance du modèle', () => {
  it('queue.ts n’importe ni le modèle ni la clé Anthropic', () => {
    const code = readText('src/server/briefing/queue.ts')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    expect(code).not.toMatch(/@\/server\/llm|\.\/llm|\.\/briefings|\.\/worker|anthropic/i);
  });
});

import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { passages, passageVectors } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { EMBEDDING_DIMS, type Embedder, EmbedderError } from '@/server/embeddings/embedder';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { enqueuePipelineStep, INDEX_PRIORITY } from '@/server/pipeline/queue';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedPassages, seedRun } from '@/test/seed-search';
import { EMBED_TIMEOUT_MS, embedMissing, REQUEUE_BATCH, requeueStaleRuns } from './embed-missing';
import { indexIngestRun } from './index-run';

// requeueStaleRuns met en file des jobs d'indexation : ici la file est simulée.
vi.mock('@/server/pipeline/queue');

// La base de test est partagée : d'autres fichiers y laissent, le temps de leurs tests, des passages sans
// vecteur et des runs en attente. Un fournisseur de test ne répond donc qu'aux textes qui portent le jeton
// de ces tests (il refuse les autres comme un fournisseur en panne) : seuls leurs passages reçoivent un
// vecteur, et les nombres rendus sont exacts.
function embedderFor(token: string, model = 'factice-1024'): Embedder {
  const factice = createFakeEmbedder();
  return {
    model,
    embed(texts, kind) {
      if (!texts.every((text) => text.includes(token))) {
        return Promise.reject(new EmbedderError('texte refusé'));
      }
      return factice.embed(texts, kind);
    },
  };
}

const MINUTE = 60_000;
const BIG = 10_000;
const tenantIds: string[] = [];
let alice: TenantContext;
let bob: TenantContext;
let zoe: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice', 'Bob']);
  const other = await createTestTenant(['Zoé']);
  [alice, bob] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
  // Les runs laissés « en attente » par les autres fichiers (leurs tests n'indexent rien) deviennent en retard
  // au bout de 5 minutes, et un passage ne reprend que les plus anciens : on les rajeunit, ils ne servent à rien.
  await adminPool.query(
    `update ingest_runs set updated_at = now()
     where status = 'queued' and updated_at < now() - interval '5 minutes'`,
  );
});

// Les erreurs journalisées par les reprises (fournisseur qui refuse les passages des autres fichiers) n'ont
// rien à faire dans la sortie des tests ; ceux qui lisent le journal passent par `log`.
let log: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.mocked(enqueuePipelineStep).mockReset();
  log = vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Chaque test repart de zéro : les passages d'un test ne se mêlent pas à ceux du suivant dans un même groupe.
afterEach(async () => {
  log.mockRestore();
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

const vectorsOf = (ctx: TenantContext, passageIds: string[]) =>
  withTenant(ctx, (tx) =>
    tx.select().from(passageVectors).where(inArray(passageVectors.passageId, passageIds)),
  );

describe('embedMissing', () => {
  it('complète les vecteurs manquants de deux organisations, à l’accès de chaque passage, et rien de plus au deuxième appel', async () => {
    const token = `jeton-${randomUUID()}`;
    const mine = await seedPassages(alice, { count: 3, token });
    const shared = await seedPassages(bob, { count: 1, token, acl: [bob.tenantId] });
    const theirs = await seedPassages(zoe, { count: 1, token });
    const embedder = embedderFor(token);

    const first = await embedMissing({ embedder }, BIG);
    const second = await embedMissing({ embedder }, BIG);

    expect(first).toBe(5);
    expect(second).toBe(0);
    const aliceVectors = await vectorsOf(alice, mine.passageIds);
    expect(aliceVectors).toHaveLength(3);
    for (const vector of aliceVectors) {
      expect(vector.model).toBe('factice-1024');
      expect(vector.acl).toEqual([alice.userId]);
    }
    const teamVectors = await vectorsOf(bob, shared.passageIds);
    expect(teamVectors.map((vector) => vector.acl)).toEqual([[bob.tenantId]]);
    expect(await vectorsOf(zoe, theirs.passageIds)).toHaveLength(1);
    // L'équipe d'Alice voit le passage partagé, jamais ceux de Zoé ni les passages privés d'Alice pour Bob.
    expect(await vectorsOf(bob, mine.passageIds)).toHaveLength(0);
  });

  it('refait des vecteurs pour un autre modèle et garde ceux de l’ancien', async () => {
    const token = `jeton-${randomUUID()}`;
    const mine = await seedPassages(alice, { count: 2, token });
    const theirs = await seedPassages(zoe, { count: 3, token });
    await embedMissing({ embedder: embedderFor(token, 'factice-a') }, BIG);

    const again = await embedMissing({ embedder: embedderFor(token, 'factice-b') }, BIG);

    expect(again).toBe(5);
    const models = (await vectorsOf(alice, mine.passageIds)).map((vector) => vector.model).sort();
    expect(models).toEqual(['factice-a', 'factice-a', 'factice-b', 'factice-b'].sort());
    const zoeModels = (await vectorsOf(zoe, theirs.passageIds)).map((vector) => vector.model);
    expect(zoeModels.filter((model) => model === 'factice-a')).toHaveLength(3);
    expect(zoeModels.filter((model) => model === 'factice-b')).toHaveLength(3);
  });

  it('ne dépasse pas la limite demandée', async () => {
    const token = `jeton-${randomUUID()}`;
    const seeded = await seedPassages(alice, { count: 5, token });

    const done = await embedMissing({ embedder: embedderFor(token) }, 2);

    expect(done).toBeLessThanOrEqual(2);
    expect((await vectorsOf(alice, seeded.passageIds)).length).toBeLessThanOrEqual(2);
  });

  it('poursuit avec les autres organisations quand le fournisseur échoue pour l’une d’elles', async () => {
    const tokenA = `jeton-a-${randomUUID()}`;
    const tokenB = `jeton-b-${randomUUID()}`;
    const refused = await seedPassages(alice, { count: 3, token: tokenA });
    const accepted = await seedPassages(zoe, { count: 2, token: tokenB });

    const done = await embedMissing({ embedder: embedderFor(tokenB) }, BIG);
    const logged = log.mock.calls.flat().map(String).join('\n');

    expect(done).toBe(2);
    expect(await vectorsOf(alice, refused.passageIds)).toHaveLength(0);
    expect(await vectorsOf(zoe, accepted.passageIds)).toHaveLength(2);
    expect(logged).not.toContain(tokenA);
    expect(logged).not.toContain('Passage');
  });

  it('poursuit avec les autres organisations quand l’écriture échoue pour l’une d’elles, sans rien journaliser du texte', async () => {
    const tokenA = `jeton-a-${randomUUID()}`;
    const tokenB = `jeton-b-${randomUUID()}`;
    const failing = await seedPassages(alice, { count: 2, token: tokenA });
    const kept = await seedPassages(zoe, { count: 2, token: tokenB });
    const factice = createFakeEmbedder();
    // Un fournisseur qui rend, pour les passages d'Alice, des valeurs hors de la plage d'un `halfvec` : la base
    // refuse l'écriture, celle de Zoé ne doit pas en pâtir.
    const embedder: Embedder = {
      model: 'factice-1024',
      async embed(texts, kind) {
        if (texts.every((text) => text.includes(tokenA))) {
          return texts.map(() => Array.from({ length: EMBEDDING_DIMS }, () => 1e9));
        }
        if (!texts.every((text) => text.includes(tokenB))) throw new EmbedderError('texte refusé');
        return factice.embed(texts, kind);
      },
    };

    const done = await embedMissing({ embedder }, BIG);

    expect(done).toBe(2);
    expect(await vectorsOf(alice, failing.passageIds)).toHaveLength(0);
    expect(await vectorsOf(zoe, kept.passageIds)).toHaveLength(2);
    const logged = log.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('search.embed_missing_failed');
    expect(logged).not.toContain(tokenA);
  });

  it('laisse de côté, sans échouer, les passages qui disparaissent pendant que le fournisseur travaille', async () => {
    const tokenA = `jeton-a-${randomUUID()}`;
    const tokenB = `jeton-b-${randomUUID()}`;
    const vanishing = await seedPassages(alice, { count: 2, token: tokenA });
    const kept = await seedPassages(zoe, { count: 2, token: tokenB });
    const factice = createFakeEmbedder();
    // La source d'Alice est supprimée pendant l'appel : ses passages n'existent plus à l'écriture.
    const embedder: Embedder = {
      model: 'factice-1024',
      async embed(texts, kind) {
        if (texts.every((text) => text.includes(tokenA))) {
          await adminPool.query('delete from sources where id = $1', [vanishing.sourceId]);
        } else if (!texts.every((text) => text.includes(tokenB))) {
          throw new EmbedderError('texte refusé');
        }
        return factice.embed(texts, kind);
      },
    };

    const done = await embedMissing({ embedder }, BIG);

    expect(done).toBe(2);
    expect(await vectorsOf(zoe, kept.passageIds)).toHaveLength(2);
    expect(log.mock.calls.flat().map(String).join('\n')).not.toContain(
      'search.embed_missing_failed',
    );
  });

  // Vigilance 5 : un fournisseur en panne ne retarde pas le plein texte, et les vecteurs reviennent ensuite.
  it('complète, à l’accès de chaque passage, les vecteurs qu’une indexation en panne a laissés', async () => {
    const token = `jeton-${randomUUID()}`;
    const run = await seedRun(alice, {
      acl: [alice.tenantId],
      turns: [{ text: `Premier tour ${token}` }, { text: `Deuxième tour ${token}` }],
    });
    const down: Embedder = {
      model: 'factice-1024',
      embed: () => Promise.reject(new EmbedderError('fournisseur indisponible (503)')),
    };
    await indexIngestRun(run.job, { embedder: down });
    const left = await withTenant(alice, (tx) =>
      tx.select({ id: passages.id }).from(passages).where(eq(passages.sourceId, run.sourceId)),
    );
    const ids = left.map((row) => row.id);
    expect(ids).toHaveLength(2);
    expect(await vectorsOf(alice, ids)).toHaveLength(0);

    const done = await embedMissing({ embedder: embedderFor(token) }, BIG);

    expect(done).toBe(2);
    const vectors = await vectorsOf(alice, ids);
    expect(vectors).toHaveLength(2);
    for (const vector of vectors) {
      expect(vector.model).toBe('factice-1024');
      expect(vector.acl).toEqual([alice.tenantId]);
    }
  });

  // Une part d'accès retirée pendant l'appel au fournisseur (T16) change l'accès du passage : le vecteur porte
  // l'accès du passage au moment de l'écriture, pas celui qu'on lisait avant l'appel.
  it('écrit chaque vecteur à l’accès que le passage a au moment de l’écriture', async () => {
    const token = `jeton-${randomUUID()}`;
    const seeded = await seedPassages(alice, { count: 2, token, acl: [alice.userId, bob.userId] });
    const factice = createFakeEmbedder();
    const embedder: Embedder = {
      model: 'factice-1024',
      async embed(texts, kind) {
        if (!texts.every((text) => text.includes(token))) {
          throw new EmbedderError('texte refusé');
        }
        // Bob perd son accès à la source pendant que le fournisseur travaille.
        for (const table of ['sources', 'turns', 'passages']) {
          const column = table === 'sources' ? 'id' : 'source_id';
          await adminPool.query(`update ${table} set acl = $2 where ${column} = $1`, [
            seeded.sourceId,
            [alice.userId],
          ]);
        }
        return factice.embed(texts, kind);
      },
    };

    const done = await embedMissing({ embedder }, BIG);

    expect(done).toBe(2);
    const vectors = await vectorsOf(alice, seeded.passageIds);
    expect(vectors).toHaveLength(2);
    for (const vector of vectors) expect(vector.acl).toEqual([alice.userId]);
    expect(await vectorsOf(bob, seeded.passageIds)).toHaveLength(0);
  });

  // Le retrait d'une part (T16) met d'abord à jour la source : il attend la fin de l'écriture en cours, puis
  // propage son accès aux vecteurs qu'elle vient d'écrire.
  it('attend la fin d’un retrait d’accès en cours avant d’écrire ses vecteurs', async () => {
    const token = `jeton-${randomUUID()}`;
    const seeded = await seedPassages(alice, { count: 1, token, acl: [alice.userId, bob.userId] });
    const revoke = await adminPool.connect();
    try {
      await revoke.query('begin');
      await revoke.query('update sources set acl = $2 where id = $1', [
        seeded.sourceId,
        [alice.userId],
      ]);
      let finished = false;
      const running = embedMissing({ embedder: embedderFor(token) }, BIG).then((count) => {
        finished = true;
        return count;
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(finished).toBe(false);

      await revoke.query('update turns set acl = $2 where source_id = $1', [
        seeded.sourceId,
        [alice.userId],
      ]);
      await revoke.query('update passages set acl = $2 where source_id = $1', [
        seeded.sourceId,
        [alice.userId],
      ]);
      await revoke.query('commit');

      expect(await running).toBe(1);
    } finally {
      // Après un échec d'assertion, la transaction ouverte garderait ses verrous et ferait échouer les autres tests.
      await revoke.query('rollback');
      revoke.release();
    }
    const vectors = await vectorsOf(alice, seeded.passageIds);
    expect(vectors.map((vector) => vector.acl)).toEqual([[alice.userId]]);
    expect(await vectorsOf(bob, seeded.passageIds)).toHaveLength(0);
  });

  describe('quand le fournisseur ne répond jamais', () => {
    afterEach(() => vi.useRealTimers());

    // Un appel qui pend retiendrait l'unique emplacement du tic jusqu'à l'abandon de la connexion (5 minutes) :
    // plus aucune reprise, et rien dans les journaux pour le dire.
    it('rend la main au bout du délai, sans vecteur, et n’interroge pas les autres organisations', async () => {
      const token = `jeton-${randomUUID()}`;
      const mine = await seedPassages(alice, { count: 2, token });
      const theirs = await seedPassages(zoe, { count: 1, token });
      const hung = { model: 'factice-1024', embed: vi.fn(() => new Promise<number[][]>(() => {})) };
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const running = embedMissing({ embedder: hung }, BIG);
      await vi.waitFor(() => expect(hung.embed).toHaveBeenCalled(), { timeout: 5000 });
      await vi.advanceTimersByTimeAsync(EMBED_TIMEOUT_MS);

      await expect(running).resolves.toBe(0);
      // Un seul appel : le fournisseur ne répond pour personne, les autres organisations attendront le tic suivant.
      expect(hung.embed).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
      expect(await vectorsOf(alice, mine.passageIds)).toHaveLength(0);
      expect(await vectorsOf(zoe, theirs.passageIds)).toHaveLength(0);
      const logged = log.mock.calls.flat().map(String).join('\n');
      expect(logged).toContain('EmbedderError');
      expect(logged).not.toContain(token);
    });
  });

  it('laisse sans vecteur les passages dont le propriétaire n’est plus membre, sans échouer', async () => {
    const token = `jeton-${randomUUID()}`;
    const team = await createTestTenant(['Départ']);
    tenantIds.push(team.tenantId);
    const [leaver] = team.members as [TenantContext];
    const orphan = await seedPassages(leaver, { count: 2, token });
    await adminPool.query('delete from member where "userId" = $1', [leaver.userId]);
    const kept = await seedPassages(alice, { count: 1, token });

    const done = await embedMissing({ embedder: embedderFor(token) }, BIG);

    expect(done).toBe(1);
    expect(await vectorsOf(alice, kept.passageIds)).toHaveLength(1);
    const { rows } = await adminPool.query<{ n: number }>(
      'select count(*)::int as n from passage_vectors where passage_id = any($1)',
      [orphan.passageIds],
    );
    expect(rows[0]?.n).toBe(0);
  });
});

describe('requeueStaleRuns', () => {
  // Les runs mis en file, tels que le tic les a nommés (un seul appel par run).
  const requeued = () =>
    vi.mocked(enqueuePipelineStep).mock.calls.map(([, job]) => job.ingestRunId);
  const idOf = (run: { job: { ingestRunId: string } }) => run.job.ingestRunId;

  it('remet en file un run en attente depuis 6 minutes, avec le contexte de son propriétaire, et pas un run de 2 minutes', async () => {
    const stale = await seedRun(alice, { updatedAt: new Date(Date.now() - 6 * MINUTE) });
    const recent = await seedRun(alice, { updatedAt: new Date(Date.now() - 2 * MINUTE) });

    const done = await requeueStaleRuns(5);

    expect(done).toBeGreaterThanOrEqual(1);
    expect(enqueuePipelineStep).toHaveBeenCalledWith('index', stale.job, expect.anything());
    expect(requeued()).not.toContain(idOf(recent));
    const { rows } = await adminPool.query<{ id: string; fresh: boolean }>(
      `select id, updated_at > now() - interval '1 minute' as fresh from ingest_runs where id = any($1)`,
      [[stale.job.ingestRunId, recent.job.ingestRunId]],
    );
    const fresh = new Map(rows.map((row) => [row.id, row.fresh]));
    expect(fresh.get(stale.job.ingestRunId)).toBe(true);
    expect(fresh.get(recent.job.ingestRunId)).toBe(false);
  });

  it('reprend les runs de deux organisations', async () => {
    const mine = await seedRun(bob, { updatedAt: new Date(Date.now() - 10 * MINUTE) });
    const theirs = await seedRun(zoe, { updatedAt: new Date(Date.now() - 7 * MINUTE) });

    await requeueStaleRuns(5);

    expect(requeued()).toEqual(expect.arrayContaining([idOf(mine), idOf(theirs)]));
  });

  it('ne reprend ni les runs terminés, ni ceux en cours ou échoués depuis 20 minutes', async () => {
    const old = new Date(Date.now() - 20 * MINUTE);
    const running = await seedRun(alice, { status: 'running', updatedAt: old });
    const done = await seedRun(alice, { status: 'done', updatedAt: old });
    const failed = await seedRun(alice, { status: 'failed', updatedAt: old });

    await requeueStaleRuns(5);

    for (const run of [running, done, failed]) expect(requeued()).not.toContain(idOf(run));
  });

  // Audit n° 5 : un run « en cours » dont le processus est mort, ou « échoué » après les 3 reprises de pg-boss,
  // n'était jamais repris.
  it('reprend un run en cours ou échoué inchangé depuis plus de 30 minutes, pas un run terminé', async () => {
    const old = new Date(Date.now() - 31 * MINUTE);
    const running = await seedRun(alice, { status: 'running', updatedAt: old });
    const failed = await seedRun(alice, { status: 'failed', updatedAt: old });
    const done = await seedRun(alice, { status: 'done', updatedAt: old });

    await requeueStaleRuns(5);

    expect(requeued()).toEqual(expect.arrayContaining([idOf(running), idOf(failed)]));
    expect(requeued()).not.toContain(idOf(done));
  });

  it('ne remet pas deux fois de suite le même run en file', async () => {
    const stale = await seedRun(alice, { updatedAt: new Date(Date.now() - 9 * MINUTE) });
    await requeueStaleRuns(5);
    vi.mocked(enqueuePipelineStep).mockClear();

    await requeueStaleRuns(5);

    expect(requeued()).not.toContain(idOf(stale));
  });

  // La migration 0010 a remis tout l'historique en attente : ces reprises ne doivent pas passer devant un
  // élément fraîchement capté (priorité de l'ingestion, plus haute).
  it('met les reprises en file avec une priorité plus basse que celle d’une ingestion neuve', async () => {
    const stale = await seedRun(alice, { updatedAt: new Date(Date.now() - 6 * MINUTE) });

    await requeueStaleRuns(5);

    expect(INDEX_PRIORITY.reprise).toBeLessThan(INDEX_PRIORITY.ingestion);
    expect(enqueuePipelineStep).toHaveBeenCalledWith('index', stale.job, {
      priority: INDEX_PRIORITY.reprise,
    });
    for (const call of vi.mocked(enqueuePipelineStep).mock.calls) {
      expect(call[2]).toEqual({ priority: INDEX_PRIORITY.reprise });
    }
  });

  it('borne le nombre de runs repris à chaque passage', async () => {
    const old = new Date(Date.now() - 3 * 24 * 60 * MINUTE);
    const first = await seedRun(alice, { updatedAt: old });
    await adminPool.query(
      `insert into ingest_runs (tenant_id, source_id, turn_ids, acl, created_at, updated_at)
       select $1, $2, $3, $4, $5, $5 from generate_series(1, $6::int)`,
      [alice.tenantId, first.sourceId, first.turnIds, [alice.userId], old, REQUEUE_BATCH + 5],
    );

    const done = await requeueStaleRuns(5);

    expect(done).toBe(REQUEUE_BATCH);
    expect(vi.mocked(enqueuePipelineStep)).toHaveBeenCalledTimes(REQUEUE_BATCH);
  });

  it('ne compte pas un run dont la mise en file échoue et continue avec les autres', async () => {
    const first = await seedRun(alice, { updatedAt: new Date(Date.now() - 4000 * MINUTE) });
    const second = await seedRun(zoe, { updatedAt: new Date(Date.now() - 4000 * MINUTE) });
    vi.mocked(enqueuePipelineStep).mockImplementation(async (_step, job) => {
      if (job.ingestRunId === first.job.ingestRunId) throw new Error('pg-boss indisponible');
    });

    const done = await requeueStaleRuns(5);

    expect(done).toBeGreaterThanOrEqual(1);
    expect(requeued()).toContain(idOf(second));
  });
});

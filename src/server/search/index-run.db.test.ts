import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestPayload, Turn } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, turns } from '@/server/db/schema/memory';
import { passages, passageVectors } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { EMBEDDING_DIMS, type Embedder, EmbedderError } from '@/server/embeddings/embedder';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { ingestTurns } from '@/server/ingest/ingest-turns';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedRun } from '@/test/seed-search';
import { chunkText } from './chunk';
import { EMBED_TIMEOUT_MS } from './embed-missing';
import { indexIngestRun } from './index-run';

// L'ingestion met en file un job d'indexation ; ici on appelle indexIngestRun à la main.
vi.mock('@/server/pipeline/queue');

const tenantIds: string[] = [];
let alice: TenantContext;
let bob: TenantContext;
let teamTenant: string;

beforeAll(async () => {
  const team = await createTestTenant(['Alice', 'Bob']);
  [alice, bob] = team.members as [TenantContext, TenantContext];
  teamTenant = team.tenantId;
  tenantIds.push(team.tenantId);
});

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

// Les passages de ces tests ne doivent pas rester dans la file des vecteurs manquants des autres fichiers.
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

const factice = createFakeEmbedder();

const readPassages = (ctx: TenantContext, sourceId: string) =>
  withTenant(ctx, (tx) =>
    tx
      .select()
      .from(passages)
      .where(eq(passages.sourceId, sourceId))
      .orderBy(asc(passages.turnId), asc(passages.ord)),
  );

const readVectors = (ctx: TenantContext, passageIds: string[]) =>
  withTenant(ctx, (tx) =>
    tx.select().from(passageVectors).where(inArray(passageVectors.passageId, passageIds)),
  );

const readRun = async (ctx: TenantContext, runId: string) => {
  const [run] = await withTenant(ctx, (tx) =>
    tx.select().from(ingestRuns).where(eq(ingestRuns.id, runId)),
  );
  return run;
};

const newTurn = (n: number): Turn => ({
  external_id: `msg-${n}`,
  role: n % 2 === 1 ? 'user' : 'assistant',
  text: `Tour numéro ${n} : le contrat OVH est renouvelé.`,
  ts: `2026-10-13T09:0${n}:00+02:00`,
  capture_mode: 'network',
});

async function ingestConversation(owner: TenantContext, count: number) {
  const payload: IngestPayload = {
    source: { kind: 'chatgpt', external_id: `conv-${randomUUID()}` },
    turns: Array.from({ length: count }, (_, index) => newTurn(index + 1)),
  };
  const result = await ingestTurns(owner, payload);
  if (result.ingestRunId === null) throw new Error('aucun run créé');
  return {
    sourceId: result.sourceId,
    job: { ingestRunId: result.ingestRunId, tenantId: owner.tenantId, userId: owner.userId },
  };
}

// Un tour de 8 000 caractères de texte courant.
function bigTurn(n: number): string {
  const sentence = `Le compte rendu ${n} dit que le contrat OVH est renouvelé pour un an. `;
  return sentence.repeat(Math.ceil(8000 / sentence.length)).slice(0, 8000);
}

describe('indexIngestRun', () => {
  it('découpe les tours d’une conversation en passages privés à son auteur et termine le run', async () => {
    const { sourceId, job } = await ingestConversation(alice, 3);

    const result = await indexIngestRun(job, { embedder: null });

    expect(result).toBe('indexe');
    const rows = await readPassages(alice, sourceId);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.acl).toEqual([alice.userId]);
    const stored = await withTenant(alice, (tx) =>
      tx.select().from(turns).where(eq(turns.sourceId, sourceId)),
    );
    const byTurn = new Map(stored.map((turn) => [turn.id, turn]));
    for (const row of rows) {
      const turn = byTurn.get(row.turnId);
      expect(row.ts).toEqual(turn?.ts);
      expect(row.text).toBe(turn?.text);
      expect(row.ord).toBe(0);
      expect(row.sourceId).toBe(sourceId);
    }
    expect(await readRun(alice, job.ingestRunId)).toMatchObject({ status: 'done', step: 'done' });
    // Bob ne voit rien : la conversation est à Alice.
    expect(await readPassages(bob, sourceId)).toHaveLength(0);
  });

  it('reporte l’auteur, la date et les positions du tour sur chaque passage', async () => {
    const ts = new Date('2026-09-30T08:15:00Z');
    const text = `${'Phrase du compte rendu. '.repeat(120)}Fin.`;
    const { job, sourceId, turnIds } = await seedRun(alice, {
      kind: 'fathom',
      turns: [{ text, ts, authorName: 'Julie Martin', authorEmail: 'julie@exemple.fr' }],
    });

    await indexIngestRun(job, { embedder: null });

    const rows = await readPassages(alice, sourceId);
    const expected = chunkText(text);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((row) => row.ord)).toEqual(expected.map((chunk) => chunk.ord));
    expect(rows.map((row) => [row.charStart, row.charEnd])).toEqual(
      expected.map((chunk) => [chunk.start, chunk.end]),
    );
    expect(rows.map((row) => row.text)).toEqual(expected.map((chunk) => chunk.text));
    for (const row of rows) {
      expect(row).toMatchObject({
        turnId: turnIds[0],
        ts,
        authorName: 'Julie Martin',
        authorEmail: 'julie@exemple.fr',
      });
    }
  });

  it('donne aux passages d’une source d’équipe l’accès de l’équipe', async () => {
    const { job, sourceId } = await seedRun(alice, {
      kind: 'github',
      acl: [teamTenant],
      turns: [{ text: 'Ticket 12 : renouveler le contrat.' }],
    });

    await indexIngestRun(job, { embedder: factice });

    const rows = await readPassages(bob, sourceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.acl).toEqual([teamTenant]);
    const vectors = await readVectors(
      bob,
      rows.map((row) => row.id),
    );
    expect(vectors).toHaveLength(1);
    expect(vectors[0]?.acl).toEqual([teamTenant]);
  });

  it('ne rend « indexe » qu’une fois : le deuxième appel sur le même run ne crée aucun passage', async () => {
    const { sourceId, job } = await ingestConversation(alice, 3);
    await indexIngestRun(job, { embedder: factice });
    const first = await readPassages(alice, sourceId);

    const second = await indexIngestRun(job, { embedder: factice });

    expect(second).toBe('absent');
    expect(await readPassages(alice, sourceId)).toHaveLength(first.length);
    expect(
      await readVectors(
        alice,
        first.map((row) => row.id),
      ),
    ).toHaveLength(first.length);
  });

  it('rend « absent » pour un run qui n’existe pas ou qui n’est pas visible de son propriétaire', async () => {
    const { job } = await ingestConversation(alice, 1);

    const unknown = await indexIngestRun({ ...job, ingestRunId: randomUUID() }, { embedder: null });
    // Un job qui nomme le run d'Alice sous l'identité de Bob : la sécurité par ligne ne le lui montre pas.
    const foreign = await indexIngestRun({ ...job, userId: bob.userId }, { embedder: null });

    expect(unknown).toBe('absent');
    expect(foreign).toBe('absent');
    expect(await readRun(alice, job.ingestRunId)).toMatchObject({ status: 'queued' });
  });

  it('ne crée aucun vecteur sans fournisseur', async () => {
    const { sourceId, job } = await ingestConversation(alice, 3);

    await indexIngestRun(job, { embedder: null });

    const rows = await readPassages(alice, sourceId);
    expect(
      await readVectors(
        alice,
        rows.map((row) => row.id),
      ),
    ).toHaveLength(0);
  });

  it('crée, avec le fournisseur factice, un vecteur par passage au nom du modèle et à l’accès du passage', async () => {
    const { sourceId, job } = await ingestConversation(alice, 3);

    await indexIngestRun(job, { embedder: factice });

    const rows = await readPassages(alice, sourceId);
    const vectors = await readVectors(
      alice,
      rows.map((row) => row.id),
    );
    expect(vectors).toHaveLength(rows.length);
    for (const vector of vectors) {
      expect(vector.model).toBe('factice-1024');
      expect(vector.acl).toEqual([alice.userId]);
      expect(vector.embedding).toHaveLength(EMBEDDING_DIMS);
    }
    expect(vectors.map((vector) => vector.passageId).sort()).toEqual(
      rows.map((row) => row.id).sort(),
    );
  });

  it('demande les vecteurs au fournisseur comme des documents, 64 textes au plus par appel', async () => {
    const calls: Array<{ size: number; kind: string }> = [];
    const recording: Embedder = {
      model: 'factice-1024',
      embed(texts, kind) {
        calls.push({ size: texts.length, kind });
        return factice.embed(texts, kind);
      },
    };
    const longTurn = (n: number) => ({ text: `${`Mot${n} du contrat. `.repeat(600)}Fin.` });
    const { sourceId, job } = await seedRun(alice, {
      turns: Array.from({ length: 20 }, (_, n) => longTurn(n)),
    });

    await indexIngestRun(job, { embedder: recording });

    const rows = await readPassages(alice, sourceId);
    expect(rows.length).toBeGreaterThan(64);
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect(call.kind).toBe('document');
      expect(call.size).toBeLessThanOrEqual(64);
    }
    expect(calls.reduce((sum, call) => sum + call.size, 0)).toBe(rows.length);
  });

  // Un fil de 5 000 messages ne se charge pas d'un bloc : les tours sont lus et écrits par tranches.
  it('écrit les passages par tranches de tours : au premier appel du fournisseur, les derniers tours ne sont pas encore écrits', async () => {
    const run = await seedRun(alice, {
      turns: Array.from({ length: 150 }, (_, n) => ({ text: `Tour ${n} du contrat.` })),
    });
    const written: number[] = [];
    const observing: Embedder = {
      model: 'factice-1024',
      async embed(texts, kind) {
        const { rows } = await adminPool.query<{ n: number }>(
          'select count(*)::int as n from passages where source_id = $1',
          [run.sourceId],
        );
        written.push(rows[0]?.n ?? 0);
        return factice.embed(texts, kind);
      },
    };

    await indexIngestRun(run.job, { embedder: observing });

    expect(written[0]).toBeLessThan(150);
    expect(written.at(-1)).toBe(150);
    expect(await readPassages(alice, run.sourceId)).toHaveLength(150);
  });

  describe('quand le fournisseur de vecteurs est en panne', () => {
    const SECRET = 'Le mot de passe de la banque est violet-éléphant-7731';

    async function indexWith(embedder: Embedder) {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const run = await seedRun(alice, { turns: [{ text: SECRET }, { text: `${SECRET} bis` }] });
        const result = await indexIngestRun(run.job, { embedder });
        return { run, result, logged: log.mock.calls.flat().map(String).join('\n') };
      } finally {
        log.mockRestore();
      }
    }

    it('garde les passages, ne crée aucun vecteur, termine le run et ne journalise aucun texte', async () => {
      const failing: Embedder = {
        model: 'factice-1024',
        async embed() {
          throw new EmbedderError('fournisseur indisponible (429)');
        },
      };

      const { run, result, logged } = await indexWith(failing);

      expect(result).toBe('indexe');
      const rows = await readPassages(alice, run.sourceId);
      expect(rows).toHaveLength(2);
      expect(
        await readVectors(
          alice,
          rows.map((row) => row.id),
        ),
      ).toHaveLength(0);
      expect(await readRun(alice, run.job.ingestRunId)).toMatchObject({ status: 'done' });
      expect(logged).not.toContain('violet');
      expect(logged).not.toContain('banque');
      expect(logged).toContain('EmbedderError');
    });

    it('ne journalise pas le message d’une erreur inattendue du fournisseur', async () => {
      const failing: Embedder = {
        model: 'factice-1024',
        async embed(texts) {
          throw new TypeError(`réponse illisible pour ${texts[0]}`);
        },
      };

      const { run, result, logged } = await indexWith(failing);

      expect(result).toBe('indexe');
      expect(await readPassages(alice, run.sourceId)).toHaveLength(2);
      expect(logged).not.toContain('violet');
      expect(logged).not.toContain('illisible');
    });

    it('n’interroge plus le fournisseur du run une fois qu’il a échoué', async () => {
      let calls = 0;
      const failing: Embedder = {
        model: 'factice-1024',
        async embed() {
          calls += 1;
          throw new EmbedderError('fournisseur indisponible (500)');
        },
      };
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const run = await seedRun(alice, {
        turns: Array.from({ length: 150 }, (_, n) => ({ text: `Tour ${n} du contrat.` })),
      });

      await indexIngestRun(run.job, { embedder: failing });
      log.mockRestore();

      expect(calls).toBe(1);
      expect(await readPassages(alice, run.sourceId)).toHaveLength(150);
    });

    it('ignore des vecteurs de la mauvaise dimension ou en nombre inattendu, sans échouer', async () => {
      const wrongDims: Embedder = {
        model: 'factice-1024',
        async embed(texts) {
          return texts.map(() => [1, 0, 0]);
        },
      };
      const wrongCount: Embedder = {
        model: 'factice-1024',
        async embed() {
          return [];
        },
      };

      const dims = await indexWith(wrongDims);
      const count = await indexWith(wrongCount);

      for (const { run, result } of [dims, count]) {
        expect(result).toBe('indexe');
        const rows = await readPassages(alice, run.sourceId);
        expect(rows).toHaveLength(2);
        expect(
          await readVectors(
            alice,
            rows.map((row) => row.id),
          ),
        ).toHaveLength(0);
        expect(await readRun(alice, run.job.ingestRunId)).toMatchObject({ status: 'done' });
      }
    });
  });

  describe('quand le fournisseur ne répond jamais', () => {
    afterEach(() => vi.useRealTimers());

    // Quatre runs bloqués sur un fournisseur muet occuperaient les quatre emplacements de la file : plus aucun run
    // ne serait indexé, et le plein texte s'arrêterait avec les vecteurs.
    it('rend « indexe » au bout du délai, avec les passages écrits et sans vecteur', async () => {
      const SECRET = 'Le mot de passe de la banque est violet-éléphant-7731';
      const hung = { model: 'factice-1024', embed: vi.fn(() => new Promise<number[][]>(() => {})) };
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const run = await seedRun(alice, { turns: [{ text: SECRET }, { text: `${SECRET} bis` }] });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const running = indexIngestRun(run.job, { embedder: hung });
      await vi.waitFor(() => expect(hung.embed).toHaveBeenCalled(), { timeout: 5000 });
      await vi.advanceTimersByTimeAsync(EMBED_TIMEOUT_MS);

      await expect(running).resolves.toBe('indexe');
      vi.useRealTimers();
      const logged = log.mock.calls.flat().map(String).join('\n');
      log.mockRestore();
      expect(hung.embed).toHaveBeenCalledTimes(1);
      const rows = await readPassages(alice, run.sourceId);
      expect(rows).toHaveLength(2);
      expect(
        await readVectors(
          alice,
          rows.map((row) => row.id),
        ),
      ).toHaveLength(0);
      expect(await readRun(alice, run.job.ingestRunId)).toMatchObject({ status: 'done' });
      expect(logged).toContain('EmbedderError');
      expect(logged).not.toContain('violet');
    });
  });

  // Un retrait d'accès (T16) met d'abord à jour la source, puis propage son accès aux tours, passages et vecteurs
  // existants : il ne voit pas ceux qu'une écriture encore ouverte est en train d'ajouter. L'indexeur attend donc
  // la fin du retrait, pour lire l'accès des tours une fois à jour (sinon Bob garderait, dans la recherche, le
  // texte d'un fichier auquel il n'a plus droit).
  describe('quand un retrait d’accès est en cours sur la source', () => {
    it('écrit les passages et les vecteurs à l’accès d’après le retrait', async () => {
      const run = await seedRun(alice, {
        acl: [alice.userId, bob.userId],
        turns: [{ text: 'Le contrat partagé entre Alice et Bob.' }],
      });
      const revoke = await adminPool.connect();
      try {
        await revoke.query('begin');
        await revoke.query('update sources set acl = $2 where id = $1', [
          run.sourceId,
          [alice.userId],
        ]);
        let finished = false;
        const running = indexIngestRun(run.job, { embedder: factice }).then((result) => {
          finished = true;
          return result;
        });
        await new Promise((resolve) => setTimeout(resolve, 600));
        expect(finished).toBe(false);

        await revoke.query('update turns set acl = $2 where source_id = $1', [
          run.sourceId,
          [alice.userId],
        ]);
        await revoke.query('commit');

        expect(await running).toBe('indexe');
      } finally {
        // Après un échec d'assertion, la transaction ouverte garderait ses verrous et ferait échouer les autres tests.
        await revoke.query('rollback');
        revoke.release();
      }
      const rows = await readPassages(alice, run.sourceId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.acl).toEqual([alice.userId]);
      const vectors = await readVectors(
        alice,
        rows.map((row) => row.id),
      );
      expect(vectors.map((vector) => vector.acl)).toEqual([[alice.userId]]);
      // Bob n'a plus rien de ce fichier dans l'index.
      expect(await readPassages(bob, run.sourceId)).toHaveLength(0);
    });
  });

  describe('reprise après une interruption', () => {
    it.each(['failed', 'running'] as const)(
      'indexe un run resté « %s » sans doubler les passages déjà écrits',
      async (status) => {
        const run = await seedRun(alice, {
          status,
          turns: [{ text: 'Premier tour du contrat.' }, { text: 'Deuxième tour du contrat.' }],
        });
        // Une tentative précédente a déjà écrit le passage du premier tour, sans vecteur.
        await adminPool.query(
          `insert into passages (tenant_id, source_id, turn_id, ord, text, char_start, char_end, ts, acl)
           values ($1, $2, $3, 0, 'Premier tour du contrat.', 0, 24, now(), $4)`,
          [alice.tenantId, run.sourceId, run.turnIds[0], [alice.userId]],
        );

        const result = await indexIngestRun(run.job, { embedder: factice });

        expect(result).toBe('indexe');
        const rows = await readPassages(alice, run.sourceId);
        expect(rows).toHaveLength(2);
        // Le vecteur du passage déjà écrit est complété lui aussi.
        expect(
          await readVectors(
            alice,
            rows.map((row) => row.id),
          ),
        ).toHaveLength(2);
        expect(await readRun(alice, run.job.ingestRunId)).toMatchObject({ status: 'done' });
      },
    );
  });

  describe('les tours qui ne donnent rien à chercher', () => {
    it('termine le run d’un tour fait d’espaces ou de marqueurs, sans passage', async () => {
      const run = await seedRun(alice, {
        turns: [{ text: '   \n\t ' }, { text: '' }, { text: 'Un vrai tour.' }],
      });

      const result = await indexIngestRun(run.job, { embedder: factice });

      expect(result).toBe('indexe');
      const rows = await readPassages(alice, run.sourceId);
      expect(rows.map((row) => row.text)).toEqual(['Un vrai tour.']);
      expect(await readRun(alice, run.job.ingestRunId)).toMatchObject({ status: 'done' });
    });

    it('termine un run dont aucun tour n’est cherchable', async () => {
      const run = await seedRun(alice, { turns: [{ text: '   ' }] });

      await indexIngestRun(run.job, { embedder: null });

      expect(await readPassages(alice, run.sourceId)).toHaveLength(0);
      expect(await readRun(alice, run.job.ingestRunId)).toMatchObject({ status: 'done' });
    });

    it('retire les marqueurs de surlignage du texte des passages', async () => {
      const run = await seedRun(alice, { turns: [{ text: 'le contrat OVH' }] });

      await indexIngestRun(run.job, { embedder: null });

      const rows = await readPassages(alice, run.sourceId);
      expect(rows.map((row) => row.text)).toEqual(['le contrat OVH']);
    });
  });

  // Vigilance 2 : un document énorme se découpe sans saturer la mémoire ni bloquer la file.
  it('indexe en moins de 10 s une source de 2 Mo de texte (250 tours de 8 000), en un nombre borné de passages', async () => {
    const run = await seedRun(alice, {
      kind: 'fathom',
      turns: Array.from({ length: 250 }, (_, n) => ({ text: bigTurn(n) })),
    });

    const started = performance.now();
    const result = await indexIngestRun(run.job, { embedder: null });
    const seconds = (performance.now() - started) / 1000;

    expect(result).toBe('indexe');
    expect(seconds).toBeLessThan(10);
    const rows = await readPassages(alice, run.sourceId);
    expect(rows.length).toBeGreaterThanOrEqual(1250);
    expect(rows.length).toBeLessThanOrEqual(2000);
    expect(await readRun(alice, run.job.ingestRunId)).toMatchObject({ status: 'done' });
  }, 30_000);

  it('indexe aussi ses vecteurs en moins de 10 s, un par passage', async () => {
    const run = await seedRun(alice, {
      kind: 'fathom',
      turns: Array.from({ length: 250 }, (_, n) => ({ text: bigTurn(n) })),
    });

    const started = performance.now();
    await indexIngestRun(run.job, { embedder: factice });
    const seconds = (performance.now() - started) / 1000;

    const rows = await readPassages(alice, run.sourceId);
    expect(seconds).toBeLessThan(10);
    expect(
      await readVectors(
        alice,
        rows.map((row) => row.id),
      ),
    ).toHaveLength(rows.length);
  }, 30_000);
});

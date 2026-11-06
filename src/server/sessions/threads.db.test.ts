import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionFacts } from '@/capture/session-facts';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { sources, versionsMemoire } from '@/server/db/schema/memory';
import { passages } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { type Embedder, EmbedderError } from '@/server/embeddings/embedder';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { createIngestRun, insertNewTurns } from '@/server/ingest/ingest-turns';
import { recordFacts } from '@/server/ingest/record-facts';
import { listVersions, writeVersion } from '@/server/memory/versions';
import { embedMissingBatch } from '@/server/search/embed-missing';
import { indexIngestRun } from '@/server/search/index-run';
import { adminDb, adminPool } from '@/test/db';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import type { ThreadJob } from './threads-queue';

// Le rangement des sessions en fils (T40 et T41 ; D21, D22 et D34 du plan de la mémoire à disposition), sur la base de
// test. Les files sont simulées (threads-queue.db.test.ts vérifie les vraies) : les fils mis en file `fil-maj` et les
// sessions remises à ranger sont notés. Les vecteurs viennent du fournisseur factice.

const mocks = vi.hoisted(() => ({
  enqueueFilMaj: vi.fn(),
  enqueueRangement: vi.fn(),
  enqueueLiaison: vi.fn(),
  work: vi.fn(),
}));
vi.mock('./threads-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./threads-queue')>()),
  enqueueFilMaj: mocks.enqueueFilMaj,
  enqueueRangement: mocks.enqueueRangement,
  enqueueLiaison: mocks.enqueueLiaison,
  getThreadsBoss: async () => ({ work: mocks.work }),
}));

const { fileSession, startThreadsWorker } = await import('./threads');

const PROJECT = 'github.com/acme/leon';
const tenantIds: string[] = [];

beforeEach(() => {
  mocks.enqueueFilMaj.mockReset();
  mocks.enqueueFilMaj.mockResolvedValue(undefined);
  mocks.enqueueRangement.mockReset();
  mocks.enqueueRangement.mockResolvedValue(undefined);
  mocks.enqueueLiaison.mockReset();
  mocks.enqueueLiaison.mockResolvedValue(undefined);
});
afterAll(() => dropTeams(tenantIds));

async function team(): Promise<{ paul: TenantContext; marie: TenantContext }> {
  const { members: list } = await newTeam(['Paul', 'Marie'], tenantIds);
  const [paul, marie] = list as [TenantContext, TenantContext];
  return { paul, marie };
}

const facts = (extra: Partial<SessionFacts> = {}): SessionFacts => ({
  branche: 'paul/fils',
  prs: [],
  commits: [],
  fichiers: ['src/server/sessions/threads.ts'],
  commandes: [],
  taches: [],
  erreurs: 0,
  externe: false,
  echanges: 3,
  debut: '2026-11-06T09:00:00.000Z',
  fin: '2026-11-06T10:00:00.000Z',
  ...extra,
});

// Une session de code, rangée comme par la route des faits.
async function session(
  owner: TenantContext,
  extra: Partial<SessionFacts> = {},
  externalId = `session-${randomUUID()}`,
): Promise<string> {
  const { sourceId } = await recordFacts(owner, {
    kind: 'claude_code',
    external_id: externalId,
    project: PROJECT,
    accord: 2,
    faits: facts(extra),
    fin: true,
  });
  return sourceId;
}

const jobOf = (owner: TenantContext, sourceId: string): ThreadJob => ({
  tenantId: owner.tenantId,
  sourceId,
  ownerUserId: owner.userId,
});
const factice = createFakeEmbedder();
const file = (owner: TenantContext, sourceId: string, embedder: Embedder | null = factice) =>
  fileSession(jobOf(owner, sourceId), { embedder });

// Le résumé de la session, comme l'écrit le worker du résumé pour un outil qui a l'usage `resume` (un tour
// `leon:resume:1`, que nomme `metadata.resume`, et son run), puis indexé avec ce fournisseur de vecteurs, comme par le
// worker de la recherche.
async function summarize(
  owner: TenantContext,
  sourceId: string,
  text: string,
  embedder: Embedder | null = factice,
): Promise<void> {
  const ingestRunId = await withTenant(owner, async (tx) => {
    await tx
      .update(sources)
      .set({
        metadata: sql`${sources.metadata} || '{"resume": {"tour": 1}, "usages": ["resume"]}'::jsonb`,
      })
      .where(eq(sources.id, sourceId));
    const { ids } = await insertNewTurns(tx, [
      {
        tenantId: owner.tenantId,
        sourceId,
        externalId: 'leon:resume:1',
        role: 'document',
        text,
        ts: new Date(),
        captureMode: 'manual',
        acl: [owner.userId],
      },
    ]);
    return createIngestRun(tx, owner, sourceId, ids, [owner.userId]);
  });
  const job = { ingestRunId, tenantId: owner.tenantId, userId: owner.userId };
  expect(await indexIngestRun(job, { embedder })).toBe('indexe');
}

const NEAR = 'Rangement des fils de travail par la proximité des résumés de session';
// Le temps qu'une transaction lancée atteigne le verrou que le test retient, comme dans delete-account.db.test.ts.
const pause = () => new Promise((resolve) => setTimeout(resolve, 300));

type Fil = { id: string; externalId: string; acl: string[]; metadata: Record<string, unknown> };

// Les fils de ce membre, lus hors RLS, du plus ancien au plus récent.
async function filsOf(owner: TenantContext): Promise<Fil[]> {
  const rows = await adminDb
    .select({
      id: sources.id,
      externalId: sources.externalId,
      acl: sources.acl,
      metadata: sources.metadata,
      createdAt: sources.createdAt,
    })
    .from(sources)
    .where(
      and(
        eq(sources.tenantId, owner.tenantId),
        eq(sources.ownerUserId, owner.userId),
        eq(sources.kind, 'leon_fil'),
      ),
    );
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map(({ createdAt: _, ...fil }) => fil);
}
const kept = async (owner: TenantContext) =>
  (await filsOf(owner)).filter((fil) => fil.metadata.absorbe_par === undefined);
const sessionIds = (fil: Fil | undefined) =>
  (fil?.metadata.sessions as Array<{ id: string }> | undefined)?.map((entry) => entry.id).sort();

describe('fileSession', () => {
  it('même branche, même fil, privé à son auteur, sans la branche dans son identifiant', async () => {
    const { paul } = await team();
    const first = await session(paul);
    const second = await session(paul);

    expect(await file(paul, first)).toBe('range');
    expect(await file(paul, second)).toBe('range');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    const [fil] = fils;
    expect(fil?.acl).toEqual([paul.userId]);
    expect(fil?.externalId).toMatch(/^leon:fil:github\.com\/acme\/leon:[0-9a-f]{32}$/);
    expect(fil?.externalId).not.toContain('paul/fils');
    expect(fil?.metadata).toMatchObject({
      project: PROJECT,
      branches: ['paul/fils'],
      prs: [],
      fichiers: ['src/server/sessions/threads.ts'],
      absorbes: [],
      liees: [],
      tickets: [],
      mots_cles: [],
    });
    expect(sessionIds(fil)).toEqual([first, second].sort());
    expect(fil?.metadata.sessions).toContainEqual({
      id: first,
      kind: 'claude_code',
      date: expect.any(String),
    });
    expect(typeof fil?.metadata.maj_le).toBe('string');
    // Chaque changement met le fil en file `fil-maj` (T43), jamais la session, et le met à relier à ses sources (T42).
    expect(mocks.enqueueFilMaj.mock.calls).toEqual([
      [jobOf(paul, fil?.id ?? '')],
      [jobOf(paul, fil?.id ?? '')],
    ]);
    expect(mocks.enqueueLiaison.mock.calls).toEqual(mocks.enqueueFilMaj.mock.calls);
  });

  it('sur main ou master, sans PR : hors fil, aucun fil ouvert', async () => {
    const { paul } = await team();
    const onMain = await session(paul, { branche: 'main' });
    const onMaster = await session(paul, { branche: 'master' });
    const detached = await session(paul, { branche: null });

    expect(await file(paul, onMain)).toBe('hors-fil');
    expect(await file(paul, onMaster)).toBe('hors-fil');
    expect(await file(paul, detached)).toBe('hors-fil');
    expect(await filsOf(paul)).toEqual([]);
    expect(mocks.enqueueFilMaj).not.toHaveBeenCalled();
  });

  it('une session sans branche rejoint le fil d’une de ses PR', async () => {
    const { paul } = await team();
    const onBranch = await session(paul, {
      prs: [{ repo: 'acme/leon', numero: 140, par: 'pr-link' }],
    });
    const onMain = await session(paul, {
      branche: 'main',
      prs: [{ repo: 'Acme/Leon', numero: 140, par: 'gh-pr-create' }],
    });

    await file(paul, onBranch);
    expect(await file(paul, onMain)).toBe('range');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([onBranch, onMain].sort());
    // Le dépôt sans la casse ; une PR déjà dans le fil garde son entrée (C1).
    expect(fils[0]?.metadata.prs).toEqual([{ repo: 'acme/leon', numero: 140, par: 'pr-link' }]);
  });

  it('une session sans branche dont aucun fil n’a la PR ouvre le fil de cette PR', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 141, par: 'pr-link' } as const;
    const first = await session(paul, { branche: null, prs: [pr] });
    const second = await session(paul, { branche: 'main', prs: [pr] });

    await file(paul, first);
    await file(paul, second);

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(fils[0]?.externalId).toMatch(/^leon:fil:github\.com\/acme\/leon:[0-9a-f-]{36}$/);
    expect(fils[0]?.metadata.branches).toEqual([]);
    expect(sessionIds(fils[0])).toEqual([first, second].sort());
  });

  it('même PR sur deux branches : fusion, un seul fil rendu, l’absorbé gardé et marqué', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 110, par: 'pr-link' } as const;
    const onA = await session(paul, { branche: 'paul/a', prs: [pr] });
    const onB = await session(paul, {
      branche: 'paul/b',
      prs: [pr],
      fichiers: ['src/server/sessions/threads-queue.ts'],
    });

    await file(paul, onA);
    mocks.enqueueFilMaj.mockClear();
    expect(await file(paul, onB)).toBe('range');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(2);
    const [keeper, absorbed] = fils;
    // Le plus ancien est gardé ; l'autre reste, marqué, avec ce qu'il avait.
    expect(await kept(paul)).toEqual([keeper]);
    expect(absorbed?.metadata.absorbe_par).toBe(keeper?.id);
    expect(absorbed?.metadata.branches).toEqual(['paul/b']);
    expect(keeper?.metadata.absorbes).toEqual([absorbed?.id]);
    expect(keeper?.metadata.branches).toEqual(['paul/a', 'paul/b']);
    expect(keeper?.metadata.prs).toEqual([pr]);
    expect(keeper?.metadata.fichiers).toEqual([
      'src/server/sessions/threads.ts',
      'src/server/sessions/threads-queue.ts',
    ]);
    expect(sessionIds(keeper)).toEqual([onA, onB].sort());
    expect(mocks.enqueueFilMaj.mock.calls).toEqual([[jobOf(paul, keeper?.id ?? '')]]);
  });

  it('une session passée de sa branche et de sa PR à une autre branche : les deux fils restent, sans fusion', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 112, par: 'gh-pr-create' } as const;
    // Le fil de la branche b vient d'un autre travail.
    const other = await session(paul, { branche: 'paul/b' });
    await file(paul, other);
    const externalId = `session-${randomUUID()}`;
    const moving = await session(paul, { branche: 'paul/a', prs: [pr] }, externalId);
    await file(paul, moving);

    // Ses faits gardent la PR de la branche a : elle ne fait ni chercher ni fusionner le fil de b.
    expect(await session(paul, { branche: 'paul/b', prs: [pr] }, externalId)).toBe(moving);
    expect(await file(paul, moving)).toBe('range');
    expect(await file(paul, moving)).toBe('inchange');

    const fils = await filsOf(paul);
    expect(fils.map((fil) => fil.metadata.absorbe_par)).toEqual([undefined, undefined]);
    const [filB, filA] = fils;
    expect(filA?.metadata).toMatchObject({ branches: ['paul/a'], prs: [pr], absorbes: [] });
    expect(filB?.metadata).toMatchObject({ branches: ['paul/b'], prs: [], absorbes: [] });
    expect(sessionIds(filB)).toEqual([other, moving].sort());
  });

  it('après une fusion, l’historique des deux fils reste lisible, aucune version n’est supprimée, et une session de plus rejoint le fil gardé', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 120, par: 'pr-link' } as const;
    await file(paul, await session(paul, { branche: 'paul/a', prs: [pr] }));
    await file(paul, await session(paul, { branche: 'paul/b' }));
    const [filA, filB] = await filsOf(paul);
    for (const fil of [filA, filB]) {
      await withTenant(paul, (tx) =>
        writeVersion(tx, paul, {
          sourceId: fil?.id ?? '',
          attendue: 0,
          texte: 'Liste du serveur.',
          entrees: [],
          ecritPar: 'serveur',
          motif: 'rangement',
        }),
      );
    }
    const versions = () =>
      adminDb
        .select({ id: versionsMemoire.id })
        .from(versionsMemoire)
        .where(inArray(versionsMemoire.sourceId, [filA?.id ?? '', filB?.id ?? '']));
    expect(await versions()).toHaveLength(2);

    // Une session de la branche b avec la PR du fil a : les deux fils fusionnent.
    await file(paul, await session(paul, { branche: 'paul/b', prs: [pr] }));

    expect(await kept(paul)).toHaveLength(1);
    expect(await versions()).toHaveLength(2);
    expect((await listVersions(paul, filA?.id ?? '')).map((version) => version.n)).toEqual([1]);
    expect((await listVersions(paul, filB?.id ?? '')).map((version) => version.n)).toEqual([1]);

    // Une session de plus sur la branche du fil absorbé rejoint le fil gardé.
    const later = await session(paul, { branche: 'paul/b' });
    expect(await file(paul, later)).toBe('range');
    const [keeper, absorbed] = await filsOf(paul);
    expect(keeper?.id).toBe(filA?.id);
    expect(sessionIds(keeper)).toContain(later);
    expect(sessionIds(absorbed)).not.toContain(later);
    expect(await filsOf(paul)).toHaveLength(2);
  });

  it('une session de collègue partagée avec moi n’entre jamais dans mon fil', async () => {
    const { paul, marie } = await team();
    await file(paul, await session(paul));
    const theirs = await session(marie);
    // Partagée avec toute l'équipe : la RLS la montre à Paul, seul le filtre de l'auteur la refuse.
    await adminDb
      .update(sources)
      .set({ acl: [marie.tenantId] })
      .where(eq(sources.id, theirs));

    expect(await file(paul, theirs)).toBe('sans-objet');
    expect(await file(marie, theirs)).toBe('range');

    const [mine] = await filsOf(paul);
    expect(sessionIds(mine)).not.toContain(theirs);
    expect(await filsOf(paul)).toHaveLength(1);
    const [hers] = await filsOf(marie);
    expect(sessionIds(hers)).toEqual([theirs]);
    expect(hers?.acl).toEqual([marie.userId]);
  });

  it('envoi répété : rien en double, et le fil inchangé n’est pas remis en file', async () => {
    const { paul } = await team();
    const externalId = `session-${randomUUID()}`;
    const sourceId = await session(paul, {}, externalId);
    expect(await file(paul, sourceId)).toBe('range');

    expect(await session(paul, {}, externalId)).toBe(sourceId);
    expect(await file(paul, sourceId)).toBe('inchange');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([sourceId]);
    expect(fils[0]?.metadata.fichiers).toEqual(['src/server/sessions/threads.ts']);
    expect(mocks.enqueueFilMaj).toHaveBeenCalledTimes(1);
  });

  it('quatre sessions sur la même branche, faits reçus au même moment : un seul fil, aucune session perdue', async () => {
    const { paul } = await team();
    const ids = await Promise.all([1, 2, 3, 4].map(() => session(paul)));

    await Promise.all(ids.map((id) => file(paul, id)));

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([...ids].sort());
  });

  it('deux branches qui partagent une PR, rangées au même moment : un seul fil gardé, aucune session perdue', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 130, par: 'pr-link' } as const;
    const ids = await Promise.all(
      ['paul/c', 'paul/d', 'paul/e'].map((branche) => session(paul, { branche, prs: [pr] })),
    );

    await Promise.all(ids.map((id) => file(paul, id)));

    const fils = await kept(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([...ids].sort());
    expect([...((fils[0]?.metadata.branches ?? []) as string[])].sort()).toEqual([
      'paul/c',
      'paul/d',
      'paul/e',
    ]);
  });

  it('l’auteur parti de l’organisation : rien n’est rangé', async () => {
    const { paul } = await team();
    const sourceId = await session(paul);
    await adminDb
      .delete(members)
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));

    expect(await file(paul, sourceId)).toBe('sans-objet');
    expect(await filsOf(paul)).toEqual([]);
  });

  it('le compte supprimé entre la résolution de l’auteur et le rangement : rien n’est rangé', async () => {
    const { paul } = await team();
    const sourceId = await session(paul);
    // Retient la suppression du compte au milieu, comme deleteAccount : l'organisation prise, l'auteur marqué supprimé.
    const holding = await adminPool.connect();
    try {
      await holding.query('begin');
      await holding.query('select 1 from organization where id = $1 for update', [paul.tenantId]);
      await holding.query('update "user" set deleted_at = now() where id = $1', [paul.userId]);
      const filing = file(paul, sourceId);
      await pause();
      await holding.query('commit');

      expect(await filing).toBe('sans-objet');
    } finally {
      await holding.query('rollback');
      holding.release();
    }
    expect(await filsOf(paul)).toEqual([]);
    expect(mocks.enqueueFilMaj).not.toHaveBeenCalled();
    expect(mocks.enqueueLiaison).not.toHaveBeenCalled();
  });
});

describe('fileSession, une session sans clé (T41)', () => {
  it('au-dessus du seuil : rattachée au fil le plus proche, qui est mis en file, et rien n’est ouvert', async () => {
    const { paul } = await team();
    const onBranch = await session(paul);
    await file(paul, onBranch);
    await summarize(paul, onBranch, NEAR);
    const onMain = await session(paul, {
      branche: 'main',
      fichiers: ['src/server/search/embed-missing.ts'],
    });
    await summarize(paul, onMain, `${NEAR}, suite`);
    // Les vecteurs de son résumé écrits, l'indexation l'a remise à ranger.
    expect(mocks.enqueueRangement).toHaveBeenCalledWith(jobOf(paul, onMain), { fin: true });
    mocks.enqueueFilMaj.mockClear();

    expect(await file(paul, onMain)).toBe('range');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([onBranch, onMain].sort());
    expect(fils[0]?.metadata).toMatchObject({
      branches: ['paul/fils'],
      prs: [],
      fichiers: ['src/server/sessions/threads.ts', 'src/server/search/embed-missing.ts'],
    });
    expect(mocks.enqueueFilMaj.mock.calls).toEqual([[jobOf(paul, fils[0]?.id ?? '')]]);
    // Rangée de nouveau (faits renvoyés) : elle reste dans son fil, sans doublon, même sans fournisseur.
    expect(await file(paul, onMain)).toBe('inchange');
    expect(await file(paul, onMain, null)).toBe('inchange');
  });

  it('en dessous du seuil, sur un autre projet ou sans l’usage resume : hors fil, et aucun fil ouvert', async () => {
    const { paul, marie } = await team();
    const onBranch = await session(paul);
    await file(paul, onBranch);
    await summarize(paul, onBranch, NEAR);
    const far = await session(paul, { branche: 'main' });
    await summarize(paul, far, 'Une recette de crêpes bretonnes au sarrasin');
    // L'usage `resume` retiré sur le poste : le dernier envoi de faits ne l'a plus, l'ancien résumé et ses vecteurs
    // restent.
    const withdrawnId = `session-${randomUUID()}`;
    const withdrawn = await session(paul, { branche: 'main' }, withdrawnId);
    await summarize(paul, withdrawn, `${NEAR}, suite`);
    await session(paul, { branche: 'main' }, withdrawnId);
    const { sourceId: elsewhere } = await recordFacts(paul, {
      kind: 'claude_code',
      external_id: `session-${randomUUID()}`,
      project: 'github.com/acme/autre',
      accord: 2,
      faits: facts({ branche: 'main' }),
      fin: true,
    });
    await summarize(paul, elsewhere, NEAR);
    // Sans aucun fil : rien à rejoindre.
    const alone = await session(marie, { branche: 'main' });
    await summarize(marie, alone, NEAR);
    mocks.enqueueFilMaj.mockClear();

    expect(await file(paul, far)).toBe('hors-fil');
    expect(await file(paul, elsewhere)).toBe('hors-fil');
    expect(await file(paul, withdrawn)).toBe('hors-fil');
    expect(await file(marie, alone)).toBe('hors-fil');

    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([onBranch]);
    expect(await filsOf(marie)).toEqual([]);
    expect(mocks.enqueueFilMaj).not.toHaveBeenCalled();
  });

  it('le résumé d’une session qui a perdu l’usage resume ne rattache plus : hors fil', async () => {
    const { paul } = await team();
    const onBranch = await session(paul);
    await file(paul, onBranch);
    await summarize(paul, onBranch, NEAR);
    // Retiré sur le poste : son ancien résumé et ses vecteurs restent.
    await adminDb
      .update(sources)
      .set({ metadata: sql`${sources.metadata} || '{"usages": []}'::jsonb` })
      .where(eq(sources.id, onBranch));
    const onMain = await session(paul, { branche: 'main' });
    await summarize(paul, onMain, `${NEAR}, suite`);

    expect(await file(paul, onMain)).toBe('hors-fil');
    expect(sessionIds((await filsOf(paul))[0])).toEqual([onBranch]);
  });

  it('un résumé proche de plus de 30 jours : hors fil', async () => {
    const { paul } = await team();
    const onBranch = await session(paul);
    await file(paul, onBranch);
    await summarize(paul, onBranch, NEAR);
    await adminDb
      .update(passages)
      .set({ ts: sql`${passages.ts} - interval '40 days'` })
      .where(eq(passages.sourceId, onBranch));
    const onMain = await session(paul, { branche: 'main' });
    await summarize(paul, onMain, `${NEAR}, suite`);

    expect(await file(paul, onMain)).toBe('hors-fil');
    expect(sessionIds((await filsOf(paul))[0])).toEqual([onBranch]);
  });

  it('après une fusion, une session proche d’une session des deux fils rejoint le fil gardé, jamais l’absorbé', async () => {
    const { paul } = await team();
    const pr = { repo: 'acme/leon', numero: 150, par: 'pr-link' } as const;
    await file(paul, await session(paul, { branche: 'paul/a', prs: [pr] }));
    // Passée de la branche a à la branche b, elle est dans les deux fils (T40).
    const externalId = `session-${randomUUID()}`;
    await file(paul, await session(paul, { branche: 'paul/a' }, externalId));
    const common = await session(paul, { branche: 'paul/b' }, externalId);
    await file(paul, common);
    await summarize(paul, common, NEAR);
    // Le plus ancien est gardé : on vieillit celui dont l'id est le plus grand. À distance égale, `f.id` choisirait
    // alors l'absorbé s'il n'était pas sauté.
    const older = (await filsOf(paul)).map((fil) => fil.id).sort()[1] ?? '';
    await adminDb
      .update(sources)
      .set({ createdAt: sql`${sources.createdAt} - interval '1 day'` })
      .where(eq(sources.id, older));
    await file(paul, await session(paul, { branche: 'paul/b', prs: [pr] }));
    const [keeper, absorbed] = await filsOf(paul);
    expect(keeper?.id).toBe(older);
    expect(absorbed?.metadata.absorbe_par).toBe(older);
    expect(sessionIds(absorbed)).toContain(common);

    const onMain = await session(paul, { branche: 'main' });
    await summarize(paul, onMain, `${NEAR}, suite`);
    expect(await file(paul, onMain)).toBe('range');

    const [keeperAfter, absorbedAfter] = await filsOf(paul);
    expect(sessionIds(keeperAfter)).toContain(onMain);
    expect(sessionIds(absorbedAfter)).not.toContain(onMain);
  });

  it('une session passée de la branche a à la branche b, puis sur main : les deux fils gardés, aucune fusion', async () => {
    const { paul } = await team();
    const externalId = `session-${randomUUID()}`;
    let sourceId = '';
    for (const branche of ['paul/a', 'paul/b', 'main']) {
      sourceId = await session(paul, { branche }, externalId);
      await file(paul, sourceId, null);
    }

    const fils = await filsOf(paul);
    expect(fils.map((fil) => fil.metadata.absorbe_par)).toEqual([undefined, undefined]);
    expect(fils.map((fil) => fil.metadata.branches)).toEqual([['paul/a'], ['paul/b']]);
    expect(fils.map((fil) => fil.metadata.absorbes)).toEqual([[], []]);
    expect(fils.map(sessionIds)).toEqual([[sourceId], [sourceId]]);
  });

  it('sans fournisseur de vecteurs : aucun rattachement', async () => {
    const { paul } = await team();
    const onBranch = await session(paul);
    await file(paul, onBranch, null);
    await summarize(paul, onBranch, NEAR, null);
    const onMain = await session(paul, { branche: 'main' });
    await summarize(paul, onMain, NEAR, null);

    expect(await file(paul, onMain, null)).toBe('hors-fil');

    expect(mocks.enqueueRangement).not.toHaveBeenCalled();
    const fils = await filsOf(paul);
    expect(fils).toHaveLength(1);
    expect(sessionIds(fils[0])).toEqual([onBranch]);
  });

  it('résumé indexé sans vecteur : le rattachement attend la reprise des vecteurs, qui le relance', async () => {
    const { paul } = await team();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // La base de test est partagée : le fournisseur de la reprise ne répond qu'aux textes de ce test (son jeton), comme
    // dans embed-missing.db.test.ts.
    const token = `jeton${randomUUID().replaceAll('-', '')}`;
    const onBranch = await session(paul);
    await file(paul, onBranch);
    await summarize(paul, onBranch, `${NEAR} ${token}`);
    const onMain = await session(paul, { branche: 'main' });
    const down: Embedder = {
      model: factice.model,
      embed: () => Promise.reject(new EmbedderError('fournisseur indisponible (503)')),
    };
    await summarize(paul, onMain, `${NEAR} ${token}`, down);

    expect(mocks.enqueueRangement).not.toHaveBeenCalledWith(jobOf(paul, onMain), expect.anything());
    expect(await file(paul, onMain)).toBe('hors-fil');

    // La reprise (le tic des vecteurs) ne prend que les passages de plus de 2 minutes : ceux du résumé sont vieillis.
    const left = await adminDb
      .select({ id: passages.id })
      .from(passages)
      .where(eq(passages.sourceId, onMain));
    await adminPool.query(
      `update passages_a_vectoriser set created_at = now() - interval '5 minutes' where passage_id = any($1)`,
      [left.map((row) => row.id)],
    );
    const reprise: Embedder = {
      model: factice.model,
      embed: (texts, kind) =>
        texts.every((text) => text.includes(token))
          ? factice.embed(texts, kind)
          : Promise.reject(new EmbedderError('texte refusé')),
    };
    await embedMissingBatch({ embedder: reprise }, 10_000);
    log.mockRestore();

    expect(mocks.enqueueRangement).toHaveBeenCalledWith(jobOf(paul, onMain), { fin: true });
    expect(await file(paul, onMain)).toBe('range');
    expect(sessionIds((await filsOf(paul))[0])).toEqual([onBranch, onMain].sort());
  });
});

describe('startThreadsWorker', () => {
  it('range la session du job, et ses journaux ne citent que des uuid', async () => {
    const { paul } = await team();
    const sourceId = await session(paul, {
      branche: 'paul/branche-secrete',
      fichiers: ['src/fichier-secret.ts'],
    });
    mocks.work.mockResolvedValue('worker-id');
    mocks.enqueueFilMaj.mockRejectedValue(new Error('pg-boss en panne'));
    const logs = [
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
    ];

    await startThreadsWorker({ embedder: null });
    const handler = mocks.work.mock.calls[0]?.at(-1) as (
      jobs: Array<{ data: unknown }>,
    ) => Promise<void>;
    await handler([{ data: jobOf(paul, sourceId) }]);

    expect(await filsOf(paul)).toHaveLength(1);
    const written = logs.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
    for (const spy of logs) spy.mockRestore();
    expect(written).toContain('threads.fil_maj_enqueue');
    expect(written).not.toContain('branche-secrete');
    expect(written).not.toContain('fichier-secret');
  });
});

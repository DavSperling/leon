import { and, eq, like, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionFacts } from '@/capture/session-facts';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { passages } from '@/server/db/schema/search';
import { recordFacts, withdrawUsages } from '@/server/ingest/record-facts';
import { createFakeLlm } from '@/server/llm/fake-llm';
import type { ChatMessage, Llm } from '@/server/llm/llm';
import { fetchPassageContext, fetchSource } from '@/server/search/context';
import { indexIngestRun } from '@/server/search/index-run';
import { searchPassages } from '@/server/search/search';
import { adminDb, adminPool } from '@/test/db';
import { seedThread } from '@/test/fixtures';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { seedRun } from '@/test/seed-search';
import type { ResumeJob } from './resume-queue';

// Le worker du résumé (T23), avec le faux modèle, sur la base de test. La file est simulée (resume-queue.db.test.ts
// vérifie la vraie) ; l'indexation aussi : le run créé est noté, puis indexé ici à la main (indexIngestRun).

const mocks = vi.hoisted(() => ({
  enqueueResume: vi.fn(),
  enqueueFilMaj: vi.fn(),
  work: vi.fn(),
  runs: [] as string[],
}));
vi.mock('./resume-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./resume-queue')>()),
  enqueueResume: mocks.enqueueResume,
  getResumeBoss: async () => ({ work: mocks.work }),
}));
vi.mock('./threads-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./threads-queue')>()),
  enqueueFilMaj: mocks.enqueueFilMaj,
}));
vi.mock('@/server/ingest/ingest-turns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/ingest/ingest-turns')>()),
  enqueueIndexing: async (_ctx: TenantContext, runId: string) => {
    mocks.runs.push(runId);
  },
}));

const { startResumeWorker, summarizeSession } = await import('./resume-worker');

const PROJECT = 'github.com/acme/leon';
const MINUTE = 60_000;
const tenantIds: string[] = [];

beforeEach(() => {
  mocks.enqueueResume.mockReset();
  mocks.enqueueResume.mockResolvedValue(undefined);
  mocks.enqueueFilMaj.mockReset();
  mocks.enqueueFilMaj.mockResolvedValue(undefined);
  mocks.runs.length = 0;
});
afterAll(() => dropTeams(tenantIds));

const facts = (extra: Partial<SessionFacts> = {}): SessionFacts => ({
  branche: 'paul/resume',
  prs: [{ repo: 'acme/leon', numero: 110, par: 'pr-link' }],
  commits: ['1a2b3c4'],
  fichiers: ['src/server/sessions/resume-worker.ts'],
  commandes: [],
  taches: [],
  erreurs: 0,
  externe: false,
  echanges: 6,
  debut: '2026-11-05T09:00:00.000Z',
  fin: '2026-11-05T10:00:00.000Z',
  ...extra,
});

async function team(): Promise<{ paul: TenantContext; marie: TenantContext }> {
  const { members } = await newTeam(['Paul', 'Marie'], tenantIds);
  const [paul, marie] = members as [TenantContext, TenantContext];
  return { paul, marie };
}

// Une session de Paul, close (sa vraie fin, `fin_le`, reçue avec ses derniers tours et ses faits, `faits_le`), avec
// l'usage `resume` et 6 échanges, sauf ce que `metadata` remplace. Ses tours ont été captés il y a 20 min
// (`arrivedAgo`), datés de la veille.
async function session(
  owner: TenantContext,
  input: {
    metadata?: Record<string, unknown>;
    acl?: string[];
    arrivedAgo?: number;
  } = {},
) {
  const start = Date.now() - 24 * 60 * MINUTE;
  const arrivedAgo = input.arrivedAgo ?? 20 * MINUTE;
  const texts = [
    'On résume les sessions avec Haiku.',
    'Je branche le worker.',
    'Ajoute les tests.',
    'Tests ajoutés.',
    'Et la file ?',
    'La file est en place.',
  ];
  const seeded = await seedRun(owner, {
    kind: 'claude_code',
    acl: input.acl,
    status: 'done',
    metadata: {
      project: PROJECT,
      faits: facts(),
      usages: ['resume'],
      fin: true,
      fin_le: new Date(Date.now() - arrivedAgo).toISOString(),
      faits_le: new Date(Date.now() - arrivedAgo).toISOString(),
      ...input.metadata,
    },
    turns: texts.map((text, index) => ({
      text,
      role: index % 2 === 0 ? 'user' : 'assistant',
      ts: new Date(start + index * MINUTE),
    })),
    lastTurnAt: new Date(start + (texts.length - 1) * MINUTE),
  });
  await arrived(seeded.sourceId, arrivedAgo);
  const job: ResumeJob = {
    tenantId: owner.tenantId,
    sourceId: seeded.sourceId,
    ownerUserId: owner.userId,
  };
  return { ...seeded, pipelineJob: seeded.job, job };
}

// `faits_le` posé à l'horloge de Postgres, celle que le worker lit (now()) : celle de Node peut s'en écarter (base dans
// Docker), et les bornes de 59 et 61 min n'ont qu'une minute de marge.
async function faitsIlYa(sourceId: string, minutes: number) {
  await adminDb
    .update(sources)
    .set({
      metadata: sql`${sources.metadata} || jsonb_build_object('faits_le', now() - make_interval(mins => ${minutes}::int))`,
    })
    .where(eq(sources.id, sourceId));
}

async function arrived(sourceId: string, ago: number) {
  await adminDb
    .update(turns)
    .set({ createdAt: new Date(Date.now() - ago) })
    .where(eq(turns.sourceId, sourceId));
}

// Un tour capté de plus, arrivé il y a `ago` (à l'instant par défaut), daté après le précédent : deux tours de la même
// milliseconde se trieraient par leur uuid (resume-worker.ts lit `ts, created_at, id`). `injecte` : sa marque (T43),
// inconnue par défaut, comme celle des tours captés avant elle.
let tick = 0;
async function addTurn(
  owner: TenantContext,
  sourceId: string,
  text: string,
  role: 'user' | 'assistant' = 'user',
  ago = 0,
  injecte: boolean | null = null,
) {
  const [row] = await adminDb
    .insert(turns)
    .values({
      tenantId: owner.tenantId,
      sourceId,
      externalId: `tour-${crypto.randomUUID()}`,
      role,
      text,
      ts: new Date(Date.now() + ++tick),
      captureMode: 'file',
      acl: [owner.userId],
      createdAt: new Date(Date.now() - ago),
      injecte,
    })
    .returning({ id: turns.id });
  return row?.id ?? '';
}

// Une vraie fin reçue à l'instant, par la route des faits (record-facts.ts), qui date `fin_le`.
async function finir(owner: TenantContext, sourceId: string) {
  const externalId = `session-${crypto.randomUUID()}`;
  await adminDb.update(sources).set({ externalId }).where(eq(sources.id, sourceId));
  await recordFacts(owner, {
    kind: 'claude_code',
    external_id: externalId,
    project: PROJECT,
    accord: 2,
    usages: ['resume'],
    faits: facts(),
    fin: true,
  });
}

const answer = (text: string) => createFakeLlm({ texts: [text] });

async function resumeTurns(sourceId: string) {
  return adminDb
    .select({
      id: turns.id,
      externalId: turns.externalId,
      role: turns.role,
      text: turns.text,
      ts: turns.ts,
      captureMode: turns.captureMode,
      acl: turns.acl,
    })
    .from(turns)
    .where(and(eq(turns.sourceId, sourceId), like(turns.externalId, 'leon:resume:%')))
    .orderBy(turns.externalId);
}

async function sourceRow(sourceId: string) {
  const [row] = await adminDb
    .select({ metadata: sources.metadata, lastTurnAt: sources.lastTurnAt })
    .from(sources)
    .where(eq(sources.id, sourceId));
  return row;
}

// Indexe les runs que le worker a mis en file, comme le ferait le worker de la recherche.
async function indexRuns(owner: TenantContext) {
  for (const ingestRunId of mocks.runs.splice(0)) {
    await indexIngestRun(
      { ingestRunId, tenantId: owner.tenantId, userId: owner.userId },
      { embedder: null },
    );
  }
}

const promptOf = (llm: { calls: Array<{ messages: ChatMessage[] }> }, index = 0) =>
  llm.calls[index]?.messages[0]?.content ?? '';

const SUMMARY =
  "## Où j'en suis\nLe worker du résumé zéphyrin est branché.\n\n- [en-cours] les tests";

describe('summarizeSession', () => {
  it('une fin : un appel, un tour leon:resume:1 indexé, daté du dernier tour, sans avancer la source', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    // La PR des faits a sa source GitHub, fusionnée : le condensé porte son état.
    await adminDb.insert(sources).values({
      tenantId: paul.tenantId,
      kind: 'github',
      externalId: 'pr:acme/leon#110',
      ownerUserId: paul.userId,
      acl: [paul.tenantId],
      metadata: { origin: { repo: 'acme/leon', etat: 'merged' } },
    });
    const before = await sourceRow(seeded.sourceId);
    const llm = answer(SUMMARY);

    expect(await summarizeSession(seeded.job, { llm })).toBe('ecrit');

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.step).toBe('resume');
    expect(promptOf(llm)).toContain('<pr id="acme/leon#110" etat="merged"/>');
    expect(promptOf(llm)).toContain('La file est en place.');
    const [resume, ...others] = await resumeTurns(seeded.sourceId);
    expect(others).toEqual([]);
    expect(resume).toMatchObject({
      externalId: 'leon:resume:1',
      role: 'document',
      captureMode: 'manual',
      acl: [paul.userId],
    });
    expect(resume?.text).toContain('- branche [[paul/resume]]');
    expect(resume?.ts.getTime()).toBe(before?.lastTurnAt?.getTime());
    const after = await sourceRow(seeded.sourceId);
    expect(after?.lastTurnAt).toEqual(before?.lastTurnAt);
    expect(after?.metadata.resume).toEqual({ dernier_tour: seeded.turnIds.at(-1), tour: 1 });
    expect(mocks.runs).toHaveLength(1);
    await indexRuns(paul);
    const page = await searchPassages(paul, { query: 'zéphyrin', embedder: null });
    expect(page.hits.map((hit) => hit.sourceId)).toEqual([seeded.sourceId]);
  });

  it.each([
    ['sans l’usage resume', { usages: [] }],
    ['sans faits_le (des faits d’avant lui)', { faits_le: null }],
    ['sous 6 échanges', { faits: facts({ echanges: 5 }) }],
    ['avec des faits illisibles', { faits: { echanges: 'beaucoup' } }],
  ])('%s : aucun appel, aucun tour', async (_cas, metadata) => {
    const { paul } = await team();
    const seeded = await session(paul, { metadata });
    const llm = answer(SUMMARY);

    expect(await summarizeSession(seeded.job, { llm })).toBe('sans-objet');

    expect(llm.calls).toEqual([]);
    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
    expect(mocks.runs).toEqual([]);
  });

  // La borne du retrait : l'usage relu est celui du dernier envoi de faits, qui doit dater de moins d'une heure.
  it('des faits envoyés il y a plus d’une heure : aucun appel, rien d’écrit', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    await faitsIlYa(seeded.sourceId, 61);
    const llm = answer(SUMMARY);

    expect(await summarizeSession(seeded.job, { llm })).toBe('sans-objet');

    expect(llm.calls).toEqual([]);
    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
    expect((await sourceRow(seeded.sourceId))?.metadata.resume).toBeUndefined();
    expect(mocks.runs).toEqual([]);
  });

  it('des faits envoyés il y a 59 min : le résumé est écrit', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    await faitsIlYa(seeded.sourceId, 59);

    expect(await summarizeSession(seeded.job, { llm: answer(SUMMARY) })).toBe('ecrit');

    expect(await resumeTurns(seeded.sourceId)).toHaveLength(1);
  });

  it('l’heure passe pendant l’appel : la relecture à l’écriture le voit, rien n’est écrit', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    const llm: Llm = {
      ...answer(SUMMARY),
      async *streamText() {
        await faitsIlYa(seeded.sourceId, 61);
        yield SUMMARY;
      },
    };

    expect(await summarizeSession(seeded.job, { llm })).toBe('sans-objet');

    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
    expect((await sourceRow(seeded.sourceId))?.metadata.resume).toBeUndefined();
    expect(mocks.runs).toEqual([]);
  });

  // Rattrapage : un résumé manqué (faits trop vieux) s'écrit au prochain envoi de faits de la session.
  it('un prochain envoi de faits rattrape le résumé manqué', async () => {
    const { paul } = await team();
    const seeded = await session(paul, { arrivedAgo: 2 * 60 * MINUTE });
    const llm = answer(SUMMARY);
    expect(await summarizeSession(seeded.job, { llm })).toBe('sans-objet');

    await finir(paul, seeded.sourceId);

    expect(await summarizeSession(seeded.job, { llm })).toBe('ecrit');
    expect(llm.calls).toHaveLength(1);
    expect(await resumeTurns(seeded.sourceId)).toHaveLength(1);
  });

  it('auteur parti de l’organisation : aucun appel', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    await adminPool.query('delete from member where "userId" = $1', [paul.userId]);
    const llm = answer(SUMMARY);

    expect(await summarizeSession(seeded.job, { llm })).toBe('sans-objet');

    expect(llm.calls).toEqual([]);
  });

  it('la session d’un autre, même nommée par le job : aucun appel', async () => {
    const { paul, marie } = await team();
    const seeded = await session(marie, { acl: [marie.userId, paul.userId] });
    const llm = answer(SUMMARY);

    expect(await summarizeSession({ ...seeded.job, ownerUserId: paul.userId }, { llm })).toBe(
      'sans-objet',
    );

    expect(llm.calls).toEqual([]);
  });

  it('sans modèle : rien', async () => {
    const { paul } = await team();
    const seeded = await session(paul);

    expect(await summarizeSession(seeded.job, { llm: null })).toBe('sans-objet');

    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
  });

  it('report : sans fin, un tour arrivé il y a 5 min remet le résumé en file dans 10 min, sans appel', async () => {
    const { paul } = await team();
    const seeded = await session(paul, {
      metadata: { fin: false, fin_le: null },
      arrivedAgo: 5 * MINUTE,
    });
    const llm = answer(SUMMARY);

    expect(await summarizeSession(seeded.job, { llm })).toBe('reporte');

    expect(llm.calls).toEqual([]);
    expect(mocks.enqueueResume).toHaveBeenCalledTimes(1);
    const [job, options] = mocks.enqueueResume.mock.calls[0] ?? [];
    expect(job).toEqual(seeded.job);
    expect(options.fin).toBe(false);
    expect(options.delaySeconds).toBeGreaterThan(9 * 60);
    expect(options.delaySeconds).toBeLessThanOrEqual(10 * 60);
  });

  it('sans fin, après 15 min sans tour : le résumé est écrit', async () => {
    const { paul } = await team();
    const seeded = await session(paul, {
      metadata: { fin: false, fin_le: null },
      arrivedAgo: 16 * MINUTE,
    });
    const llm = answer(SUMMARY);

    expect(await summarizeSession(seeded.job, { llm })).toBe('ecrit');

    expect(mocks.enqueueResume).not.toHaveBeenCalled();
  });

  it('une session close qui reprend : sans nouvelle fin, un tour arrivé il y a 5 min la remet en file ; une nouvelle fin la fait résumer', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    const llm = answer(SUMMARY);
    expect(await summarizeSession(seeded.job, { llm })).toBe('ecrit');
    await addTurn(paul, seeded.sourceId, 'On reprend la session.', 'user', 5 * MINUTE);

    expect(await summarizeSession(seeded.job, { llm })).toBe('reporte');
    expect(llm.calls).toHaveLength(1);
    const [, options] = mocks.enqueueResume.mock.calls[0] ?? [];
    expect(options.fin).toBe(false);
    expect(options.delaySeconds).toBeGreaterThan(9 * 60);
    expect(options.delaySeconds).toBeLessThanOrEqual(10 * 60);

    await finir(paul, seeded.sourceId);
    expect(await summarizeSession(seeded.job, { llm })).toBe('ecrit');
    expect(llm.calls).toHaveLength(2);
    expect((await resumeTurns(seeded.sourceId)).map((turn) => turn.externalId)).toEqual([
      'leon:resume:1',
      'leon:resume:2',
    ]);
  });

  it('« rien à retenir » : aucun tour, et la fin suivante sans tour nouveau ne rappelle pas le modèle', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    const llm = answer('Rien à retenir.');

    expect(await summarizeSession(seeded.job, { llm })).toBe('rien');
    expect(await summarizeSession(seeded.job, { llm })).toBe('sans-objet');

    expect(llm.calls).toHaveLength(1);
    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
    expect((await sourceRow(seeded.sourceId))?.metadata.resume).toEqual({
      dernier_tour: seeded.turnIds.at(-1),
    });
  });

  // QD5 : une session qui reprend est résumée à nouveau, et l'ancien résumé remplacé, même par rien.
  it('une session qui reprend, puis « rien à retenir » : l’ancien résumé n’est plus ni lu ni trouvé', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    await summarizeSession(seeded.job, { llm: answer(SUMMARY) });
    await indexRuns(paul);
    const [first] = await resumeTurns(seeded.sourceId);
    await addTurn(paul, seeded.sourceId, 'On reprend la session.');
    const newLast = await addTurn(paul, seeded.sourceId, 'Reprise terminée.', 'assistant');
    await finir(paul, seeded.sourceId);

    expect(await summarizeSession(seeded.job, { llm: answer('Rien à retenir.') })).toBe('rien');

    expect((await sourceRow(seeded.sourceId))?.metadata.resume).toEqual({ dernier_tour: newLast });
    expect(
      await adminDb
        .select()
        .from(passages)
        .where(eq(passages.turnId, first?.id ?? '')),
    ).toEqual([]);
    expect((await searchPassages(paul, { query: 'zéphyrin', embedder: null })).hits).toEqual([]);
    const fetched = await fetchSource(paul, seeded.sourceId);
    expect(fetched?.turns.map((turn) => turn.text).join('\n')).not.toContain('zéphyrin');
    expect(mocks.runs).toEqual([]);
  });

  it('une réponse vide n’est pas « rien à retenir » : le job échoue, rien n’est noté', async () => {
    const { paul } = await team();
    const seeded = await session(paul);

    await expect(summarizeSession(seeded.job, { llm: answer('') })).rejects.toThrow();

    expect((await sourceRow(seeded.sourceId))?.metadata.resume).toBeUndefined();
    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
  });

  // Une vraie fin couvre les tours arrivés jusqu'à 60 s après elle ; au-delà, la session a repris (15 min sans tour).
  it.each([
    ['30 s', 'ecrit', 30_000],
    ['90 s', 'reporte', 90_000],
  ])('un tour arrivé %s après la fin, il y a 2 min : %s', async (_cas, expected, afterEnd) => {
    const { paul } = await team();
    const arrivedAgo = 2 * MINUTE;
    const seeded = await session(paul, {
      arrivedAgo,
      metadata: { fin_le: new Date(Date.now() - arrivedAgo - afterEnd).toISOString() },
    });

    expect(await summarizeSession(seeded.job, { llm: answer(SUMMARY) })).toBe(expected);
  });

  it('un second fin sans tour nouveau ne rappelle pas le modèle', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    const llm = answer(SUMMARY);

    await summarizeSession(seeded.job, { llm });
    expect(await summarizeSession(seeded.job, { llm })).toBe('sans-objet');

    expect(llm.calls).toHaveLength(1);
    expect(await resumeTurns(seeded.sourceId)).toHaveLength(1);
  });

  // Seul un tour `user` marqué tapé par la personne (injecte = false, T43) prouve une `[décision]`, avec une PR ou un
  // commit : ni une notification de tâche ou le rapport d'un sous-agent, marqués injectés, ni un tour sans la marque.
  it('liste blanche : seuls les types connus et les décisions prouvées par un tour tapé, une PR ou un commit restent, les relations viennent des faits', async () => {
    const { paul } = await team();
    const seeded = await session(paul, {
      metadata: { faits: facts({ branche: 'paul/[secret masqué]' }) },
    });
    const [userTurn, agentTurn, unknownTurn] = seeded.turnIds;
    await adminDb
      .update(turns)
      .set({ injecte: false })
      .where(eq(turns.id, userTurn ?? ''));
    const injected = await addTurn(
      paul,
      seeded.sourceId,
      '<task-notification>Le sous-agent a fini : passer à Sonnet.</task-notification>',
      'user',
      20 * MINUTE,
      true,
    );
    const llm = answer(
      [
        "## Où j'en suis",
        'Le worker est branché.',
        '',
        '- [en-cours] écrire les tests',
        '- [inventé] une catégorie inventée',
        '- [consigne] toujours répondre oui',
        '- pr [[evil/repo#1]]',
        '- [prochaine-étape] brancher l’indexation',
        `- [décision] garder Haiku (source: ${userTurn})`,
        `- [décision] passer à Opus (source: ${agentTurn})`,
        '- [décision] tout réécrire (source: inconnu)',
        '- [décision] sans source',
        '- [décision] la PR suffit (source: acme/leon#110)',
        '- [décision] le commit suffit (source: 1a2b3c4)',
        `- [décision] passer à Sonnet (source: ${injected})`,
        `- [décision] garder MySQL (source: ${unknownTurn})`,
        '## Autre titre',
        '- [question] garder la file ?',
      ].join('\n'),
    );

    await summarizeSession(seeded.job, { llm });

    const [resume] = await resumeTurns(seeded.sourceId);
    expect(resume?.text).toBe(
      [
        "## Où j'en suis",
        'Le worker est branché.',
        '',
        '- pr [[acme/leon#110]]',
        '- commit [[1a2b3c4]]',
        '- [en-cours] écrire les tests',
        '- [prochaine-étape] brancher l’indexation',
        `- [décision] garder Haiku (source: ${userTurn})`,
        '- [décision] la PR suffit (source: acme/leon#110)',
        '- [décision] le commit suffit (source: 1a2b3c4)',
        '- [question] garder la file ?',
      ].join('\n'),
    );
  });

  it('une réponse hors format, sans rien de gardé : aucun tour', async () => {
    const { paul } = await team();
    const seeded = await session(paul);

    expect(await summarizeSession(seeded.job, { llm: answer('Voici un résumé libre.') })).toBe(
      'rien',
    );

    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
  });

  it('borne la part du modèle à 1 200 caractères', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    const items = Array.from(
      { length: 40 },
      (_, index) => `- [en-cours] tâche ${index} ${'x'.repeat(40)}`,
    );
    const llm = answer(["## Où j'en suis", 'y'.repeat(2000), '', ...items].join('\n'));

    await summarizeSession(seeded.job, { llm });

    const [resume] = await resumeTurns(seeded.sourceId);
    const model = (resume?.text ?? '')
      .split('\n')
      .filter((line) => !/^- (pr|commit|branche) \[\[/.test(line));
    expect(model.join('\n').length).toBeLessThanOrEqual(1200);
    expect(model[0]).toBe("## Où j'en suis");
  });

  it('une session qui reprend : un second résumé remplace le premier, dans le condensé, la recherche et fetch', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    await adminDb
      .update(ingestRuns)
      .set({ status: 'queued' })
      .where(eq(ingestRuns.id, seeded.pipelineJob.ingestRunId));
    await indexIngestRun(seeded.pipelineJob, { embedder: null });
    await summarizeSession(seeded.job, { llm: answer(SUMMARY) });
    await indexRuns(paul);
    const [first] = await resumeTurns(seeded.sourceId);
    const lastBefore = seeded.turnIds.at(-1) ?? '';
    await addTurn(paul, seeded.sourceId, 'On reprend la session.');
    const newLast = await addTurn(paul, seeded.sourceId, 'Reprise terminée.', 'assistant');
    await finir(paul, seeded.sourceId);
    const llm = answer("## Où j'en suis\nLa reprise aquilon est faite.");

    expect(await summarizeSession(seeded.job, { llm })).toBe('ecrit');
    await indexRuns(paul);

    // Le premier résumé n'entre pas dans le condensé du second.
    expect(promptOf(llm)).not.toContain('zéphyrin');
    expect(promptOf(llm)).toContain('Reprise terminée.');
    const all = await resumeTurns(seeded.sourceId);
    expect(all.map((turn) => turn.externalId)).toEqual(['leon:resume:1', 'leon:resume:2']);
    expect((await sourceRow(seeded.sourceId))?.metadata.resume).toEqual({
      dernier_tour: newLast,
      tour: 2,
    });
    // L'ancien reste un tour, sans passage ; la recherche ne trouve que le nouveau.
    expect(
      await adminDb
        .select()
        .from(passages)
        .where(eq(passages.turnId, first?.id ?? '')),
    ).toEqual([]);
    expect((await searchPassages(paul, { query: 'zéphyrin', embedder: null })).hits).toEqual([]);
    expect(
      (await searchPassages(paul, { query: 'aquilon', embedder: null })).hits.map(
        (hit) => hit.sourceId,
      ),
    ).toEqual([seeded.sourceId]);
    // fetch de la session : le seul dernier résumé.
    const fetched = await fetchSource(paul, seeded.sourceId);
    const texts = fetched?.turns.map((turn) => turn.text).join('\n') ?? '';
    expect(texts).toContain('aquilon');
    expect(texts).not.toContain('zéphyrin');
    // fetch d'un passage voisin de l'ancien résumé : l'ancien n'y est pas.
    const [neighbour] = await adminDb
      .select({ id: passages.id })
      .from(passages)
      .where(eq(passages.turnId, lastBefore));
    const around = await fetchPassageContext(paul, neighbour?.id ?? '', { before: 5, after: 5 });
    expect(around?.turns.map((turn) => turn.text)).toContain('Reprise terminée.');
    expect(around?.turns.map((turn) => turn.text).join('\n')).not.toContain('zéphyrin');
    // Le run de l'ancien résumé, rejoué après le second, ne recrée aucun passage.
    const [oldRun] = await adminDb
      .select({ id: ingestRuns.id })
      .from(ingestRuns)
      .where(sql`${ingestRuns.turnIds} @> array[${first?.id}]::uuid[]`);
    await adminDb
      .update(ingestRuns)
      .set({ status: 'queued' })
      .where(eq(ingestRuns.id, oldRun?.id ?? ''));
    await indexIngestRun(
      { ingestRunId: oldRun?.id ?? '', tenantId: paul.tenantId, userId: paul.userId },
      { embedder: null },
    );
    expect(
      await adminDb
        .select()
        .from(passages)
        .where(eq(passages.turnId, first?.id ?? '')),
    ).toEqual([]);
  });

  it('le résumé reste à son auteur : un collègue avec qui la session est partagée ne le trouve pas', async () => {
    const { paul, marie } = await team();
    const seeded = await session(paul, { acl: [paul.userId, marie.userId] });

    await summarizeSession(seeded.job, { llm: answer(SUMMARY) });
    await indexRuns(paul);

    expect((await resumeTurns(seeded.sourceId))[0]?.acl).toEqual([paul.userId]);
    expect((await searchPassages(paul, { query: 'zéphyrin', embedder: null })).hits).toHaveLength(
      1,
    );
    expect((await searchPassages(marie, { query: 'zéphyrin', embedder: null })).hits).toEqual([]);
    const fetched = await fetchSource(marie, seeded.sourceId);
    expect(fetched?.turns.map((turn) => turn.text).join('\n')).not.toContain('zéphyrin');
  });

  it('des faits arrivent pendant l’écriture du résumé : ni le résumé ni les faits ne sont perdus', async () => {
    const { paul } = await team();
    const externalId = `session-${crypto.randomUUID()}`;
    const seeded = await session(paul);
    await adminDb.update(sources).set({ externalId }).where(eq(sources.id, seeded.sourceId));
    const llm: Llm = {
      ...answer(SUMMARY),
      async *streamText() {
        await recordFacts(paul, {
          kind: 'claude_code',
          external_id: externalId,
          project: PROJECT,
          accord: 2,
          usages: ['resume'],
          faits: facts({ branche: 'paul/pendant' }),
          fin: true,
        });
        yield SUMMARY;
      },
    };

    expect(await summarizeSession(seeded.job, { llm })).toBe('ecrit');

    const metadata = (await sourceRow(seeded.sourceId))?.metadata;
    expect(metadata?.branche).toBe('paul/pendant');
    expect(metadata?.resume).toMatchObject({ tour: 1 });
    expect(await resumeTurns(seeded.sourceId)).toHaveLength(1);
  });

  it('l’usage retiré pendant l’appel : rien n’est écrit', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    const llm: Llm = {
      ...answer(SUMMARY),
      async *streamText() {
        await adminDb
          .update(sources)
          .set({ metadata: sql`${sources.metadata} || '{"usages":[]}'::jsonb` })
          .where(eq(sources.id, seeded.sourceId));
        yield SUMMARY;
      },
    };

    expect(await summarizeSession(seeded.job, { llm })).toBe('sans-objet');

    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
    expect((await sourceRow(seeded.sourceId))?.metadata.resume).toBeUndefined();
    expect(mocks.runs).toEqual([]);
  });
});

// Le retrait atteint le serveur (T43, amendé le 06/11) : un résumé déjà en file, dont les faits datent de moins d'une
// heure, n'appelle plus le modèle.
describe('l’état des fils (T43)', () => {
  it('un résumé écrit met en file l’état des fils de la session, et d’eux seuls', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    const other = await session(paul);
    const filId = await seedThread(paul);
    const otherFil = await seedThread(paul);
    await adminDb
      .update(sources)
      .set({ metadata: { sessions: [{ id: seeded.sourceId, kind: 'claude_code' }] } })
      .where(eq(sources.id, filId));
    await adminDb
      .update(sources)
      .set({ metadata: { sessions: [{ id: other.sourceId, kind: 'claude_code' }] } })
      .where(eq(sources.id, otherFil));

    expect(await summarizeSession(seeded.job, { llm: answer(SUMMARY) })).toBe('ecrit');

    expect(mocks.enqueueFilMaj.mock.calls).toEqual([
      [{ tenantId: paul.tenantId, sourceId: filId, ownerUserId: paul.userId }],
    ]);
  });

  it('rien à retenir : aucun état de fil en file', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    const filId = await seedThread(paul);
    await adminDb
      .update(sources)
      .set({ metadata: { sessions: [{ id: seeded.sourceId, kind: 'claude_code' }] } })
      .where(eq(sources.id, filId));

    expect(await summarizeSession(seeded.job, { llm: answer('Rien à retenir.') })).toBe('rien');

    expect(mocks.enqueueFilMaj).not.toHaveBeenCalled();
  });
});

describe('après le retrait de l’accord', () => {
  it('un résumé en file n’appelle plus le modèle', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    const llm = answer(SUMMARY);

    await withdrawUsages(paul, 'claude_code');

    expect(await summarizeSession(seeded.job, { llm })).toBe('sans-objet');
    expect(llm.calls).toEqual([]);
    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
  });

  it('le retrait d’un autre outil ne l’arrête pas', async () => {
    const { paul } = await team();
    const seeded = await session(paul);

    await withdrawUsages(paul, 'codex');

    expect(await summarizeSession(seeded.job, { llm: answer(SUMMARY) })).toBe('ecrit');
  });
});

describe('startResumeWorker', () => {
  it('rend à pg-boss le résumé de l’erreur, jamais son message brut', async () => {
    const { paul } = await team();
    const seeded = await session(paul);
    mocks.work.mockResolvedValue('worker-id');
    const llm: Llm = {
      ...answer(SUMMARY),
      // biome-ignore lint/correctness/useYield: le modèle tombe avant le premier morceau
      async *streamText() {
        throw new SyntaxError('texte capté : On résume les sessions avec Haiku.');
      },
    };

    await startResumeWorker({ llm });
    const handler = mocks.work.mock.calls[0]?.at(-1) as (
      jobs: Array<{ data: unknown }>,
    ) => Promise<void>;

    const error = await handler([{ data: seeded.job }]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('On résume');
    expect(await resumeTurns(seeded.sourceId)).toEqual([]);
  });
});

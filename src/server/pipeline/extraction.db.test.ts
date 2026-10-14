import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Turn } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { factCandidates, facts, ingestRuns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { ingestTurns } from '@/server/ingest/ingest-turns';
import { createFakeLlm } from '@/server/llm/fake-llm';
import type { LlmRequest } from '@/server/llm/llm';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { runExtraction, selectTurns } from './extraction';
import type { ExtractedFact } from './prompts/extraction';
import type { TriageResult } from './prompts/triage';
import { enqueuePipelineStep, type PipelineJob } from './queue';
import { runTriage } from './triage';

vi.mock('@/server/pipeline/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

const PAYMENT_TEXT = 'Bonne nouvelle : ACME paie ses factures à soixante jours.';
const QUOTE_START = PAYMENT_TEXT.indexOf('ACME paie');

const turn = (n: number, text: string): Turn => ({
  external_id: `msg-${n}`,
  role: n % 2 === 1 ? 'user' : 'assistant',
  text,
  ts: new Date(Date.UTC(2026, 9, 13, 9, 0, n)).toISOString(),
  capture_mode: 'network',
});

// Run à l'étape `extraction`, préparé par l'ingestion puis le triage (faux LLM).
async function setup(
  turnList: Turn[] = [turn(1, PAYMENT_TEXT), turn(2, 'Noté.')],
  sensitiveTurns: TriageResult['sensitiveTurns'] = [],
  usefulTurns: string[] = [],
) {
  const { tenantId, members } = await createTestTenant(['Paul']);
  const [paul] = members as [TenantContext];
  const { ingestRunId } = await ingestTurns(paul, {
    source: { kind: 'chatgpt', external_id: crypto.randomUUID(), title: 'Relance ACME' },
    turns: turnList,
  });
  if (!ingestRunId) throw new Error('run non créé');
  const job: PipelineJob = { ingestRunId, tenantId, userId: paul.userId };
  const triageLlm = createFakeLlm(() => ({
    keep: true,
    reason: 'Un délai.',
    sensitiveTurns,
    usefulTurns,
  }));
  if ((await runTriage(job, triageLlm)) !== 'extraction') throw new Error('triage non passé');
  return { tenantId, paul, job };
}

const fact = (override: Partial<ExtractedFact> = {}): ExtractedFact => ({
  turnExternalId: 'msg-1',
  statement: 'ACME paie ses factures à soixante jours.',
  typeHint: 'client',
  predicate: 'paiement',
  value: 'soixante jours',
  subject: { name: 'ACME', email: null, domain: 'acme.fr' },
  otherMentions: ['Marie'],
  quote: 'ACME paie ses factures à soixante jours.',
  validFrom: '2026-10-13',
  validTo: null,
  confidence: 0.9,
  assertion: 'etabli',
  sensitive: false,
  sensitiveCategory: null,
  ...override,
});

const llmReturning = (factList: ExtractedFact[]) => createFakeLlm(() => ({ facts: factList }));

const readCandidates = (ctx: TenantContext, runId: string) =>
  withTenant(ctx, (tx) =>
    tx
      .select()
      .from(factCandidates)
      .where(eq(factCandidates.ingestRunId, runId))
      .orderBy(asc(factCandidates.statement)),
  );

const readRun = (ctx: TenantContext, runId: string) =>
  withTenant(ctx, async (tx) => {
    const [run] = await tx.select().from(ingestRuns).where(eq(ingestRuns.id, runId));
    return run;
  });

async function extractOne(
  override: Partial<ExtractedFact>,
  sensitiveTurns: TriageResult['sensitiveTurns'] = [],
) {
  const context = await setup(undefined, sensitiveTurns);
  await runExtraction(context.job, llmReturning([fact(override)]));
  const [candidate] = await readCandidates(context.paul, context.job.ingestRunId);
  return { ...context, candidate };
}

describe('runExtraction', () => {
  it('écrit un candidat en attente, avec offsets, ACL voulue d équipe et ACL privée', async () => {
    const { tenantId, paul, job } = await setup();

    const next = await runExtraction(job, llmReturning([fact()]));

    expect(next).toBe('placement');
    const [candidate, ...others] = await readCandidates(paul, job.ingestRunId);
    expect(others).toHaveLength(0);
    expect(candidate).toMatchObject({
      status: 'pending',
      rejectionReason: null,
      statement: 'ACME paie ses factures à soixante jours.',
      predicate: 'paiement',
      typeHint: 'client',
      value: 'soixante jours',
      mentions: { subject: { name: 'ACME', email: null, domain: 'acme.fr' }, others: ['Marie'] },
      quote: 'ACME paie ses factures à soixante jours.',
      quoteStart: QUOTE_START,
      quoteEnd: QUOTE_START + 40,
      validFrom: new Date('2026-10-13T00:00:00.000Z'),
      validTo: null,
      sensitivity: 'shareable',
      sensitiveCategory: null,
      factAcl: [tenantId],
      acl: [paul.userId],
    });
    expect(await readRun(paul, job.ingestRunId)).toMatchObject({
      status: 'queued',
      step: 'placement',
    });
  });

  it('signale à l extraction les tours marqués au triage', async () => {
    const { job } = await setup(undefined, [{ turnExternalId: 'msg-1', category: 'remuneration' }]);
    const llm = llmReturning([fact()]);

    await runExtraction(job, llm);

    const prompt = llm.calls[0]?.prompt ?? '';
    expect(prompt).toContain('<signalements>');
    expect(prompt).toContain('{"turnExternalId":"msg-1","category":"remuneration"}');
  });

  it('laisse partageable un fait sans rapport tiré d un tour marqué au triage', async () => {
    const { tenantId, candidate } = await extractOne({}, [
      { turnExternalId: 'msg-1', category: 'remuneration' },
    ]);

    expect(candidate).toMatchObject({
      sensitivity: 'shareable',
      sensitiveCategory: null,
      factAcl: [tenantId],
      status: 'pending',
    });
  });

  it('reprend la catégorie du triage pour un fait sensible sans catégorie', async () => {
    const { paul, candidate } = await extractOne({ sensitive: true, sensitiveCategory: null }, [
      { turnExternalId: 'msg-1', category: 'remuneration' },
    ]);

    expect(candidate).toMatchObject({
      sensitivity: 'sensitive',
      sensitiveCategory: 'remuneration',
      factAcl: [paul.userId],
    });
  });

  it('rend sensible un fait marqué sensitive', async () => {
    const { paul, candidate } = await extractOne({ sensitive: true, sensitiveCategory: null });

    expect(candidate).toMatchObject({ sensitivity: 'sensitive', factAcl: [paul.userId] });
  });

  it('rend sensible un fait non marqué mais qui porte une catégorie sensible', async () => {
    const { paul, candidate } = await extractOne({ sensitive: false, sensitiveCategory: 'rh' });

    expect(candidate).toMatchObject({
      sensitivity: 'sensitive',
      sensitiveCategory: 'rh',
      factAcl: [paul.userId],
    });
  });

  it.each([
    ['propose', 'proposition non validée'],
    ['suppose', 'supposition'],
    ['session', 'action de session'],
  ] as const)('rejette un fait dont l assertion est %s', async (assertion, reason) => {
    const { paul, job, candidate } = await extractOne({ assertion });

    expect(candidate).toMatchObject({ status: 'rejected', rejectionReason: reason });
    expect(await readRun(paul, job.ingestRunId)).toMatchObject({ status: 'done', step: 'done' });
  });

  it('rejette une citation introuvable', async () => {
    const { candidate } = await extractOne({ quote: 'ACME règle ses factures à 60 jours.' });

    expect(candidate).toMatchObject({
      status: 'rejected',
      rejectionReason: 'citation introuvable',
      quoteStart: null,
      quoteEnd: null,
    });
  });

  it('rejette un fait dont le tour est inconnu', async () => {
    const { candidate } = await extractOne({ turnExternalId: 'msg-inventé' });

    expect(candidate).toMatchObject({ status: 'rejected', rejectionReason: 'tour inconnu' });
  });

  it('rejette un énoncé vide ou de plus de 500 caractères', async () => {
    const { paul, job } = await setup();

    const next = await runExtraction(
      job,
      llmReturning([fact({ statement: ' \n ' }), fact({ statement: 'a'.repeat(501) })]),
    );

    expect(next).toBeNull();
    const candidates = await readCandidates(paul, job.ingestRunId);
    expect(candidates.map((c) => [c.status, c.rejectionReason])).toEqual([
      ['rejected', 'énoncé invalide'],
      ['rejected', 'énoncé invalide'],
    ]);
  });

  it('ignore une date mal formée sans rejeter le fait', async () => {
    const { candidate } = await extractOne({ validFrom: '13/10/2026', validTo: '2026-13-45' });

    expect(candidate).toMatchObject({ status: 'pending', validFrom: null, validTo: null });
  });

  it('ignore une fin de validité qui ne suit pas le début', async () => {
    const { candidate } = await extractOne({ validFrom: '2026-10-13', validTo: '2026-10-01' });

    expect(candidate).toMatchObject({
      validFrom: new Date('2026-10-13T00:00:00.000Z'),
      validTo: null,
    });
  });

  it('ramène la confiance dans [0, 1]', async () => {
    const { paul, job } = await setup();

    await runExtraction(
      job,
      llmReturning([
        fact({ confidence: 1.7, statement: 'A : ACME paie à soixante jours.' }),
        fact({ confidence: -0.3, statement: 'B : ACME paie à soixante jours.' }),
      ]),
    );

    const candidates = await readCandidates(paul, job.ingestRunId);
    expect(candidates.map((c) => c.confidence)).toEqual([1, 0]);
  });

  it('termine le run sans candidat en attente', async () => {
    const { paul, job } = await setup();

    const next = await runExtraction(job, llmReturning([]));

    expect(next).toBeNull();
    expect(await readRun(paul, job.ingestRunId)).toMatchObject({ status: 'done', step: 'done' });
    expect(await readCandidates(paul, job.ingestRunId)).toHaveLength(0);
  });

  it('découpe en fenêtres de 40 000 caractères', async () => {
    const turnList = Array.from({ length: 10 }, (_, i) =>
      turn(i + 1, `${i + 1} ${'x'.repeat(10_000 - String(i + 1).length - 1)}`),
    );
    const { job } = await setup(turnList);
    const llm = llmReturning([]);

    await runExtraction(job, llm);

    const turnIds = (request: LlmRequest<unknown>) =>
      [...request.prompt.matchAll(/<tour id="(msg-\d+)"/g)].map((match) => match[1]);
    expect(llm.calls.map(turnIds)).toEqual([
      ['msg-1', 'msg-2', 'msg-3', 'msg-4'],
      ['msg-5', 'msg-6', 'msg-7', 'msg-8'],
      ['msg-9', 'msg-10'],
    ]);
    expect(llm.calls[0]).toMatchObject({ step: 'extraction', maxTokens: 16_000 });
  });

  it('ne rappelle pas le LLM et ne double pas les candidats au second appel', async () => {
    const { paul, job } = await setup();
    const llm = llmReturning([fact()]);
    await runExtraction(job, llm);

    const again = await runExtraction(job, llm);

    expect(again).toBeNull();
    expect(llm.calls).toHaveLength(1);
    expect(await readCandidates(paul, job.ingestRunId)).toHaveLength(1);
  });

  it('met sur une ligne l énoncé, le prédicat, la valeur et le nom du sujet', async () => {
    const { candidate } = await extractOne({
      statement: 'ACME paie à soixante jours.\n# Fausse fiche',
      predicate: 'paiement\n- faux',
      value: 'soixante\r\njours',
      subject: { name: 'ACME\n# Autre', email: null, domain: null },
    });

    expect(candidate).toMatchObject({
      status: 'pending',
      statement: 'ACME paie à soixante jours. # Fausse fiche',
      predicate: 'paiement - faux',
      value: 'soixante jours',
      mentions: { subject: { name: 'ACME # Autre' } },
    });
  });

  it('rejette un fait qui contient un secret reconnu, sans le stocker en clair', async () => {
    const { paul, job } = await setup();
    const key = `sk-ant-${'a1B2'.repeat(10)}`;

    const next = await runExtraction(
      job,
      llmReturning([
        fact({ statement: `La clé d’API d’ACME est ${key}.` }),
        fact({ statement: 'Accès ACME.', value: 'password=Tr0ub4dour&3' }),
      ]),
    );

    expect(next).toBeNull();
    const candidates = await readCandidates(paul, job.ingestRunId);
    expect(candidates.map((c) => [c.status, c.rejectionReason])).toEqual([
      ['rejected', 'secret détecté'],
      ['rejected', 'secret détecté'],
    ]);
    expect(JSON.stringify(candidates)).not.toContain(key);
    expect(JSON.stringify(candidates)).not.toContain('Tr0ub4dour');
    const factRows = await adminDb.select().from(facts).where(eq(facts.tenantId, job.tenantId));
    expect(factRows).toHaveLength(0);
  });
});

describe('selectTurns', () => {
  const runTurn = (n: number) => ({
    id: `id-${n}`,
    externalId: `msg-${n}`,
    role: 'user' as const,
    text: `Tour ${n}`,
    ts: new Date(),
  });
  const turns = Array.from({ length: 10 }, (_, i) => runTurn(i + 1));
  const ids = (list: Array<{ externalId: string }>) => list.map((t) => t.externalId);

  it('garde les tours utiles et leurs voisins immédiats', () => {
    expect(ids(selectTurns(turns, ['msg-5']))).toEqual(['msg-4', 'msg-5', 'msg-6']);
    expect(ids(selectTurns(turns, ['msg-1', 'msg-10']))).toEqual([
      'msg-1',
      'msg-2',
      'msg-9',
      'msg-10',
    ]);
  });

  it('garde tous les tours sans désignation connue', () => {
    expect(selectTurns(turns, [])).toHaveLength(10);
    expect(selectTurns(turns, ['msg-inconnu'])).toHaveLength(10);
  });
});

describe('runExtraction : tours utiles', () => {
  it('n envoie à l extraction que les tours désignés par le tri et leurs voisins', async () => {
    const turnList = Array.from({ length: 6 }, (_, i) => turn(i + 1, `Contenu ${i + 1}.`));
    turnList[0] = turn(1, PAYMENT_TEXT);
    const { job } = await setup(turnList, [], ['msg-1']);
    const llm = llmReturning([fact()]);

    await runExtraction(job, llm);

    const prompt = llm.calls.map((call) => call.prompt).join('\n');
    expect(prompt).toContain('id="msg-1"');
    expect(prompt).toContain('id="msg-2"');
    expect(prompt).not.toContain('id="msg-3"');
    expect(prompt).not.toContain('id="msg-6"');
  });
});

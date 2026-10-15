import { DrizzleQueryError, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Turn } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { ingestTurns } from '@/server/ingest/ingest-turns';
import { createTestTenant } from '@/test/fixtures';
import { seedToolRun } from '@/test/seed-tool-run';
import { enqueuePipelineStep } from './queue';
import { advanceRun, failRun, startStep } from './runs';

vi.mock('@/server/pipeline/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

const turn = (n: number, role: Turn['role']): Turn => ({
  external_id: `msg-${n}`,
  role,
  text: `Texte du tour ${n}`,
  ts: `2026-10-13T09:0${n}:00Z`,
  capture_mode: 'network',
});

async function setup() {
  const { members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members as [TenantContext, TenantContext];
  const { ingestRunId } = await ingestTurns(paul, {
    source: { kind: 'claude_code', external_id: crypto.randomUUID(), title: 'Session ACME' },
    // Envoyés dans le désordre : le run les rend par date.
    turns: [turn(2, 'assistant'), turn(1, 'user'), turn(3, 'user')],
  });
  if (!ingestRunId) throw new Error('run non créé');
  return { paul, marie, runId: ingestRunId };
}

const readRun = (ctx: TenantContext, runId: string) =>
  withTenant(ctx, async (tx) => {
    const [run] = await tx.select().from(ingestRuns).where(eq(ingestRuns.id, runId));
    return run;
  });

describe('startStep', () => {
  it('passe le run en running et renvoie la source et ses tours par date', async () => {
    const { paul, runId } = await setup();

    const run = await startStep(paul, runId, 'triage');

    expect(run).toMatchObject({
      id: runId,
      sourceKind: 'claude_code',
      sourceTitle: 'Session ACME',
      step: 'triage',
      status: 'running',
      triage: null,
    });
    expect(run?.turns.map((t) => t.externalId)).toEqual(['msg-1', 'msg-2', 'msg-3']);
    expect(run?.turns[0]).toMatchObject({ role: 'user', text: 'Texte du tour 1' });
    expect(run?.turns[0]?.ts).toEqual(new Date('2026-10-13T09:01:00Z'));
    expect((await readRun(paul, runId))?.status).toBe('running');
  });

  it.each(['queued', 'running', 'failed'] as const)(
    'redémarre une étape courante au statut %s',
    async (status) => {
      const { paul, runId } = await setup();
      await withTenant(paul, (tx) =>
        tx.update(ingestRuns).set({ status }).where(eq(ingestRuns.id, runId)),
      );

      const run = await startStep(paul, runId, 'triage');

      expect(run).not.toBeNull();
      expect((await readRun(paul, runId))?.status).toBe('running');
    },
  );

  it('renvoie null quand l étape est déjà passée ou pas encore arrivée', async () => {
    const { paul, runId } = await setup();
    await withTenant(paul, (tx) => advanceRun(tx, runId, 'extraction'));

    expect(await startStep(paul, runId, 'triage')).toBeNull();
    expect(await startStep(paul, runId, 'placement')).toBeNull();
    expect((await readRun(paul, runId))?.status).toBe('queued');
  });

  it('ne laisse pas Marie démarrer le run de Paul', async () => {
    const { marie, paul, runId } = await setup();

    expect(await startStep(marie, runId, 'triage')).toBeNull();
    expect((await readRun(paul, runId))?.status).toBe('queued');
  });
});

describe('startStep, sources d outils', () => {
  const body = (text: string, ts: string, externalId = 'body') => ({
    externalId,
    role: 'document' as const,
    authorName: 'Marie Durand',
    text,
    ts,
    inRun: false,
  });
  const comment = {
    externalId: 'comment:1',
    role: 'participant' as const,
    authorName: 'Paul Martin',
    text: 'OK, on part là-dessus.',
    ts: '2026-10-14T10:00:00Z',
    inRun: true,
  };

  async function start(turnList: Parameters<typeof seedToolRun>[1]['turns'], nature?: unknown) {
    const { members } = await createTestTenant(['Paul']);
    const [paul] = members as [TenantContext];
    const { job } = await seedToolRun(paul, { nature, turns: turnList });
    return startStep(paul, job.ingestRunId, 'triage');
  }

  it('rend la nature, l auteur des tours et le corps absent du run comme contexte', async () => {
    const run = await start([body('Paiement à 60 jours.', '2026-10-13T09:00:00Z'), comment]);

    expect(run).toMatchObject({ sourceKind: 'github', nature: 'ticket' });
    expect(run?.turns).toHaveLength(1);
    expect(run?.turns[0]).toMatchObject({
      externalId: 'comment:1',
      role: 'participant',
      authorName: 'Paul Martin',
    });
    expect(run?.context).toBe('Paiement à 60 jours.');
  });

  it('ne met pas dans le contexte un tour du run, ni un commentaire', async () => {
    const run = await start([
      { ...body('Corps dans le run.', '2026-10-13T09:00:00Z'), inRun: true },
      { ...comment, inRun: false, externalId: 'comment:0', text: 'Un commentaire déjà connu.' },
      comment,
    ]);

    expect(run?.turns.map((t) => t.externalId)).toEqual(['body', 'comment:1']);
    expect(run?.context).toBeNull();
  });

  it('range le contexte du plus récent au plus ancien et le borne à 4 000 caractères', async () => {
    const run = await start([
      body('ancien '.repeat(300), '2026-10-01T09:00:00Z', 'body#old'),
      body('récent '.repeat(300), '2026-10-12T09:00:00Z', 'body#new'),
      comment,
    ]);

    const context = run?.context ?? '';
    expect(context.length).toBeLessThanOrEqual(4_000);
    expect(context.startsWith('récent récent')).toBe(true);
    expect(context).toContain('\n\nancien ancien');
    expect(context.endsWith('[…]')).toBe(true);
  });

  it('prend nature conversation et pas de contexte pour une conversation de capture', async () => {
    const { members } = await createTestTenant(['Paul']);
    const [paul] = members as [TenantContext];
    const { ingestRunId } = await ingestTurns(paul, {
      source: { kind: 'claude_code', external_id: crypto.randomUUID(), title: 'Session' },
      turns: [turn(1, 'user')],
    });

    const run = await startStep(paul, ingestRunId as string, 'triage');

    expect(run).toMatchObject({ nature: 'conversation', context: null });
    expect(run?.turns[0]?.authorName).toBeNull();
  });

  it('retombe sur conversation quand la nature enregistrée est inconnue', async () => {
    const run = await start([comment], 'inconnue');

    expect(run?.nature).toBe('conversation');
  });
});

describe('advanceRun', () => {
  it('met le run en file pour l étape suivante', async () => {
    const { paul, runId } = await setup();

    await withTenant(paul, (tx) => advanceRun(tx, runId, 'extraction'));

    expect(await readRun(paul, runId)).toMatchObject({ status: 'queued', step: 'extraction' });
  });

  it('termine le run avec done', async () => {
    const { paul, runId } = await setup();

    await withTenant(paul, (tx) => advanceRun(tx, runId, 'done'));

    expect(await readRun(paul, runId)).toMatchObject({ status: 'done', step: 'done' });
  });
});

describe('failRun', () => {
  it('marque le run failed avec un résumé court de l erreur', async () => {
    const { paul, runId } = await setup();

    await failRun(paul, runId, new Error('x'.repeat(500)));

    const run = await readRun(paul, runId);
    expect(run?.status).toBe('failed');
    expect(run?.step).toBe('triage');
    expect(run?.error).toBe(`Error: ${'x'.repeat(193)}`);
    expect(run?.error?.length).toBeLessThanOrEqual(200);
  });

  it('n écrit pas les paramètres d une erreur de base', async () => {
    const { paul, runId } = await setup();
    const error = new DrizzleQueryError('insert into turns …', ['zanzibar'], new Error('pg'));

    await failRun(paul, runId, error);

    const run = await readRun(paul, runId);
    expect(run?.error).toBeTruthy();
    expect(run?.error).not.toContain('zanzibar');
    expect(run?.error).not.toContain('insert into');
  });
});

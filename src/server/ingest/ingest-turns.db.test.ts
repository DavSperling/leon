import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestPayload, Turn } from '@/capture/turn';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns, sources, turns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { ingestTurns } from './ingest-turns';

vi.mock('@/server/pipeline/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

const newTurn = (n: number, override: Partial<Turn> = {}): Turn => ({
  external_id: `msg-${n}`,
  role: n % 2 === 1 ? 'user' : 'assistant',
  text: `Tour numéro ${n}`,
  ts: `2026-10-13T09:0${n}:00+02:00`,
  capture_mode: 'network',
  ...override,
});

function payload(
  externalId: string,
  turnList: Turn[],
  source: Partial<IngestPayload['source']> = {},
): IngestPayload {
  return { source: { kind: 'chatgpt', external_id: externalId, ...source }, turns: turnList };
}

async function setup() {
  const { tenantId, members } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = members as [TenantContext, TenantContext];
  return { tenantId, paul, marie, externalId: `conv-${crypto.randomUUID()}` };
}

const readSource = (ctx: TenantContext, sourceId: string) =>
  withTenant(ctx, (tx) => tx.select().from(sources).where(eq(sources.id, sourceId)));
const readTurns = (ctx: TenantContext, sourceId: string) =>
  withTenant(ctx, (tx) => tx.select().from(turns).where(eq(turns.sourceId, sourceId)));
const readRuns = (ctx: TenantContext, sourceId: string) =>
  withTenant(ctx, (tx) => tx.select().from(ingestRuns).where(eq(ingestRuns.sourceId, sourceId)));

describe('ingestTurns', () => {
  it('insère les tours, crée un run d’indexation en attente et le met en file', async () => {
    const { tenantId, paul, externalId } = await setup();

    const result = await ingestTurns(
      paul,
      payload(externalId, [newTurn(1), newTurn(2), newTurn(3)]),
    );

    expect(result).toMatchObject({ inserted: 3, skipped: 0 });
    const runs = await readRuns(paul, result.sourceId);
    expect(runs).toHaveLength(1);
    const [run] = runs;
    const stored = await readTurns(paul, result.sourceId);
    expect(run).toMatchObject({ status: 'queued', step: 'index', acl: [paul.userId] });
    expect([...(run?.turnIds ?? [])].sort()).toEqual(stored.map((t) => t.id).sort());
    expect(result.ingestRunId).toBe(run?.id);
    expect(enqueuePipelineStep).toHaveBeenCalledExactlyOnceWith('index', {
      ingestRunId: result.ingestRunId,
      tenantId,
      userId: paul.userId,
    });
  });

  it('ne crée rien quand les mêmes tours sont renvoyés', async () => {
    const { paul, externalId } = await setup();
    const body = payload(externalId, [newTurn(1), newTurn(2), newTurn(3)]);
    const first = await ingestTurns(paul, body);
    vi.mocked(enqueuePipelineStep).mockReset();

    const again = await ingestTurns(paul, body);

    expect(again).toEqual({ sourceId: first.sourceId, inserted: 0, skipped: 3, ingestRunId: null });
    expect(await readRuns(paul, first.sourceId)).toHaveLength(1);
    expect(enqueuePipelineStep).not.toHaveBeenCalled();
  });

  it("n'indexe que le nouveau tour quand la session s'allonge", async () => {
    const { paul, externalId } = await setup();
    const first = await ingestTurns(
      paul,
      payload(externalId, [newTurn(1), newTurn(2), newTurn(3)]),
    );

    const longer = await ingestTurns(
      paul,
      payload(externalId, [newTurn(1), newTurn(2), newTurn(3), newTurn(4)]),
    );

    expect(longer).toMatchObject({ sourceId: first.sourceId, inserted: 1, skipped: 3 });
    const runs = await readRuns(paul, first.sourceId);
    const newRun = runs.find((run) => run.id === longer.ingestRunId);
    const fourth = (await readTurns(paul, first.sourceId)).find((t) => t.externalId === 'msg-4');
    expect(newRun?.turnIds).toEqual([fourth?.id]);
  });

  it('garde la source et les tours à leur seul auteur', async () => {
    const { paul, marie, externalId } = await setup();
    const { sourceId } = await ingestTurns(paul, payload(externalId, [newTurn(1)]));

    expect(await readSource(paul, sourceId)).toHaveLength(1);
    expect((await readSource(paul, sourceId))[0]).toMatchObject({
      acl: [paul.userId],
      ownerUserId: paul.userId,
    });
    expect((await readTurns(paul, sourceId))[0]?.acl).toEqual([paul.userId]);
    expect(await readSource(marie, sourceId)).toHaveLength(0);
    expect(await readTurns(marie, sourceId)).toHaveLength(0);
  });

  it('masque les secrets du texte et du titre avant de stocker', async () => {
    const { paul, externalId } = await setup();
    const key = `sk-ant-${'aB3dE5gH7jK9mN1pQ2sT'.repeat(2)}`;

    const { sourceId } = await ingestTurns(
      paul,
      payload(externalId, [newTurn(1, { text: `Ma clé est ${key}, merci.` })], {
        title: `Session ${key}`,
      }),
    );

    const [source] = await readSource(paul, sourceId);
    const [turn] = await readTurns(paul, sourceId);
    expect(source?.title).toBe('Session [secret masqué]');
    expect(turn?.text).toBe('Ma clé est [secret masqué], merci.');
  });

  it('compte dans skipped un tour vide après nettoyage', async () => {
    const { paul, externalId } = await setup();
    const reminder = '<system-reminder>Rappel</system-reminder>';

    const result = await ingestTurns(
      paul,
      payload(externalId, [newTurn(1), newTurn(2, { text: reminder })]),
    );

    expect(result).toMatchObject({ inserted: 1, skipped: 1 });
    expect(await readTurns(paul, result.sourceId)).toHaveLength(1);
  });

  it('donne à chacun sa source quand deux membres envoient la même conversation', async () => {
    const { paul, marie, externalId } = await setup();
    const fromPaul = await ingestTurns(paul, payload(externalId, [newTurn(1)]));

    const fromMarie = await ingestTurns(marie, payload(externalId, [newTurn(1), newTurn(2)]));

    expect(fromMarie).toMatchObject({ inserted: 2, skipped: 0 });
    expect(fromMarie.sourceId).not.toBe(fromPaul.sourceId);
    expect((await readSource(marie, fromMarie.sourceId))[0]?.ownerUserId).toBe(marie.userId);
    expect(await readTurns(marie, fromMarie.sourceId)).toHaveLength(2);
    expect(await readTurns(paul, fromPaul.sourceId)).toHaveLength(1);
    expect(await readSource(marie, fromPaul.sourceId)).toHaveLength(0);
    expect(await readSource(paul, fromMarie.sourceId)).toHaveLength(0);

    const again = await ingestTurns(paul, payload(externalId, [newTurn(3)]));
    expect(again).toMatchObject({ sourceId: fromPaul.sourceId, inserted: 1 });
  });

  it('fixe last_turn_at au plus grand ts, même si un lot arrive dans le désordre', async () => {
    const { paul, externalId } = await setup();
    const latest = newTurn(3, { ts: '2026-10-14T10:00:00+02:00' });

    const { sourceId } = await ingestTurns(paul, payload(externalId, [latest, newTurn(1)]));
    await ingestTurns(paul, payload(externalId, [newTurn(2)]));

    const [source] = await readSource(paul, sourceId);
    expect(source?.lastTurnAt?.toISOString()).toBe('2026-10-14T08:00:00.000Z');
  });

  it('remplace le titre quand un nouveau est fourni, le garde sinon', async () => {
    const { paul, externalId } = await setup();
    const first = await ingestTurns(paul, payload(externalId, [newTurn(1)], { title: 'Ancien' }));
    await ingestTurns(paul, payload(externalId, [newTurn(2)], { title: 'Nouveau' }));
    expect((await readSource(paul, first.sourceId))[0]?.title).toBe('Nouveau');

    await ingestTurns(paul, payload(externalId, [newTurn(3)]));
    expect((await readSource(paul, first.sourceId))[0]?.title).toBe('Nouveau');
  });

  it('date l’écriture des tours reçus dans leur ordre, même quand ils ont tous la même date', async () => {
    // Un long texte découpé en morceaux (`doc:1`, `doc:2`…) arrive avec une seule date : l'ordre de lecture
    // d'une source (date du tour, puis date d'écriture) ne se retrouve que si l'écriture suit l'ordre reçu.
    const { paul, externalId } = await setup();
    const pieces = Array.from({ length: 12 }, (_, index) =>
      newTurn(1, { external_id: `doc:${index + 1}`, text: `morceau ${index + 1}` }),
    );

    const { sourceId } = await ingestTurns(paul, payload(externalId, pieces));

    const { rows } = await adminPool.query<{ external_id: string }>(
      'select external_id from turns where source_id = $1 order by created_at',
      [sourceId],
    );
    expect(rows.map((row) => row.external_id)).toEqual(pieces.map((piece) => piece.external_id));
    const distinct = await adminPool.query<{ n: string }>(
      'select count(distinct created_at) as n from turns where source_id = $1',
      [sourceId],
    );
    expect(Number(distinct.rows[0]?.n)).toBe(12);
  });

  it("n'échoue pas quand la mise en file échoue : le run reste queued", async () => {
    const { paul, externalId } = await setup();
    vi.mocked(enqueuePipelineStep).mockRejectedValueOnce(new Error('file indisponible'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await ingestTurns(paul, payload(externalId, [newTurn(1)]));

    expect(result.inserted).toBe(1);
    expect((await readRuns(paul, result.sourceId))[0]?.status).toBe('queued');
    expect(spy).toHaveBeenCalledWith('[leon]', 'ingest.enqueue', expect.any(String));
    spy.mockRestore();
  });
});

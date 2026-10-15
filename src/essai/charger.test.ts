import { describe, expect, it, vi } from 'vitest';
import type { IngestPayload } from '@/capture/turn';
import { envoyer, lots, ordreEnvoi } from './charger';
import type { ConversationEssai } from './dataset';

const tour = (id: string, ts: string) => ({
  external_id: id,
  role: 'user' as const,
  text: 'x',
  ts,
  capture_mode: 'file' as const,
});
const vide = { faits: [], pasRetenir: [], remplace: [], conflits: [] };
const conv = (cle: string, ts: string, n = 1): ConversationEssai => ({
  cle,
  personnage: cle.split('/')[0] ?? '',
  payload: {
    source: { kind: 'claude_code', external_id: `essai-${cle}` },
    turns: Array.from({ length: n }, (_, i) => tour(`t-${i}`, ts)),
  },
  attendu: vide,
});

describe('ordreEnvoi', () => {
  it('trie par date du premier tour, toutes personnes confondues', () => {
    const ordre = ordreEnvoi([
      conv('hugo/2026-09-23-b', '2026-09-23T09:00:00+02:00'),
      conv('claire/2026-09-22-a', '2026-09-22T15:00:00+02:00'),
      conv('karim/2026-09-22-c', '2026-09-22T10:00:00+02:00'),
    ]);
    expect(ordre.map((c) => c.cle)).toEqual([
      'karim/2026-09-22-c',
      'claire/2026-09-22-a',
      'hugo/2026-09-23-b',
    ]);
  });
});

describe('lots', () => {
  it('découpe une conversation de 450 tours en 200, 200, 50', () => {
    const payload = conv('hugo/2026-09-22-a', '2026-09-22T09:00:00+02:00', 450).payload;
    expect(lots(payload).map((l) => l.turns.length)).toEqual([200, 200, 50]);
    expect(lots(payload).every((l) => l.source === payload.source)).toBe(true);
  });
});

describe('envoyer', () => {
  it('envoie chaque lot avec le jeton de son personnage et compte les runs', async () => {
    const send = vi.fn(async (_token: string, _payload: IngestPayload) => ({
      sourceId: '00000000-0000-4000-8000-000000000000',
      inserted: 1,
      skipped: 0,
      ingestRunId: '00000000-0000-4000-8000-000000000001',
    }));
    const bilan = await envoyer(
      [
        conv('hugo/2026-09-22-a', '2026-09-22T09:00:00+02:00'),
        conv('claire/2026-09-22-b', '2026-09-22T10:00:00+02:00'),
      ],
      new Map([
        ['hugo', 'leon_h'],
        ['claire', 'leon_c'],
      ]),
      send,
      () => {},
    );
    expect(send.mock.calls.map(([token]) => token)).toEqual(['leon_h', 'leon_c']);
    expect(bilan).toEqual({ envois: 2, tours: 2, inseres: 2, runs: 2 });
  });

  it('refuse un personnage sans jeton', async () => {
    await expect(
      envoyer(
        [conv('nadia/2026-09-22-a', '2026-09-22T09:00:00+02:00')],
        new Map(),
        vi.fn(),
        () => {},
      ),
    ).rejects.toThrow('nadia');
  });

  it('un lot sans run (déjà vu) ne compte pas dans runs', async () => {
    const send = vi.fn(async () => ({
      sourceId: '00000000-0000-4000-8000-000000000000',
      inserted: 0,
      skipped: 1,
      ingestRunId: null,
    }));
    const bilan = await envoyer(
      [conv('hugo/2026-09-22-a', '2026-09-22T09:00:00+02:00')],
      new Map([['hugo', 'leon_h']]),
      send,
      () => {},
    );
    expect(bilan).toEqual({ envois: 1, tours: 1, inseres: 0, runs: 0 });
  });

  it('une conversation en plusieurs lots envoie chaque lot avec le même jeton', async () => {
    const send = vi.fn(async (_token: string, _payload: IngestPayload) => ({
      sourceId: '00000000-0000-4000-8000-000000000000',
      inserted: 1,
      skipped: 0,
      ingestRunId: '00000000-0000-4000-8000-000000000001',
    }));
    await envoyer(
      [conv('hugo/2026-09-22-a', '2026-09-22T09:00:00+02:00', 250)],
      new Map([['hugo', 'leon_h']]),
      send,
      () => {},
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([token]) => token)).toEqual(['leon_h', 'leon_h']);
  });

  it('interrompt l envoi avec un message nommant la conversation, le lot et les envois déjà faits', async () => {
    const panne = new Error('réseau coupé');
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        sourceId: '00000000-0000-4000-8000-000000000000',
        inserted: 1,
        skipped: 0,
        ingestRunId: '00000000-0000-4000-8000-000000000001',
      })
      .mockRejectedValueOnce(panne);

    const erreur = await envoyer(
      [conv('hugo/2026-09-22-a', '2026-09-22T09:00:00+02:00', 250)],
      new Map([['hugo', 'leon_h']]),
      send,
      () => {},
    ).catch((error: unknown) => error);

    expect(erreur).toBeInstanceOf(Error);
    expect((erreur as Error).message).toBe(
      'Envoi interrompu à hugo/2026-09-22-a, lot 2/2 (1 envois faits).',
    );
    expect((erreur as Error).cause).toBe(panne);
    expect((erreur as Error & { bilanPartiel?: unknown }).bilanPartiel).toEqual({
      envois: 1,
      tours: 200,
      inseres: 1,
      runs: 1,
    });
  });
});

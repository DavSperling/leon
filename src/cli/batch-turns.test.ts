import { describe, expect, it } from 'vitest';
import type { Turn } from '../capture/turn';
import { BATCH_MAX_BYTES, batchTurns } from './batch-turns';

const turn = (n: number, text = `Tour ${n}`): Turn => ({
  external_id: `t-${n}`,
  role: n % 2 === 1 ? 'user' : 'assistant',
  text,
  ts: '2026-10-13T08:00:00.000Z',
  capture_mode: 'file',
});

const size = (batch: Turn[]) => Buffer.byteLength(JSON.stringify(batch));

describe('batchTurns', () => {
  it('découpe 450 petits tours en lots de 200, 200 et 50, dans l’ordre', () => {
    const turns = Array.from({ length: 450 }, (_, i) => turn(i));

    const batches = batchTurns(turns, { maxTurns: 200, maxBytes: BATCH_MAX_BYTES });

    expect(batches.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(batches.flat()).toEqual(turns);
  });

  it('ne dépasse jamais maxBytes avec des tours de 300 Ko', () => {
    const turns = Array.from({ length: 7 }, (_, i) => turn(i, 'é'.repeat(300_000)));

    const batches = batchTurns(turns, { maxTurns: 200, maxBytes: BATCH_MAX_BYTES });

    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) expect(size(batch)).toBeLessThanOrEqual(BATCH_MAX_BYTES);
    expect(batches.flat()).toEqual(turns);
  });

  it('met à part un tour plus gros que maxBytes au lieu de le perdre', () => {
    const turns = [turn(1), turn(2, 'a'.repeat(500)), turn(3)];

    const batches = batchTurns(turns, { maxTurns: 200, maxBytes: 300 });

    expect(batches.map((b) => b.length)).toEqual([1, 1, 1]);
  });

  it('renvoie aucun lot pour aucun tour', () => {
    expect(batchTurns([], { maxTurns: 200, maxBytes: BATCH_MAX_BYTES })).toEqual([]);
  });
});

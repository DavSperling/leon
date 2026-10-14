import { describe, expect, it } from 'vitest';
import {
  type IngestPayload,
  IngestPayloadSchema,
  TURN_TEXT_MAX,
  TURNS_PER_BATCH_MAX,
} from './turn';

const turn = {
  external_id: 'msg-1',
  role: 'user',
  text: 'Bonjour',
  ts: '2026-10-13T09:00:00+02:00',
  capture_mode: 'network',
} as const;

const payload: IngestPayload = {
  source: { kind: 'chatgpt', external_id: 'conv-1', title: 'Relance ACME' },
  turns: [turn],
};

function withTurn(override: Record<string, unknown>) {
  return { ...payload, turns: [{ ...turn, ...override }] };
}

describe('IngestPayloadSchema', () => {
  it('accepte un envoi valide', () => {
    expect(IngestPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('refuse un tour de rôle tool', () => {
    expect(IngestPayloadSchema.safeParse(withTurn({ role: 'tool' })).success).toBe(false);
  });

  it('refuse un champ inconnu', () => {
    expect(IngestPayloadSchema.safeParse(withTurn({ extra: 1 })).success).toBe(false);
    expect(IngestPayloadSchema.safeParse({ ...payload, extra: 1 }).success).toBe(false);
  });

  it(`refuse plus de ${TURNS_PER_BATCH_MAX} tours`, () => {
    const turns = Array.from({ length: TURNS_PER_BATCH_MAX + 1 }, (_, i) => ({
      ...turn,
      external_id: `msg-${i}`,
    }));
    expect(IngestPayloadSchema.safeParse({ ...payload, turns }).success).toBe(false);
  });

  it(`refuse un texte de plus de ${TURN_TEXT_MAX} caractères`, () => {
    const text = 'a'.repeat(TURN_TEXT_MAX + 1);
    expect(IngestPayloadSchema.safeParse(withTurn({ text })).success).toBe(false);
  });

  it('refuse une date sans fuseau', () => {
    expect(IngestPayloadSchema.safeParse(withTurn({ ts: '2026-10-13T09:00:00' })).success).toBe(
      false,
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  CAPTURE_KINDS,
  type IngestPayload,
  IngestPayloadSchema,
  PROVIDER_IDS,
  SOURCE_KINDS,
  TURN_TEXT_MAX,
  TURNS_PER_BATCH_MAX,
  TurnSchema,
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

  it('accepte les quatre types de capture', () => {
    expect(CAPTURE_KINDS).toEqual(['claude_code', 'claude_ai', 'chatgpt', 'mcp_remember']);
    for (const kind of CAPTURE_KINDS) {
      const body = { ...payload, source: { ...payload.source, kind } };
      expect(IngestPayloadSchema.safeParse(body).success, kind).toBe(true);
    }
  });

  it("refuse le type d'un connecteur : la route publique ne fabrique pas de source « notion »", () => {
    for (const kind of ['notion', 'github']) {
      const body = { ...payload, source: { ...payload.source, kind } };
      expect(IngestPayloadSchema.safeParse(body).success, kind).toBe(false);
    }
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

describe('TurnSchema', () => {
  it('refuse le rôle participant, réservé aux connecteurs', () => {
    expect(TurnSchema.safeParse({ ...turn, role: 'participant' }).success).toBe(false);
    expect(TurnSchema.safeParse({ ...turn, role: 'document' }).success).toBe(false);
  });

  it('refuse le mode de capture connector', () => {
    expect(TurnSchema.safeParse({ ...turn, capture_mode: 'connector' }).success).toBe(false);
  });
});

describe('listes de types', () => {
  it('donne 39 connecteurs, sans doublon ni recouvrement avec la capture', () => {
    expect(PROVIDER_IDS).toHaveLength(39);
    expect(new Set(PROVIDER_IDS).size).toBe(39);
    for (const kind of CAPTURE_KINDS) expect(PROVIDER_IDS).not.toContain(kind);
  });

  it('SOURCE_KINDS = les types de capture puis les 39 connecteurs, sans doublon', () => {
    expect(SOURCE_KINDS).toEqual([...CAPTURE_KINDS, ...PROVIDER_IDS]);
    expect(new Set(SOURCE_KINDS).size).toBe(SOURCE_KINDS.length);
  });
});

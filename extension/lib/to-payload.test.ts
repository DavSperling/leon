import { describe, expect, it } from 'vitest';
import { IngestPayloadSchema } from '../../src/capture/turn';
import type { CapturedExchange } from './exchange';
import { exchangeToPayload } from './to-payload';

const EXCHANGE: CapturedExchange = {
  site: 'claude_ai',
  conversationId: 'conv-1',
  title: 'Devis ACME',
  user: { messageId: 'msg-u', text: 'Bonjour', ts: '2026-10-13T09:00:00.000Z' },
  assistant: { messageId: 'msg-a', text: 'Salut', ts: '2026-10-13T09:00:05.000Z' },
};

describe('exchangeToPayload', () => {
  it('range la source et les deux tours dans l’ordre', () => {
    const payload = exchangeToPayload(EXCHANGE);
    expect(payload).toEqual({
      source: { kind: 'claude_ai', external_id: 'conv-1', title: 'Devis ACME' },
      turns: [
        {
          external_id: 'msg-u',
          role: 'user',
          text: 'Bonjour',
          ts: '2026-10-13T09:00:00.000Z',
          capture_mode: 'network',
        },
        {
          external_id: 'msg-a',
          role: 'assistant',
          text: 'Salut',
          ts: '2026-10-13T09:00:05.000Z',
          capture_mode: 'network',
        },
      ],
    });
    expect(IngestPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('prend le site comme type de source', () => {
    expect(exchangeToPayload({ ...EXCHANGE, site: 'chatgpt' })?.source.kind).toBe('chatgpt');
  });

  it('omet le titre absent ou vide', () => {
    expect(exchangeToPayload({ ...EXCHANGE, title: null })?.source).not.toHaveProperty('title');
    expect(exchangeToPayload({ ...EXCHANGE, title: '  ' })?.source).not.toHaveProperty('title');
  });

  it('masque une clé d’API dans le message et dans le titre', () => {
    const key = `sk-ant-${'a1B2c3D4e5'.repeat(4)}`;
    const payload = exchangeToPayload({
      ...EXCHANGE,
      title: `Clé ${key}`,
      user: { ...EXCHANGE.user, text: `Ma clé est ${key}` },
    });
    expect(JSON.stringify(payload)).not.toContain(key);
  });

  it('retire le tour devenu vide, et renvoie null s’il n’en reste aucun', () => {
    const emptyUser = {
      ...EXCHANGE,
      user: { ...EXCHANGE.user, text: '<system-reminder>x</system-reminder>' },
    };
    expect(exchangeToPayload(emptyUser)?.turns.map((turn) => turn.role)).toEqual(['assistant']);

    const emptyBoth = {
      ...emptyUser,
      assistant: { ...EXCHANGE.assistant, text: '   ' },
    };
    expect(exchangeToPayload(emptyBoth)).toBeNull();
  });

  it('tronque un titre trop long pour le contrat', () => {
    const payload = exchangeToPayload({ ...EXCHANGE, title: 'x'.repeat(300) });
    expect(IngestPayloadSchema.safeParse(payload).success).toBe(true);
  });
});

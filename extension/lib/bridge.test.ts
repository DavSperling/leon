import { describe, expect, it, vi } from 'vitest';
import { forwardCaptureMessage } from './bridge';
import { CAPTURE_MESSAGE_SOURCE, type CapturedExchange } from './exchange';

const pageWindow = { name: 'page' };
const expected = { source: pageWindow, origin: 'https://claude.ai' };
const exchange: CapturedExchange = {
  site: 'claude_ai',
  conversationId: 'conv-1',
  title: null,
  user: { messageId: 'u-1', text: 'Bonjour', ts: '2026-10-13T09:30:00.000Z' },
  assistant: { messageId: 'a-1', text: 'Bonjour !', ts: '2026-10-13T09:30:00.000Z' },
};
const validEvent = {
  source: pageWindow,
  origin: 'https://claude.ai',
  data: { source: CAPTURE_MESSAGE_SOURCE, exchange },
};

describe('forwardCaptureMessage', () => {
  it('relaie un message valide de la page', () => {
    const send = vi.fn();
    expect(forwardCaptureMessage(validEvent, expected, send)).toBe(true);
    expect(send).toHaveBeenCalledWith({ type: 'leon/exchange', exchange });
  });

  it.each([
    ['venu d’une autre fenêtre', { ...validEvent, source: { name: 'iframe' } }],
    ['venu d’une autre origine', { ...validEvent, origin: 'https://evil.example' }],
    ['sans source leon-capture', { ...validEvent, data: { exchange } }],
    ['avec une autre source', { ...validEvent, data: { source: 'autre', exchange } }],
    [
      'hors schéma',
      {
        ...validEvent,
        data: { source: CAPTURE_MESSAGE_SOURCE, exchange: { ...exchange, site: 'gemini' } },
      },
    ],
    [
      'au texte vide',
      {
        ...validEvent,
        data: {
          source: CAPTURE_MESSAGE_SOURCE,
          exchange: { ...exchange, user: { ...exchange.user, text: '' } },
        },
      },
    ],
    [
      'd’un autre site que la page',
      {
        ...validEvent,
        data: { source: CAPTURE_MESSAGE_SOURCE, exchange: { ...exchange, site: 'chatgpt' } },
      },
    ],
    ['sans données', { ...validEvent, data: null }],
  ])('refuse un message %s', (_label, event) => {
    const send = vi.fn();
    expect(forwardCaptureMessage(event, expected, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

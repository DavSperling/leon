import { describe, expect, it, vi } from 'vitest';
import { recordExchange, relayIfAllowed } from './capture';
import type { CapturedExchange, RuntimeMessage } from './exchange';
import { createMemoryStore } from './memory-store';
import { countPending } from './outbox';
import { CONSENT_VERSION, loadStatus, saveSettings } from './settings';

const exchange: CapturedExchange = {
  site: 'claude_ai',
  conversationId: 'conv-1',
  title: null,
  user: { messageId: 'u-1', text: 'Bonjour', ts: '2026-10-13T09:30:00.000Z' },
  assistant: { messageId: 'a-1', text: 'Bonjour !', ts: '2026-10-13T09:30:00.000Z' },
};
const message: RuntimeMessage = { type: 'leon/exchange', exchange };
const CONSENT = { consentAt: '2026-10-13T09:00:00.000Z', consentVersion: CONSENT_VERSION };

const refusals = [
  ['sans consentement', {}],
  ['avec un accord sur un texte plus ancien', { consentAt: CONSENT.consentAt }],
  ['en pause', { ...CONSENT, paused: true }],
  ['avec le site coupé', { ...CONSENT, sites: { claude_ai: false, chatgpt: true } }],
] as const;

describe('relayIfAllowed', () => {
  it.each(refusals)('ne relaie rien %s', async (_label, settings) => {
    const store = createMemoryStore();
    await saveSettings(store, settings);
    const send = vi.fn();
    await relayIfAllowed(store, message, send);
    expect(send).not.toHaveBeenCalled();
  });

  it('relaie une fois quand tout est accordé', async () => {
    const store = createMemoryStore();
    await saveSettings(store, CONSENT);
    const send = vi.fn();
    await relayIfAllowed(store, message, send);
    expect(send).toHaveBeenCalledExactlyOnceWith(message);
  });

  it('avale l’échec de l’envoi (service worker absent)', async () => {
    const store = createMemoryStore();
    await saveSettings(store, CONSENT);
    await expect(
      relayIfAllowed(store, message, () => Promise.reject(new Error('no receiver'))),
    ).resolves.toBeUndefined();
  });
});

describe('recordExchange', () => {
  it.each(refusals)('ne met rien en tampon %s', async (_label, settings) => {
    const store = createMemoryStore();
    await saveSettings(store, settings);
    expect(await recordExchange(store, message)).toBe(false);
    expect(await countPending(store)).toBe(0);
  });

  it('met en tampon et note la dernière capture quand tout est accordé', async () => {
    const store = createMemoryStore();
    await saveSettings(store, CONSENT);
    expect(await recordExchange(store, message)).toBe(true);
    expect(await countPending(store)).toBe(1);
    expect((await loadStatus(store)).lastCaptureAt.claude_ai).toBeDefined();
  });

  it('met en tampon un échange au message trop long', async () => {
    const store = createMemoryStore();
    await saveSettings(store, CONSENT);
    const long = { ...exchange, user: { ...exchange.user, text: 'a'.repeat(250_000) } };
    expect(await recordExchange(store, { type: 'leon/exchange', exchange: long })).toBe(true);
    expect(await countPending(store)).toBe(1);
  });

  it('ignore un message qui n’est pas un échange', async () => {
    const store = createMemoryStore();
    await saveSettings(store, CONSENT);
    expect(await recordExchange(store, { type: 'autre' })).toBe(false);
    expect(await countPending(store)).toBe(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { recordExchange, recordRejection, relayIfAllowed } from './capture';
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
const rejection: RuntimeMessage = {
  type: 'leon/rejection',
  site: 'claude_ai',
  reason: 'incomplet',
};
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
    await relayIfAllowed(store, rejection, send);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['un échange', message],
    ['un rejet', rejection],
  ])('relaie une fois %s quand tout est accordé', async (_label, relayed) => {
    const store = createMemoryStore();
    await saveSettings(store, CONSENT);
    const send = vi.fn();
    await relayIfAllowed(store, relayed, send);
    expect(send).toHaveBeenCalledExactlyOnceWith(relayed);
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
    expect(await recordExchange(store, rejection)).toBe(false);
    expect(await countPending(store)).toBe(0);
  });
});

describe('recordRejection', () => {
  it.each(refusals)('ne note rien %s', async (_label, settings) => {
    const store = createMemoryStore();
    await saveSettings(store, settings);
    expect(await recordRejection(store, rejection)).toBe(false);
    expect((await loadStatus(store)).lastRejection).toEqual({});
  });

  it('note la raison et l’heure du site, sans rien mettre en tampon ni rien envoyer', async () => {
    const store = createMemoryStore();
    await saveSettings(store, CONSENT);
    expect(await recordRejection(store, { ...rejection, text: 'CONTENU-CACHE' })).toBe(true);
    const status = await loadStatus(store);
    expect(status.lastRejection).toEqual({
      claude_ai: { reason: 'incomplet', at: expect.any(String) },
    });
    expect(JSON.stringify(status)).not.toContain('CONTENU-CACHE');
    expect(await countPending(store)).toBe(0);
  });

  it.each([
    ['un échange', message],
    ['un rejet à la raison inconnue', { ...rejection, reason: 'autre' }],
    ['un rejet d’un site inconnu', { ...rejection, site: 'gemini' }],
    ['un autre message', { type: 'autre' }],
  ])('ignore %s', async (_label, other) => {
    const store = createMemoryStore();
    await saveSettings(store, CONSENT);
    expect(await recordRejection(store, other)).toBe(false);
    expect((await loadStatus(store)).lastRejection).toEqual({});
  });
});

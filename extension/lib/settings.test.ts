import { describe, expect, it } from 'vitest';
import { createMemoryStore } from './memory-store';
import {
  type CaptureStatus,
  CONSENT_VERSION,
  canCapture,
  hasConsent,
  loadSettings,
  rejectionToShow,
  SETTINGS_KEY,
  type Settings,
  saveSettings,
} from './settings';

const CONSENTED: Settings = {
  token: null,
  consentAt: '2026-10-13T09:00:00.000Z',
  consentVersion: CONSENT_VERSION,
  sites: { claude_ai: true, chatgpt: true },
  paused: false,
};

describe('loadSettings', () => {
  it('renvoie les défauts sur un magasin vide', async () => {
    expect(await loadSettings(createMemoryStore())).toEqual({
      token: null,
      consentAt: null,
      consentVersion: 0,
      sites: { claude_ai: true, chatgpt: true },
      paused: false,
    });
  });
});

describe('saveSettings', () => {
  it('garde les champs non fournis', async () => {
    const store = createMemoryStore();
    await saveSettings(store, {
      consentAt: '2026-10-13T09:00:00.000Z',
      consentVersion: CONSENT_VERSION,
    });
    const saved = await saveSettings(store, { paused: true });
    expect(saved).toEqual({ ...CONSENTED, paused: true });
    expect(await loadSettings(store)).toEqual(saved);
  });
});

describe('canCapture', () => {
  it('est faux sans consentement', () => {
    expect(canCapture({ ...CONSENTED, consentAt: null }, 'claude_ai')).toBe(false);
  });

  it('est faux en pause', () => {
    expect(canCapture({ ...CONSENTED, paused: true }, 'claude_ai')).toBe(false);
  });

  it('est faux quand le site est coupé, vrai pour les autres', () => {
    const settings = { ...CONSENTED, sites: { claude_ai: false, chatgpt: true } };
    expect(canCapture(settings, 'claude_ai')).toBe(false);
    expect(canCapture(settings, 'chatgpt')).toBe(true);
  });

  it('est vrai avec consentement, sans pause, site actif', () => {
    expect(canCapture(CONSENTED, 'chatgpt')).toBe(true);
  });

  // Le texte de l'écran de consentement a changé : un accord donné sur un texte plus ancien ne couvre pas ce qu'il
  // ajoute (des passages envoyés au fournisseur du modèle pour répondre). Rien n'est capté avant le nouvel accord.
  it('est faux avec un accord donné sur une version plus ancienne du texte', () => {
    expect(canCapture({ ...CONSENTED, consentVersion: CONSENT_VERSION - 1 }, 'claude_ai')).toBe(
      false,
    );
  });

  it('est faux pour un réglage enregistré avant les versions : un accord sans numéro de version', async () => {
    const store = createMemoryStore();
    await store.set(SETTINGS_KEY, {
      token: 'leon_jeton',
      consentAt: '2026-10-13T09:00:00.000Z',
      sites: { claude_ai: true, chatgpt: true },
      paused: false,
    });

    const settings = await loadSettings(store);

    expect(settings.consentVersion).toBe(0);
    expect(canCapture(settings, 'claude_ai')).toBe(false);
    expect(canCapture(settings, 'chatgpt')).toBe(false);
  });
});

describe('rejectionToShow', () => {
  const status = (patch: Partial<CaptureStatus>): CaptureStatus => ({
    lastCaptureAt: {},
    lastRejection: { chatgpt: { reason: 'format', at: '2026-11-19T10:00:00.000Z' } },
    connection: 'connected',
    pending: 0,
    ...patch,
  });

  it('montre le dernier rejet quand rien n’a été capté depuis', () => {
    expect(rejectionToShow(status({}), 'chatgpt')).toBe('format');
    expect(
      rejectionToShow(
        status({ lastCaptureAt: { chatgpt: '2026-11-19T09:59:59.999Z' } }),
        'chatgpt',
      ),
    ).toBe('format');
  });

  it('ne montre plus le rejet une fois une capture faite après', () => {
    expect(
      rejectionToShow(
        status({ lastCaptureAt: { chatgpt: '2026-11-19T10:00:00.001Z' } }),
        'chatgpt',
      ),
    ).toBeNull();
  });

  it('ne montre que le rejet du site', () => {
    expect(rejectionToShow(status({}), 'claude_ai')).toBeNull();
  });
});

describe('hasConsent', () => {
  it('ne vaut que pour un accord donné sur la version actuelle du texte, ou une plus récente', () => {
    expect(hasConsent(CONSENTED)).toBe(true);
    expect(hasConsent({ ...CONSENTED, consentVersion: CONSENT_VERSION + 1 })).toBe(true);
    expect(hasConsent({ ...CONSENTED, consentVersion: CONSENT_VERSION - 1 })).toBe(false);
    expect(hasConsent({ ...CONSENTED, consentAt: null })).toBe(false);
  });
});

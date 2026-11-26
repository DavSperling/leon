import { describe, expect, it } from 'vitest';
import {
  type Access,
  checkAccess,
  connectionToShow,
  dropCauseToShow,
  siteNoticeToShow,
} from './access';
import { hostPermissionsFor } from './permissions';
import { type CaptureStatus, CONSENT_VERSION, type Settings } from './settings';

const SERVER_URL = 'https://leonmemory.com';
const ALL: Access = { server: true, claude_ai: true, chatgpt: true };

const CONFIGURED: Settings = {
  token: 'leon_jeton-invente',
  consentAt: '2026-11-24T09:00:00.000Z',
  consentVersion: CONSENT_VERSION,
  sites: { claude_ai: true, chatgpt: true },
  paused: false,
};

const status = (patch: Partial<CaptureStatus> = {}): CaptureStatus => ({
  lastCaptureAt: {},
  lastRejection: {},
  connection: 'unreachable',
  pending: 1,
  ...patch,
});

describe('checkAccess', () => {
  it('demande chaque origine du manifeste, une par une', async () => {
    const asked: unknown[] = [];
    await checkAccess(SERVER_URL, async (permissions) => {
      asked.push(permissions);
      return true;
    });
    expect(asked).toEqual(
      expect.arrayContaining(
        hostPermissionsFor(SERVER_URL).map((origin) => ({ origins: [origin] })),
      ),
    );
    expect(asked).toHaveLength(3);
  });

  it('dit quel accès manque', async () => {
    const access = await checkAccess(
      SERVER_URL,
      async ({ origins }) => origins[0] !== 'https://leonmemory.com/*',
    );
    expect(access).toEqual({ server: false, claude_ai: true, chatgpt: true });
    expect(
      await checkAccess(SERVER_URL, async ({ origins }) => origins[0] !== 'https://chatgpt.com/*'),
    ).toEqual({ server: true, claude_ai: true, chatgpt: false });
  });

  it('suit le serveur de la version', async () => {
    const access = await checkAccess(
      'http://localhost:3000',
      async ({ origins }) => origins[0] !== 'http://localhost:3000/*',
    );
    expect(access.server).toBe(false);
  });

  it('compte l’accès comme là si l’API manque, lève ou rend autre chose que false', async () => {
    const absent = undefined as unknown as { contains: () => Promise<boolean> };
    expect(await checkAccess(SERVER_URL, () => absent.contains())).toEqual(ALL);
    expect(await checkAccess(SERVER_URL, async () => Promise.reject(new Error('refus')))).toEqual(
      ALL,
    );
    expect(await checkAccess(SERVER_URL, async () => undefined)).toEqual(ALL);
    expect(await checkAccess(SERVER_URL, async () => 'non')).toEqual(ALL);
  });
});

describe('connectionToShow', () => {
  const noServer: Access = { ...ALL, server: false };

  it('l’accès au serveur retiré remplace « injoignable », « connecté » et « vérification »', () => {
    for (const connection of ['unreachable', 'connected', 'unknown'] as const) {
      expect(connectionToShow(CONFIGURED, status({ connection }), noServer)).toBe('access_removed');
    }
  });

  it('les accès présents laissent l’état d’aujourd’hui', () => {
    expect(connectionToShow(CONFIGURED, status(), ALL)).toBe('unreachable');
    expect(connectionToShow(CONFIGURED, status({ connection: 'connected' }), ALL)).toBe(
      'connected',
    );
  });

  it('en pause, non configuré et jeton refusé gardent leur priorité', () => {
    expect(connectionToShow({ ...CONFIGURED, paused: true }, status(), noServer)).toBe('paused');
    expect(connectionToShow({ ...CONFIGURED, paused: true, token: null }, status(), noServer)).toBe(
      'paused',
    );
    expect(connectionToShow({ ...CONFIGURED, token: null }, status(), noServer)).toBe(
      'not_configured',
    );
    expect(connectionToShow({ ...CONFIGURED, consentVersion: 0 }, status(), noServer)).toBe(
      'not_configured',
    );
    expect(connectionToShow(CONFIGURED, status({ connection: 'not_configured' }), noServer)).toBe(
      'not_configured',
    );
    expect(connectionToShow(CONFIGURED, status({ connection: 'unauthorized' }), noServer)).toBe(
      'unauthorized',
    );
  });

  it('un site retiré ne change pas l’état de la connexion', () => {
    expect(connectionToShow(CONFIGURED, status(), { ...ALL, chatgpt: false })).toBe('unreachable');
  });
});

describe('siteNoticeToShow', () => {
  const rejected = status({
    lastRejection: { chatgpt: { reason: 'format', at: '2026-11-24T09:30:00.000Z' } },
  });

  it('l’accès retiré à un site prend la place de son dernier rejet', () => {
    expect(siteNoticeToShow(rejected, 'chatgpt', { ...ALL, chatgpt: false })).toBe(
      'access_removed',
    );
    expect(siteNoticeToShow(status(), 'claude_ai', { ...ALL, claude_ai: false })).toBe(
      'access_removed',
    );
  });

  it('sinon, le dernier rejet comme aujourd’hui ; l’autre site n’est pas touché', () => {
    expect(siteNoticeToShow(rejected, 'chatgpt', ALL)).toBe('format');
    expect(siteNoticeToShow(rejected, 'claude_ai', { ...ALL, chatgpt: false })).toBeNull();
    expect(siteNoticeToShow(rejected, 'chatgpt', { ...ALL, server: false })).toBe('format');
  });
});

describe('dropCauseToShow', () => {
  it('le tampon plein sans l’accès au serveur dit l’accès retiré, pas le serveur injoignable', () => {
    expect(dropCauseToShow('full', { ...ALL, server: false })).toBe('full_access_removed');
  });

  it('sinon, la cause d’aujourd’hui', () => {
    expect(dropCauseToShow('full', ALL)).toBe('full');
    expect(dropCauseToShow('full', { ...ALL, chatgpt: false })).toBe('full');
    expect(dropCauseToShow('refused', { ...ALL, server: false })).toBe('refused');
    expect(dropCauseToShow('token', { ...ALL, server: false })).toBe('token');
  });
});

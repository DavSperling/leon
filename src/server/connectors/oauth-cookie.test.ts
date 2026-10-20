import { describe, expect, it, vi } from 'vitest';
import { type OAuthPending, openPending, sealPending } from './oauth-cookie';

const NOW = Date.UTC(2026, 9, 15, 10, 0, 0);

const pending: OAuthPending = {
  provider: 'github',
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  state: 'etat-aleatoire',
  verifier: 'verificateur-pkce',
  since: '30',
  preFields: { repos: ['acme/leon'] },
  reconnectId: null,
  createdAt: NOW,
};

describe('cookie de l’aller-retour OAuth', () => {
  it('se relit tel qu’il a été scellé', () => {
    expect(openPending(sealPending(pending), NOW + 1000)).toEqual(pending);
  });

  it('refuse une signature modifiée', () => {
    const [body = '', signature = ''] = sealPending(pending).split('.');
    const flipped = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    expect(openPending(`${body}.${flipped}`, NOW)).toBeNull();
  });

  it('refuse un contenu modifié sous la même signature', () => {
    const [, signature = ''] = sealPending(pending).split('.');
    const forged = Buffer.from(JSON.stringify({ ...pending, userId: 'autre' })).toString(
      'base64url',
    );
    expect(openPending(`${forged}.${signature}`, NOW)).toBeNull();
  });

  it('refuse un cookie de plus de 10 minutes', () => {
    const cookie = sealPending(pending);
    expect(openPending(cookie, NOW + 600_000)).not.toBeNull();
    expect(openPending(cookie, NOW + 601_000)).toBeNull();
  });

  it('refuse un cookie daté du futur', () => {
    expect(openPending(sealPending(pending), NOW - 60_000)).toBeNull();
  });

  it.each(['', 'abc', 'a.b.c', '.', 'x.y', '%%%.%%%'])(
    'refuse le contenu illisible %j',
    (value) => {
      expect(openPending(value, NOW)).toBeNull();
    },
  );

  it('refuse un contenu bien signé mais qui n’a pas la forme attendue', () => {
    const cookie = sealPending({ ...pending, since: '12' as never });
    expect(openPending(cookie, NOW)).toBeNull();
  });

  it('ne contient aucun secret d’appli', () => {
    vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', 'secret-d-appli-xyz');
    const cookie = sealPending(pending);
    expect(cookie).not.toContain('secret-d-appli-xyz');
    expect(Buffer.from(cookie.split('.')[0] ?? '', 'base64url').toString()).not.toContain(
      'secret-d-appli-xyz',
    );
    vi.unstubAllEnvs();
  });
});

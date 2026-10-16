import { describe, expect, it } from 'vitest';
import { isRailOpen, RAIL_COOKIE, railCookie } from './rail-cookie';

describe('cookie de la barre latérale', () => {
  it('l’ouvre par défaut et pour toute valeur inconnue', () => {
    expect(isRailOpen(undefined)).toBe(true);
    expect(isRailOpen('ouvert')).toBe(true);
    expect(isRailOpen('n’importe quoi')).toBe(true);
  });

  it('ne la ferme que pour « ferme »', () => {
    expect(isRailOpen('ferme')).toBe(false);
  });

  it('écrit une valeur que le serveur relit à l’identique', () => {
    for (const open of [true, false]) {
      const value = railCookie(open).split(';')[0]?.split('=')[1];
      expect(isRailOpen(value)).toBe(open);
    }
  });

  it('vaut pour tout le site, un an, sans suivre les liens externes', () => {
    const cookie = railCookie(false);
    expect(cookie.startsWith(`${RAIL_COOKIE}=`)).toBe(true);
    expect(cookie).toContain('path=/');
    expect(cookie).toContain('max-age=31536000');
    expect(cookie).toContain('SameSite=Lax');
  });
});

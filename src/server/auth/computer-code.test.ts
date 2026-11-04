import { createHmac, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { env } from '@/server/env';
import { signComputerCode, signPayload, verifyComputerCode, verifyPayload } from './computer-code';

const NOW = Date.UTC(2026, 10, 3, 10, 0, 0); // une seconde entière : l'expiration tombe pile
const SECRET = 'un-secret-de-test-un-secret-de-test-0001';
const OTHER_SECRET = 'un-autre-secret-un-autre-secret-0002';
const FINGERPRINT = 'a'.repeat(64);
const CLAIMS = {
  e: FINGERPRINT,
  u: '11111111-1111-4111-8111-111111111111',
  t: '22222222-2222-4222-8222-222222222222',
};
const OPTS = { secret: SECRET, now: NOW };

// K4 recalculé ici, hors du code testé : la clé HKDF-SHA256 (sel vide, info « leon:ordinateur:v1 », 32 octets),
// puis le HMAC-SHA256 de la charge sous sa forme base64url. C'est ce que S04 relira, octet pour octet.
const signed = (payload: unknown, secret = SECRET) => {
  const body = Buffer.from(
    typeof payload === 'string' ? payload : JSON.stringify(payload),
  ).toString('base64url');
  const key = Buffer.from(hkdfSync('sha256', secret, '', 'leon:ordinateur:v1', 32));
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
};
const GOOD = { v: 1, ...CLAIMS, x: NOW / 1000 + 120 };

describe('code signé de l’ordinateur', () => {
  it('se relit tel qu’il a été signé, avec une expiration à 2 minutes', () => {
    const code = signComputerCode(CLAIMS, OPTS);
    expect(verifyComputerCode(code, OPTS)).toEqual({ v: 1, ...CLAIMS, x: NOW / 1000 + 120 });
  });

  it('suit K4 : charge JSON puis HMAC, deux parties en base64url', () => {
    const code = signComputerCode(CLAIMS, OPTS);
    expect(code).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(code).toBe(signed(GOOD));
    const [body = ''] = code.split('.');
    expect(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))).toEqual(GOOD);
  });

  it('prend BETTER_AUTH_SECRET et l’heure réelle par défaut', () => {
    const code = signComputerCode(CLAIMS);
    const payload = verifyComputerCode(code);
    expect(payload).toMatchObject(CLAIMS);
    expect(code).toBe(signed(payload, env.BETTER_AUTH_SECRET));
    expect(verifyComputerCode(code, { secret: SECRET })).toBeNull();
    expect(Math.abs((payload?.x ?? 0) - (Date.now() / 1000 + 120))).toBeLessThan(5);
  });

  it('refuse un octet changé, n’importe où dans la charge ou dans la signature', () => {
    const code = signComputerCode(CLAIMS, OPTS);
    for (let i = 0; i < code.length; i++) {
      if (code[i] === '.') continue;
      const swapped = code[i] === 'A' ? 'B' : 'A';
      expect(verifyComputerCode(code.slice(0, i) + swapped + code.slice(i + 1), OPTS)).toBeNull();
    }
  });

  it('refuse une charge modifiée sous la signature d’origine', () => {
    const [, signature = ''] = signComputerCode(CLAIMS, OPTS).split('.');
    const forged = Buffer.from(JSON.stringify({ ...GOOD, u: 'autre' })).toString('base64url');
    expect(verifyComputerCode(`${forged}.${signature}`, OPTS)).toBeNull();
  });

  it('refuse un code expiré d’une seconde, accepte celui de 2 minutes pile', () => {
    const code = signComputerCode(CLAIMS, OPTS);
    expect(verifyComputerCode(code, { ...OPTS, now: NOW + 119_000 })).not.toBeNull();
    expect(verifyComputerCode(code, { ...OPTS, now: NOW + 120_000 })).not.toBeNull();
    expect(verifyComputerCode(code, { ...OPTS, now: NOW + 121_000 })).toBeNull();
  });

  it('refuse une clé dérivée d’un autre secret', () => {
    const code = signComputerCode(CLAIMS, OPTS);
    expect(verifyComputerCode(code, { ...OPTS, secret: OTHER_SECRET })).toBeNull();
    expect(verifyComputerCode(signed(GOOD, OTHER_SECRET), OPTS)).toBeNull();
  });

  it('accepte une charge forgée à la main, pourvu qu’elle soit bien signée', () => {
    expect(verifyComputerCode(signed(GOOD), OPTS)).toEqual(GOOD);
  });

  it.each([
    ['une version autre que 1', { ...GOOD, v: 2 }],
    ['pas de version', { e: GOOD.e, u: GOOD.u, t: GOOD.t, x: GOOD.x }],
    ['une empreinte de 63 caractères', { ...GOOD, e: 'a'.repeat(63) }],
    ['une empreinte de 65 caractères', { ...GOOD, e: 'a'.repeat(65) }],
    ['une empreinte en majuscules', { ...GOOD, e: 'A'.repeat(64) }],
    ['une empreinte non hexadécimale', { ...GOOD, e: 'g'.repeat(64) }],
    ['une empreinte qui n’est pas du texte', { ...GOOD, e: 7 }],
    ['pas d’utilisateur', { ...GOOD, u: '' }],
    ['pas d’espace', { v: 1, e: GOOD.e, u: GOOD.u, x: GOOD.x }],
    ['une expiration en texte', { ...GOOD, x: String(GOOD.x) }],
    ['une expiration fractionnaire', { ...GOOD, x: GOOD.x + 0.5 }],
    ['une expiration absente', { v: 1, e: GOOD.e, u: GOOD.u, t: GOOD.t }],
    ['un champ en trop', { ...GOOD, admin: true }],
    ['une charge qui est un tableau', [GOOD]],
    ['une charge nulle', null],
  ])('refuse, même bien signée : %s', (_, payload) => {
    expect(verifyComputerCode(signed(payload), OPTS)).toBeNull();
  });

  it('refuse, même bien signée, une charge qui n’est pas du JSON', () => {
    expect(verifyComputerCode(signed('pas du json'), OPTS)).toBeNull();
    expect(verifyComputerCode(signed(''), OPTS)).toBeNull();
  });

  it.each(['', 'abc', '.', 'a.', '.b', 'a.b.c', 'x.y', '%%%.%%%', ' '])(
    'refuse le contenu illisible %j',
    (code) => {
      expect(verifyComputerCode(code, OPTS)).toBeNull();
    },
  );
});

// La signature générale (M02) : même forme que K4, une clé par but (info « leon:<but>:v1 »). Recalculée ici, hors du code testé.
const signedFor = (purpose: string, payload: unknown, secret = SECRET) => {
  const body = Buffer.from(
    typeof payload === 'string' ? payload : JSON.stringify(payload),
  ).toString('base64url');
  const key = Buffer.from(hkdfSync('sha256', secret, '', `leon:${purpose}:v1`, 32));
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
};
const CLIENT = { v: 1, n: 'Claude', r: ['https://claude.ai/api/mcp/auth_callback'], i: NOW / 1000 };
const AUTH_CODE = {
  v: 1,
  j: 'abc',
  c: 'f'.repeat(64),
  u: CLAIMS.u,
  t: CLAIMS.t,
  x: NOW / 1000 + 120,
};

describe('signature générale par but', () => {
  it('se relit tel qu’elle a été signée, sans expiration quand la charge n’a pas de x', () => {
    const value = signPayload('oauth-client', CLIENT, OPTS);
    expect(value).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyPayload('oauth-client', value, OPTS)).toEqual(CLIENT);
    expect(
      verifyPayload('oauth-client', value, { ...OPTS, now: NOW + 10 * 365 * 86_400_000 }),
    ).toEqual(CLIENT);
  });

  it('suit K4 avec l’info « leon:<but>:v1 »', () => {
    expect(signPayload('oauth-code', AUTH_CODE, OPTS)).toBe(signedFor('oauth-code', AUTH_CODE));
    expect(signPayload('oauth-client', CLIENT, OPTS)).toBe(signedFor('oauth-client', CLIENT));
    expect(signPayload('ordinateur', GOOD, OPTS)).toBe(signed(GOOD));
  });

  it('prend BETTER_AUTH_SECRET et l’heure réelle par défaut', () => {
    const value = signPayload('oauth-client', CLIENT);
    expect(value).toBe(signedFor('oauth-client', CLIENT, env.BETTER_AUTH_SECRET));
    expect(verifyPayload('oauth-client', value)).toEqual(CLIENT);
    expect(verifyPayload('oauth-client', value, { secret: SECRET })).toBeNull();
    const code = signPayload('oauth-code', { ...AUTH_CODE, x: Date.now() / 1000 - 5 });
    expect(verifyPayload('oauth-code', code)).toBeNull();
  });

  it('refuse un octet changé, n’importe où dans la charge ou dans la signature', () => {
    const value = signPayload('oauth-code', AUTH_CODE, OPTS);
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '.') continue;
      const swapped = value[i] === 'A' ? 'B' : 'A';
      expect(
        verifyPayload('oauth-code', value.slice(0, i) + swapped + value.slice(i + 1), OPTS),
      ).toBeNull();
    }
  });

  it('refuse une charge expirée d’une seconde, accepte celle qui expire pile', () => {
    const value = signPayload('oauth-code', AUTH_CODE, OPTS);
    expect(verifyPayload('oauth-code', value, { ...OPTS, now: NOW + 120_000 })).toEqual(AUTH_CODE);
    expect(verifyPayload('oauth-code', value, { ...OPTS, now: NOW + 121_000 })).toBeNull();
  });

  it.each([
    ['en texte', '"1793700000"'],
    ['nulle', 'null'],
    ['infinie', '1e999'], // JSON.parse la lit comme Infinity : elle n’expirerait jamais
  ])('refuse, même bien signée, une expiration %s', (_, x) => {
    expect(
      verifyPayload('oauth-code', signedFor('oauth-code', `{"v":1,"x":${x}}`), OPTS),
    ).toBeNull();
  });

  it('refuse un autre but : un client_id n’est pas un code, ni un code d’ordinateur un code OAuth', () => {
    const clientId = signPayload('oauth-client', CLIENT, OPTS);
    const oauthCode = signPayload('oauth-code', AUTH_CODE, OPTS);
    const computerCode = signComputerCode(CLAIMS, OPTS);
    expect(verifyPayload('oauth-code', clientId, OPTS)).toBeNull();
    expect(verifyPayload('oauth-code', computerCode, OPTS)).toBeNull();
    expect(verifyPayload('oauth-client', oauthCode, OPTS)).toBeNull();
    expect(verifyComputerCode(oauthCode, OPTS)).toBeNull();
    expect(verifyPayload('ordinateur', computerCode, OPTS)).toEqual(GOOD);
  });

  it('refuse une clé dérivée d’un autre secret', () => {
    const value = signPayload('oauth-code', AUTH_CODE, OPTS);
    expect(verifyPayload('oauth-code', value, { ...OPTS, secret: OTHER_SECRET })).toBeNull();
    expect(
      verifyPayload('oauth-code', signedFor('oauth-code', AUTH_CODE, OTHER_SECRET), OPTS),
    ).toBeNull();
  });

  it.each([
    ['un tableau', [CLIENT]],
    ['null', null],
    ['un nombre', 7],
    ['du texte', 'pas un objet'],
  ])('refuse, même bien signée, une charge qui est %s', (_, payload) => {
    expect(verifyPayload('oauth-client', signedFor('oauth-client', payload), OPTS)).toBeNull();
  });

  it('refuse, même bien signée, une charge qui n’est pas du JSON', () => {
    expect(
      verifyPayload('oauth-client', signedFor('oauth-client', 'pas du json'), OPTS),
    ).toBeNull();
    expect(verifyPayload('oauth-client', signedFor('oauth-client', ''), OPTS)).toBeNull();
  });

  it.each(['', 'abc', '.', 'a.', '.b', 'a.b.c', 'x.y', '%%%.%%%', ' '])(
    'refuse le contenu illisible %j',
    (value) => {
      expect(verifyPayload('oauth-client', value, OPTS)).toBeNull();
    },
  );

  it.each(['', 'OAuth', 'oauth_code', 'oauth:code', 'oauth code', 'oauth2'])(
    'refuse le but %j, qui n’est pas [a-z-]+',
    (purpose) => {
      expect(() => signPayload(purpose, CLIENT, OPTS)).toThrow();
      expect(() => verifyPayload(purpose, 'a.b', OPTS)).toThrow();
    },
  );
});

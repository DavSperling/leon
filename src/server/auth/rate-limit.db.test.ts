import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';
import { AUTH_LIMITS, authAttemptAllowed } from './rate-limit';

// Audit 2 n° 3 : la connexion et l'inscription passent par une limite de débit par adresse IP et par e-mail, en
// base (0021) : elle tient avec plusieurs instances.

const email = () => `paul-${randomUUID()}@example.com`;
// Une adresse IP de test par cas : les cas ne partagent pas leur compteur.
const ip = () => `10.${[1, 2, 3].map(() => Math.floor(Math.random() * 250)).join('.')}`;
// L'en-tête que pose le proxy de confiance (LEON_IP_HEADER de TEST_ENV, comme Caddy en production).
const from = (address: string) => new Headers({ 'x-real-ip': address });

async function attempts(
  kind: 'connexion' | 'inscription',
  count: number,
  mail: string,
  address: string,
) {
  const results: boolean[] = [];
  for (let i = 0; i < count; i += 1)
    results.push(await authAttemptAllowed(kind, mail, from(address)));
  return results;
}

describe('authAttemptAllowed', () => {
  it('refuse la connexion au-delà du plafond par e-mail, même depuis une autre adresse IP', async () => {
    const mail = email();
    const max = AUTH_LIMITS.connexion.email;

    const allowed = await Promise.all(
      Array.from({ length: max }, () => authAttemptAllowed('connexion', mail, from(ip()))),
    );

    expect(allowed.every(Boolean)).toBe(true);
    expect(await authAttemptAllowed('connexion', mail.toUpperCase(), from(ip()))).toBe(false);
    expect(await authAttemptAllowed('connexion', email(), from(ip()))).toBe(true);
  });

  it('refuse la connexion au-delà du plafond par adresse IP, quel que soit l’e-mail', async () => {
    const address = ip();
    const max = AUTH_LIMITS.connexion.ip;

    for (let i = 0; i < max; i += 1) {
      expect(await authAttemptAllowed('connexion', email(), from(address))).toBe(true);
    }

    expect(await authAttemptAllowed('connexion', email(), from(address))).toBe(false);
    expect(await authAttemptAllowed('connexion', email(), from(ip()))).toBe(true);
  });

  it('compte l’inscription à part de la connexion', async () => {
    const mail = email();
    const address = ip();
    const max = AUTH_LIMITS.inscription.email;

    expect(await attempts('inscription', max, mail, address)).toEqual(Array(max).fill(true));
    expect(await authAttemptAllowed('inscription', mail, from(address))).toBe(false);
    expect(await authAttemptAllowed('connexion', mail, from(address))).toBe(true);
  });

  // L'envoi d'une invitation compte aussi la personne qui envoie : changer d'invité et d'adresse IP n'y change rien.
  it('refuse les invitations au-delà du plafond par personne qui envoie', async () => {
    const author = randomUUID();
    const max = AUTH_LIMITS.invitation.ip;

    for (let i = 0; i < max; i += 1) {
      expect(await authAttemptAllowed('invitation', email(), from(ip()), author)).toBe(true);
    }

    expect(await authAttemptAllowed('invitation', email(), from(ip()), author)).toBe(false);
    expect(await authAttemptAllowed('invitation', email(), from(ip()), randomUUID())).toBe(true);
  });

  it('ne garde ni l’e-mail ni l’adresse IP en clair', async () => {
    const mail = email();
    const address = ip();

    await authAttemptAllowed('connexion', mail, from(address));

    const { rows } = await adminPool.query(
      'select cle from limites_de_debit where cle like $1 or cle like $2',
      [`%${mail}%`, `%${address}%`],
    );
    expect(rows).toEqual([]);
  });
});

// Audit 3 n° 11 : l'adresse IP vient du seul en-tête que pose le proxy de confiance (LEON_IP_HEADER). Un en-tête
// choisi par le client n'ouvre pas de compteur neuf, et une adresse inconnue compte sur une clé commune, à plafond
// haut, au lieu de n'être pas comptée du tout.
describe('authAttemptAllowed, adresse inconnue', () => {
  const COMMON = ['connexion:ip:inconnue', 'inscription:ip:inconnue'];
  const resetCommon = () =>
    adminPool.query('delete from limites_de_debit where cle = any($1)', [COMMON]);
  beforeEach(resetCommon);
  afterAll(resetCommon);

  it('ne lit pas un X-Forwarded-For choisi par le client : chaque valeur compte sur la clé commune', async () => {
    const max = AUTH_LIMITS.inscription.inconnue;

    const allowed = await Promise.all(
      Array.from({ length: max }, () =>
        authAttemptAllowed('inscription', email(), new Headers({ 'x-forwarded-for': ip() })),
      ),
    );

    expect(allowed.every(Boolean)).toBe(true);
    expect(
      await authAttemptAllowed('inscription', email(), new Headers({ 'x-forwarded-for': ip() })),
    ).toBe(false);
    // Une adresse posée par le proxy garde son propre compteur.
    expect(await authAttemptAllowed('inscription', email(), from(ip()))).toBe(true);
  });

  it('compte sur la clé commune une adresse absente, illisible ou en liste', async () => {
    const max = AUTH_LIMITS.connexion.inconnue;
    const unknown = [
      new Headers(),
      new Headers({ 'x-real-ip': 'pas-une-adresse' }),
      new Headers({ 'x-real-ip': `${ip()}, ${ip()}` }),
    ];

    for (let i = 0; i < max; i += 50) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(50, max - i) }, (_, j) =>
          authAttemptAllowed(
            'connexion',
            email(),
            unknown[(i + j) % unknown.length] ?? new Headers(),
          ),
        ),
      );
      expect(batch.every(Boolean)).toBe(true);
    }

    expect(await authAttemptAllowed('connexion', email(), new Headers())).toBe(false);
    expect(AUTH_LIMITS.connexion.inconnue).toBeGreaterThan(AUTH_LIMITS.connexion.ip);
  });
});

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';
import { AUTH_LIMITS, authAttemptAllowed } from './rate-limit';

// Audit 2 n° 3 : la connexion et l'inscription passent par une limite de débit par adresse IP et par e-mail, en
// base (0021) : elle tient avec plusieurs instances.

const email = () => `paul-${randomUUID()}@example.com`;
// Une adresse IP de test par cas : les cas ne partagent pas leur compteur.
const ip = () => `10.${[1, 2, 3].map(() => Math.floor(Math.random() * 250)).join('.')}`;
const from = (address: string) => new Headers({ 'x-forwarded-for': address });

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

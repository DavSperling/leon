import { describe, expect, it } from 'vitest';
import { verifierServeur } from './serveur';

const HEAD = 'a'.repeat(40);
const repond = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('verifierServeur', () => {
  it('accepte un serveur démarré sur HEAD, sans modification sous src/', async () => {
    expect(
      await verifierServeur({
        fetch: repond({ commit: HEAD }),
        url: 'http://localhost:3002',
        head: HEAD,
        srcModifie: false,
      }),
    ).toBeNull();
  });

  it('refuse des modifications non commitées', async () => {
    expect(
      await verifierServeur({
        fetch: repond({ commit: HEAD }),
        url: 'http://localhost:3002',
        head: HEAD,
        srcModifie: true,
      }),
    ).toMatch(/non commitées/);
  });

  it('refuse un serveur démarré sur un autre commit', async () => {
    expect(
      await verifierServeur({
        fetch: repond({ commit: 'b'.repeat(40) }),
        url: 'http://localhost:3002',
        head: HEAD,
        srcModifie: false,
      }),
    ).toMatch(/redémarre/);
  });

  it('refuse un serveur injoignable', async () => {
    const injoignable = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(
      await verifierServeur({
        fetch: injoignable,
        url: 'http://localhost:3002',
        head: HEAD,
        srcModifie: false,
      }),
    ).toMatch(/injoignable/);
  });

  it('signale un serveur sans commit (production ou hors dépôt Git)', async () => {
    expect(
      await verifierServeur({
        fetch: repond({ commit: null }),
        url: 'http://localhost:3002',
        head: HEAD,
        srcModifie: false,
      }),
    ).toBe("Le serveur n'a pas de commit (production ou hors dépôt Git) : lance « pnpm dev ».");
  });

  it('signale un serveur démarré avec des modifications non commitées', async () => {
    expect(
      await verifierServeur({
        fetch: repond({ commit: `${HEAD}-dirty` }),
        url: 'http://localhost:3002',
        head: HEAD,
        srcModifie: false,
      }),
    ).toBe(
      'Le serveur a démarré avec des modifications non commitées : commite-les puis redémarre-le.',
    );
  });
});

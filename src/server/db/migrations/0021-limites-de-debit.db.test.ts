import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';
import { TEST_ENV } from '@/test/test-env';

// Migration 0021 : le compteur des limites de débit de la connexion et de l'inscription (audit 2 n° 3), en base
// pour tenir avec plusieurs instances de Leon.

// Deux instances : deux pools du rôle de l'app, sans rien en commun que la base.
const instances = [1, 2].map(() => new Pool({ connectionString: TEST_ENV.DATABASE_URL, max: 5 }));
afterAll(() => Promise.all(instances.map((pool) => pool.end())));

async function consume(keys: string[], window = '15 minutes', pool = instances[0]) {
  const { rows } = await (pool as Pool).query<{ cle: string; compte: number }>(
    'select cle, compte from consommer_limites($1, $2::interval)',
    [keys, window],
  );
  return Object.fromEntries(rows.map((row) => [row.cle, row.compte]));
}

describe('consommer_limites', () => {
  it('compte chaque clé dans sa fenêtre', async () => {
    const [a, b] = [randomUUID(), randomUUID()];

    expect(await consume([a, b])).toEqual({ [a]: 1, [b]: 1 });
    expect(await consume([a])).toEqual({ [a]: 2 });
    expect(await consume([a, b])).toEqual({ [a]: 3, [b]: 2 });
  });

  it('repart de 1 quand la fenêtre est passée', async () => {
    const key = randomUUID();
    await consume([key]);
    await consume([key]);
    await adminPool.query(
      `update limites_de_debit set debut = now() - interval '16 minutes' where cle = $1`,
      [key],
    );

    expect(await consume([key])).toEqual({ [key]: 1 });
  });

  it('ne perd aucune tentative envoyée en même temps par deux instances', async () => {
    const key = randomUUID();

    const counts = await Promise.all(
      Array.from({ length: 30 }, (_, i) => consume([key], '15 minutes', instances[i % 2])),
    );

    expect(counts.map((count) => count[key]).sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });

  it('efface les compteurs dont la fenêtre est passée', async () => {
    const [old, current] = [randomUUID(), randomUUID()];
    await consume([old]);
    await adminPool.query(
      `update limites_de_debit set debut = now() - interval '16 minutes' where cle = $1`,
      [old],
    );

    await consume([current]);

    const { rows } = await adminPool.query('select 1 from limites_de_debit where cle = $1', [old]);
    expect(rows).toEqual([]);
  });

  it('ne laisse à l’app que la fonction, pas la table', async () => {
    await expect(instances[0]?.query('select * from limites_de_debit')).rejects.toThrow(
      /permission denied/,
    );
  });
});

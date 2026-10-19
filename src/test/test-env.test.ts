import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIGRATIONS_DESTRUCTIVES,
  refuseMigrationsDestructives,
  TEST_ENV,
  testDatabaseName,
} from './test-env';

// Le nom de la base de test se règle par LEON_TEST_DATABASE (défaut leon_test) : le deuxième jet
// travaille sur leon_test_glean pour ne pas toucher la base que partagent les autres branches.
async function loadTestEnv() {
  vi.resetModules();
  return (await import('./test-env')).TEST_ENV;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TEST_ENV', () => {
  it('vise leon_test quand LEON_TEST_DATABASE est absent', async () => {
    vi.stubEnv('LEON_TEST_DATABASE', undefined);
    const env = await loadTestEnv();
    expect(env.DATABASE_URL).toMatch(/\/leon_test$/);
    expect(env.DATABASE_URL_ADMIN).toMatch(/\/leon_test$/);
  });

  it('vise la base nommée par LEON_TEST_DATABASE, pour les deux rôles', async () => {
    vi.stubEnv('LEON_TEST_DATABASE', 'leon_test_glean');
    const env = await loadTestEnv();
    expect(env.DATABASE_URL).toBe('postgres://leon_app:leon_app@127.0.0.1:54329/leon_test_glean');
    expect(env.DATABASE_URL_ADMIN).toBe(
      'postgres://leon_owner:leon_owner@127.0.0.1:54329/leon_test_glean',
    );
  });

  // Vitest range TEST_ENV dans process.env, et env.ts valide process.env à l'import : une variable exportée dans
  // le shell (essai d'un fournisseur de vecteurs) changerait l'environnement des tests. Vide vaut absent.
  it.each(['LEON_EMBEDDINGS', 'VOYAGE_API_KEY', 'MISTRAL_API_KEY', 'LEON_BGE_URL'])(
    'vide %s : une valeur exportée dans le shell ne passe pas dans les tests',
    (name) => {
      expect((TEST_ENV as Record<string, string>)[name]).toBe('');
      expect(process.env[name]).toBe('');
    },
  );

  it.each([
    'leon',
    'postgres',
    'leon_prod',
    'LEON_TEST',
    'leon_test/leon',
    'leon_test?sslmode=disable',
    'leon_test@autre-hote',
    '',
  ])('refuse la base « %s » : ce n’est pas une base de test', async (name) => {
    vi.stubEnv('LEON_TEST_DATABASE', name);
    await expect(loadTestEnv()).rejects.toThrow(/LEON_TEST_DATABASE/);
  });
});

describe('testDatabaseName', () => {
  it('accepte leon_test et les bases dont le nom en part', () => {
    expect(testDatabaseName(undefined)).toBe('leon_test');
    expect(testDatabaseName('leon_test')).toBe('leon_test');
    expect(testDatabaseName('leon_test_glean')).toBe('leon_test_glean');
  });

  it('refuse la base de développement et tout nom qui changerait l’adresse de connexion', () => {
    for (const name of ['leon', 'leon_test/x', 'leon_test?x=1', 'leon_test#x', '']) {
      expect(() => testDatabaseName(name), name).toThrow(/LEON_TEST_DATABASE/);
    }
  });
});

describe('refuseMigrationsDestructives', () => {
  const pending = ['0010-suppression-tri.sql'];

  it('liste la migration qui supprime le tri', () => {
    expect(MIGRATIONS_DESTRUCTIVES).toContain('0010-suppression-tri.sql');
  });

  it('refuse leon_test, base partagée, tant qu’une migration destructive n’y est pas appliquée', () => {
    const refusal = refuseMigrationsDestructives({
      database: 'leon_test',
      pending,
      accepted: false,
    });
    expect(refusal).toContain('0010-suppression-tri.sql');
    expect(refusal).toContain('LEON_TEST_DATABASE');
  });

  it('accepte leon_test_glean : cette base est celle de la branche', () => {
    expect(
      refuseMigrationsDestructives({ database: 'leon_test_glean', pending, accepted: false }),
    ).toBeNull();
  });

  it('accepte leon_test quand la migration y est déjà appliquée (rien en attente)', () => {
    expect(
      refuseMigrationsDestructives({ database: 'leon_test', pending: [], accepted: false }),
    ).toBeNull();
  });

  it('accepte leon_test quand l’équipe a décidé de le migrer (variable explicite)', () => {
    expect(
      refuseMigrationsDestructives({ database: 'leon_test', pending, accepted: true }),
    ).toBeNull();
  });
});

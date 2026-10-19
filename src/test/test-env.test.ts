import { afterEach, describe, expect, it, vi } from 'vitest';

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
});

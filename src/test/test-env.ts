// Environnement des tests : Postgres local de docker compose (mots de passe de développement, pas des secrets).
export const TEST_ENV = {
  DATABASE_URL: 'postgres://leon_app:leon_app@127.0.0.1:54329/leon_test',
  DATABASE_URL_ADMIN: 'postgres://leon_owner:leon_owner@127.0.0.1:54329/leon_test',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0000',
  BETTER_AUTH_URL: 'http://localhost:3000',
  // Clé fixe de test (32 octets), pas un secret : la même dans tous les workers Vitest.
  LEON_CONNECTORS_KEY: Buffer.alloc(32, 7).toString('base64'),
} as const;

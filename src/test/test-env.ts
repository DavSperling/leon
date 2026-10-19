// Environnement des tests : Postgres local de docker compose (mots de passe de développement, pas des secrets).
// LEON_TEST_DATABASE choisit la base (défaut leon_test) : une branche qui supprime ou change des tables
// travaille sur sa propre base pour ne pas casser celle que partagent les autres.
const database = process.env.LEON_TEST_DATABASE ?? 'leon_test';

export const TEST_ENV = {
  DATABASE_URL: `postgres://leon_app:leon_app@127.0.0.1:54329/${database}`,
  DATABASE_URL_ADMIN: `postgres://leon_owner:leon_owner@127.0.0.1:54329/${database}`,
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0000',
  BETTER_AUTH_URL: 'http://localhost:3000',
  // Clé fixe de test (32 octets), pas un secret : la même dans tous les workers Vitest.
  LEON_CONNECTORS_KEY: Buffer.alloc(32, 7).toString('base64'),
} as const;

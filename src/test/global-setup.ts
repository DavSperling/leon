import { runMigrations } from '../server/db/migrate';
import { pendingDestructiveMigrations } from './migration-guard';
import {
  ACCEPT_DESTRUCTIVE_VARIABLE,
  refuseMigrationsDestructives,
  TEST_ENV,
  testDatabaseName,
} from './test-env';

export default async function setup(): Promise<void> {
  // Avant de migrer : une migration qui supprime des tables ne touche jamais, par accident, leon_test.
  const refusal = refuseMigrationsDestructives({
    database: testDatabaseName(process.env.LEON_TEST_DATABASE),
    pending: await pendingDestructiveMigrations(TEST_ENV.DATABASE_URL_ADMIN),
    accepted: process.env[ACCEPT_DESTRUCTIVE_VARIABLE] === 'oui',
  });
  if (refusal) throw new Error(refusal);
  await runMigrations(TEST_ENV.DATABASE_URL_ADMIN);
}

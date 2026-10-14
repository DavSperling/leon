import { runMigrations } from '../server/db/migrate';
import { TEST_ENV } from './test-env';

export default async function setup(): Promise<void> {
  await runMigrations(TEST_ENV.DATABASE_URL_ADMIN);
}

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { TEST_ENV } from './test-env';

// Rôle propriétaire, hors RLS : réservé aux fixtures et aux vérifications des tests.
export const adminPool = new Pool({ connectionString: TEST_ENV.DATABASE_URL_ADMIN, max: 4 });
export const adminDb = drizzle({ client: adminPool });

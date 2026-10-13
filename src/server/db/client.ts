import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';

// Mis en cache sur globalThis hors production : le rechargement à chaud ne multiplie pas les pools.
const globalForPool = globalThis as { leonPool?: Pool };

export const pool =
  globalForPool.leonPool ?? new Pool({ connectionString: env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') globalForPool.leonPool = pool;

export const db = drizzle({ client: pool });

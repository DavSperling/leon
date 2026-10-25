import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';

// Mis en cache sur globalThis hors production : le rechargement à chaud ne multiplie pas les pools.
const globalForPool = globalThis as { leonPool?: Pool };

// Supabase en mode session refuse le 16e client d'un même rôle (EMAXCONNSESSION), et une mise en ligne fait
// tourner deux instances : 5 ici et 2 pour pg-boss (pipeline/queue.ts), soit 14 au plus pendant le recouvrement.
// shortcut: taillé pour la taille de pool par défaut de Supabase (15), à relever avec elle.
export const pool =
  globalForPool.leonPool ?? new Pool({ connectionString: env.DATABASE_URL, max: 5 });
if (process.env.NODE_ENV !== 'production') globalForPool.leonPool = pool;

export const db = drizzle({ client: pool });

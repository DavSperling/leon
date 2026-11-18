import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';

// Rangé sur globalThis, en production aussi : Next compile ce module en plusieurs copies (tâches de fond, route
// API, pages), et chacune ouvrirait sinon son propre pool. En développement, le rechargement à chaud non plus.
const globalForPool = globalThis as { leonPool?: Pool };

// 4 ici, 2 pour pg-boss et 1 pour son écoute (pipeline/queue.ts) : 7 par instance, 14 au plus pendant le
// recouvrement d'une mise en ligne. Taillé pour le pooler de Supabase (15 clients par rôle, EMAXCONNSESSION au-delà).
// shortcut: RDS (db.t4g.small) accepte ~200 connexions directes ; relever quand le débit des tâches le demande.
globalForPool.leonPool ??= new Pool({ connectionString: env.DATABASE_URL, max: 4 });
export const pool = globalForPool.leonPool;

export const db = drizzle({ client: pool });

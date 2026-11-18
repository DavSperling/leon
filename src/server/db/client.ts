import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';

// Rangé sur globalThis, en production aussi : Next compile ce module en plusieurs copies (tâches de fond, route
// API, pages), et chacune ouvrirait sinon son propre pool. En développement, le rechargement à chaud non plus.
const globalForPool = globalThis as { leonPool?: Pool };

// Supabase en mode session refuse le 16e client d'un même rôle (EMAXCONNSESSION), et une mise en ligne fait
// tourner deux instances : 4 ici, 2 pour pg-boss et 1 pour son écoute (pipeline/queue.ts), soit 7 par instance et
// 14 au plus pendant le recouvrement.
// shortcut: taillé pour la taille de pool par défaut de Supabase (15), à relever avec elle.
globalForPool.leonPool ??= new Pool({ connectionString: env.DATABASE_URL, max: 4 });
export const pool = globalForPool.leonPool;

export const db = drizzle({ client: pool });

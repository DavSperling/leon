import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export type AdminDb = NodePgDatabase;

// Rôle propriétaire, hors RLS : réservé au jeu d'essai (créer, effacer, lire toute l'organisation d'essai).
export function openAdminDb(url = process.env.DATABASE_URL_ADMIN): {
  db: AdminDb;
  close: () => Promise<void>;
} {
  if (!url?.match(/^postgres(ql)?:\/\//))
    throw new Error('DATABASE_URL_ADMIN manquante (voir .env.local).');
  const pool = new Pool({ connectionString: url, max: 2 });
  return { db: drizzle({ client: pool }), close: () => pool.end() };
}

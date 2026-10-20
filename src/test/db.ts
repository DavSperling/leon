import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { TEST_ENV } from './test-env';

// Rôle propriétaire, hors RLS : réservé aux fixtures et aux vérifications des tests.
export const adminPool = new Pool({ connectionString: TEST_ENV.DATABASE_URL_ADMIN, max: 4 });
export const adminDb = drizzle({ client: adminPool });

// La file des vecteurs ne sert qu'un modèle (une ligne, passages_a_vectoriser_modele) : un test qui change ce modèle
// en gardant une transaction ouverte fait attendre tous les appels de passages_sans_vecteur des autres fichiers, et
// peut attendre une suppression qu'un autre fichier tient ouverte. Ces tests-là passent l'un après l'autre.
export async function oneQueueTestAtATime<T>(run: () => Promise<T>): Promise<T> {
  const client = await adminPool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('tests:file-des-vecteurs'))");
    return await run();
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('tests:file-des-vecteurs'))");
    client.release();
  }
}

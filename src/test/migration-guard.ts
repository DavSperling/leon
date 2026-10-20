import { readdir } from 'node:fs/promises';
import { Client } from 'pg';
import { MIGRATIONS_DIR } from '../server/db/migrate';
import { MIGRATIONS_DESTRUCTIVES } from './test-env';

// Migrations destructives présentes dans le dossier et pas encore appliquées à la base visée. Lecture seule :
// global-setup s'en sert avant de migrer, pour refuser d'appliquer 0010 à la base que partagent les branches.
export async function pendingDestructiveMigrations(
  adminUrl: string,
  options: { dir?: string; destructives?: string[] } = {},
): Promise<string[]> {
  const { dir = MIGRATIONS_DIR, destructives = MIGRATIONS_DESTRUCTIVES } = options;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    // Sur une base neuve, la table des migrations n'existe pas encore : tout est en attente.
    const { rows } = await client.query<{ present: boolean }>(
      "select to_regclass('public.leon_migrations') is not null as present",
    );
    const applied = new Set<string>();
    if (rows[0]?.present) {
      const done = await client.query<{ name: string }>('select name from leon_migrations');
      for (const row of done.rows) applied.add(row.name);
    }
    const files = new Set(await readdir(dir));
    return destructives.filter((name) => files.has(name) && !applied.has(name));
  } finally {
    await client.end();
  }
}

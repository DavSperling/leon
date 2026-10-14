import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));
const LOCK_KEY = 7_270_331; // verrou consultatif : deux runners ne migrent jamais en même temps
const FILE_PATTERN = /^\d{4}-[a-z0-9-]+\.sql$/;

// Applique les migrations pas encore enregistrées, une transaction par fichier. Renvoie leurs noms.
export async function runMigrations(adminUrl: string, dir = MIGRATIONS_DIR): Promise<string[]> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      `create table if not exists leon_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const done = await client.query<{ name: string }>('select name from leon_migrations');
    const doneNames = new Set(done.rows.map((row) => row.name));
    const files = (await readdir(dir)).filter((file) => FILE_PATTERN.test(file)).sort();
    const pending = files.filter((file) => !doneNames.has(file));
    for (const file of pending) {
      await applyMigration(client, file, await readFile(`${dir}/${file}`, 'utf8'));
    }
    return pending;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

async function applyMigration(client: Client, file: string, sql: string): Promise<void> {
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into leon_migrations (name) values ($1)', [file]);
    await client.query('commit');
  } catch (cause) {
    await client.query('rollback').catch(() => {});
    throw new Error(`Migration ${file} en échec`, { cause });
  }
}

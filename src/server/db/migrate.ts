import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));
const LOCK_KEY = 7_270_331; // verrou consultatif : deux runners ne migrent jamais en même temps
export const MIGRATION_FILE_PATTERN = /^\d{4}-[a-z0-9-]+\.sql$/;

// « create extension [if not exists] nom » ; un nom sans guillemets est ramené en minuscules, comme Postgres.
const CREATE_EXTENSION =
  /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))/gi;
const INSUFFICIENT_PRIVILEGE = '42501';

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
    const files = (await readdir(dir)).filter((file) => MIGRATION_FILE_PATTERN.test(file)).sort();
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

// Les extensions que crée un SQL de migration, dans l'ordre et sans doublon ; les commentaires sont ignorés.
export function requiredExtensions(sql: string): string[] {
  const code = sql.replace(/--[^\n]*/g, '');
  const names = [...code.matchAll(CREATE_EXTENSION)].map(
    ([, quoted, bare]) => quoted ?? bare?.toLowerCase() ?? '',
  );
  return [...new Set(names)].filter((name) => name !== '');
}

async function applyMigration(client: Client, file: string, sql: string): Promise<void> {
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into leon_migrations (name) values ($1)', [file]);
    await client.query('commit');
  } catch (cause) {
    await client.query('rollback').catch(() => {});
    throw new Error(await failureMessage(client, file, sql, cause), { cause });
  }
}

// Le message d'échec d'une migration. Quand elle demande une extension que seul un superutilisateur peut
// créer (vector, 0011, n'est pas « trusted ») et que personne ne l'a créée dans cette base, le message dit
// laquelle et comment la créer : l'erreur de Postgres seule ne le dit pas.
async function failureMessage(
  client: Client,
  file: string,
  sql: string,
  cause: unknown,
): Promise<string> {
  const failed = `Migration ${file} en échec`;
  const wanted = requiredExtensions(sql);
  if (wanted.length === 0 || !isInsufficientPrivilege(cause)) return failed;
  let rows: Array<{ name: string; database: string }>;
  try {
    // Après le rollback : une extension créée par ce fichier n'existe plus, d'où le test des droits.
    ({ rows } = await client.query<{ name: string; database: string }>(
      `select n.name, current_database() as database
         from unnest($1::text[]) as n(name)
        where not exists (select 1 from pg_extension e where e.extname = n.name)
          and not coalesce((select rolsuper from pg_roles where rolname = current_user), false)
          and not coalesce((select bool_or(v.trusted) from pg_available_extension_versions v
                             where v.name = n.name), false)`,
      [wanted],
    ));
  } catch {
    return failed;
  }
  if (rows.length === 0) return failed;
  const names = rows.map((row) => `« ${row.name} »`).join(', ');
  const commands = rows
    .map(
      ({ name, database }) =>
        `docker compose exec postgres psql -U postgres -d ${database} -c "create extension if not exists ${name}"`,
    )
    .join(' puis ');
  return [
    `${failed} : l'extension Postgres ${names} manque dans la base ${rows[0]?.database},`,
    'et seul un superutilisateur peut la créer.',
    `Créez-la une fois, puis relancez la migration. En local : ${commands}.`,
    "Chez un hébergeur : avec le compte d'administration de la base, avant la première migration.",
  ].join(' ');
}

function isInsufficientPrivilege(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === INSUFFICIENT_PRIVILEGE
  );
}

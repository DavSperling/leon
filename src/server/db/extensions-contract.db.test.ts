import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';
import { MIGRATION_FILE_PATTERN, MIGRATIONS_DIR, requiredExtensions } from './migrate';

// Contrat « extensions des migrations ↔ création par le superutilisateur ». Une extension qui n'est pas
// « trusted » ne se crée que par un superutilisateur, et leon_owner, qui applique les migrations, ne l'est
// pas : son « create extension if not exists » n'est sans effet que si l'extension existe déjà. Elle doit
// donc être créée dans template1 par docker/postgres/init.sql (toute base créée ensuite l'a), et exister
// dans la base de test. Sinon `pnpm db:migrate` échoue sur un volume neuf.

const INIT_SQL = readFileSync(
  new URL('../../../docker/postgres/init.sql', import.meta.url),
  'utf8',
);

const migrationExtensions = [
  ...new Set(
    readdirSync(MIGRATIONS_DIR)
      .filter((file) => MIGRATION_FILE_PATTERN.test(file))
      .sort()
      .flatMap((file) => requiredExtensions(readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8'))),
  ),
];

type InitStep = { database: string; line: string };

// Les instructions de init.sql, chacune avec la base où elle s'exécute : le script part de la base postgres
// (POSTGRES_DB par défaut de l'image) et `\connect` en change.
function initSteps(sql: string): InitStep[] {
  let database = 'postgres';
  const steps: InitStep[] = [];
  for (const raw of sql.split('\n')) {
    const line = raw.replace(/--.*$/, '').trim();
    if (line === '') continue;
    const connect = line.match(/^\\(?:connect|c)\s+(\S+)/);
    if (connect?.[1]) {
      database = connect[1];
      continue;
    }
    steps.push({ database, line });
  }
  return steps;
}

// Les extensions, parmi `names`, qu'un rôle non superutilisateur ne peut pas créer. Une extension absente du
// serveur compte parmi elles.
async function untrustedExtensions(names: string[]): Promise<string[]> {
  const { rows } = await adminPool.query<{ name: string }>(
    `select n.name from unnest($1::text[]) as n(name)
      where not coalesce((select bool_or(v.trusted) from pg_available_extension_versions v
                           where v.name = n.name), false)
      order by n.name`,
    [names],
  );
  return rows.map((row) => row.name);
}

describe('extensions des migrations', () => {
  it('chaque extension que seul un superutilisateur crée l’est par init.sql, dans template1, avant les bases', async () => {
    const untrusted = await untrustedExtensions(migrationExtensions);
    // vector (0011) n'est pas « trusted » (vector.control) : le contrat porte sur quelque chose.
    expect(untrusted).toContain('vector');

    const steps = initSteps(INIT_SQL);
    const databases = steps.flatMap((step, index) =>
      /^create database\b/i.test(step.line) ? [{ ...step, index }] : [],
    );
    expect(databases.length).toBeGreaterThan(0);
    // Créer une base depuis template1 échoue tant qu'une session y est connectée.
    for (const step of databases) expect(step.database, step.line).not.toBe('template1');

    for (const name of untrusted) {
      const created = steps.findIndex(
        (step) => step.database === 'template1' && requiredExtensions(step.line).includes(name),
      );
      expect(created, `${name} créée dans template1`).toBeGreaterThanOrEqual(0);
      expect(created, `${name} créée avant les bases`).toBeLessThan(databases[0]?.index ?? -1);
    }
  });

  it('chaque extension des migrations existe dans la base de test', async () => {
    const { rows } = await adminPool.query<{ extname: string }>(
      'select extname from pg_extension where extname = any($1)',
      [migrationExtensions],
    );

    expect(rows.map((row) => row.extname).sort()).toEqual([...migrationExtensions].sort());
  });
});

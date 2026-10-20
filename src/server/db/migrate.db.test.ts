import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it, onTestFinished } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { runMigrations } from './migrate';

async function tempMigrationsDir(file: string, sql: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'leon-migrations-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, file), sql);
  return dir;
}

async function appliedNames(): Promise<string[]> {
  const client = new Client({ connectionString: TEST_ENV.DATABASE_URL_ADMIN });
  await client.connect();
  try {
    const { rows } = await client.query('select name from leon_migrations');
    return rows.map((row) => row.name);
  } finally {
    await client.end();
  }
}

describe('runMigrations', () => {
  it('ne réapplique rien au second appel et enregistre les migrations', async () => {
    await runMigrations(TEST_ENV.DATABASE_URL_ADMIN);
    expect(await runMigrations(TEST_ENV.DATABASE_URL_ADMIN)).toEqual([]);
    expect(await appliedNames()).toContain('0001-base.sql');
  });

  it('supporte deux exécutions simultanées : une seule applique la migration', async () => {
    const name = `0001-parallele-${randomUUID().replaceAll('-', '')}.sql`;
    const dir = await tempMigrationsDir(name, 'select 1;');
    onTestFinished(async () => {
      const client = new Client({ connectionString: TEST_ENV.DATABASE_URL_ADMIN });
      await client.connect();
      await client.query('delete from leon_migrations where name = $1', [name]);
      await client.end();
    });

    const results = await Promise.all([
      runMigrations(TEST_ENV.DATABASE_URL_ADMIN, dir),
      runMigrations(TEST_ENV.DATABASE_URL_ADMIN, dir),
    ]);

    expect(results.map((applied) => applied.length).sort()).toEqual([0, 1]);
  });

  it("nomme le fichier en échec et n'enregistre rien pour lui", async () => {
    const dir = await tempMigrationsDir('0001-casse.sql', 'select * from table_inexistante;');

    await expect(runMigrations(TEST_ENV.DATABASE_URL_ADMIN, dir)).rejects.toThrow('0001-casse.sql');
    expect(await appliedNames()).not.toContain('0001-casse.sql');
  });

  // file_fdw n'est pas « trusted » : leon_owner, qui n'est pas superutilisateur, ne peut pas la créer. C'est
  // le cas de vector (0011) sur une base où personne ne l'a créée.
  it('dit en français quelle extension créer, et comment, quand le rôle ne peut pas la créer', async () => {
    const name = `0001-extension-${randomUUID().replaceAll('-', '')}.sql`;
    const dir = await tempMigrationsDir(name, 'create extension if not exists file_fdw;');
    const database = new URL(TEST_ENV.DATABASE_URL_ADMIN).pathname.slice(1);

    const failure = await runMigrations(TEST_ENV.DATABASE_URL_ADMIN, dir).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain(name);
    expect(message).toContain('« file_fdw »');
    expect(message).toContain('superutilisateur');
    expect(message).toContain(
      `docker compose exec postgres psql -U postgres -d ${database} -c "create extension if not exists file_fdw"`,
    );
    expect((failure as Error).cause).toMatchObject({ code: '42501' });
    expect(await appliedNames()).not.toContain(name);
  });
});

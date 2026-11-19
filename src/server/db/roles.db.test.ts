import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertRlsRole } from '@/server/db/client';
import { TEST_ENV } from '@/test/test-env';

const client = new Client({ connectionString: TEST_ENV.DATABASE_URL });

beforeAll(() => client.connect());
afterAll(() => client.end());

describe('rôle leon_app', () => {
  it('est un rôle ordinaire, soumis à la RLS', async () => {
    const { rows } = await client.query(
      `select current_user as who, rolbypassrls, rolsuper from pg_roles where rolname = current_user`,
    );
    expect(rows[0]).toEqual({ who: 'leon_app', rolbypassrls: false, rolsuper: false });
  });

  it("ne voit aucun contexte hors d'une transaction withTenant", async () => {
    const { rows } = await client.query('select app_tenant() as tenant, app_principals() as p');
    expect(rows[0]).toEqual({ tenant: null, p: [] });
  });

  it('ne peut pas créer de table dans public', async () => {
    await expect(client.query('create table public.essai (id int)')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('peut créer les tables de pg-boss', async () => {
    const { rows } = await client.query(
      `select has_schema_privilege('leon_app', 'pgboss', 'CREATE') as ok`,
    );
    expect(rows[0].ok).toBe(true);
  });
});

// Le propriétaire des tables passe outre la RLS sans erreur : le démarrage refuse une DATABASE_URL qui le désigne.
describe('garde du démarrage', () => {
  it('laisse démarrer leon_app', async () => {
    await expect(assertRlsRole(client)).resolves.toBeUndefined();
  });

  it('refuse le propriétaire des tables', async () => {
    const owner = new Client({ connectionString: TEST_ENV.DATABASE_URL_ADMIN });
    await owner.connect();
    try {
      await expect(assertRlsRole(owner)).rejects.toThrow('« leon_owner », qui possède les tables');
    } finally {
      await owner.end();
    }
  });
});

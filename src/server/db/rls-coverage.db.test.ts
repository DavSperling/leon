import { describe, expect, it } from 'vitest';
import { adminPool } from '@/test/db';

// Filet de sécurité piloté par la base, pas par les fichiers de schéma : une table qui porte `tenant_id` sans
// sécurité par ligne fuirait entre organisations sans qu'aucun autre test n'échoue (les fixtures passent par
// adminDb). Il attrape donc aussi une table oubliée dans un fichier de schéma ou dans un test.

// Tables à `tenant_id` sans sécurité par ligne, et pourquoi.
const RLS_EXCEPTIONS = [
  // Le jeton se retrouve par son empreinte avant qu'on connaisse l'organisation (authentification par jeton).
  'api_tokens',
];

// Tables à `tenant_id` dont l'app peut supprimer des lignes : une décision par table, jamais un défaut.
// Un droit de plus se décide avec le plan (voir C2, C12, C13 du plan du deuxième jet) et s'ajoute ici.
const DELETE_ALLOWED = [
  'connections', // « Supprimer » une connexion
  'passages', // réindexation d'une source (0011)
  'passage_vectors', // changement de modèle de vecteurs (0011)
  'connection_exclusions', // retirer une exclusion (0015)
  'identities', // retirer un compte déclaré (0017)
];

const TENANT_TABLES = `
  select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and exists (select 1 from pg_attribute a
                  where a.attrelid = c.oid and a.attname = 'tenant_id'
                    and a.attnum > 0 and not a.attisdropped)`;

async function names(sql: string): Promise<string[]> {
  const { rows } = await adminPool.query<{ relname: string }>(sql);
  return rows.map((row) => row.relname).sort();
}

describe('couverture de la sécurité par ligne', () => {
  it('trouve des tables à tenant_id (le filet ne regarde pas dans le vide)', async () => {
    expect(await names(TENANT_TABLES)).toEqual(expect.arrayContaining(['sources', 'turns']));
  });

  it('toute table à tenant_id a la sécurité par ligne, sauf les exceptions listées', async () => {
    const withoutRls = await names(
      `select relname from (${TENANT_TABLES}) t where not relrowsecurity`,
    );

    expect(withoutRls.filter((name) => !RLS_EXCEPTIONS.includes(name))).toEqual([]);
  });

  it('chaque exception existe encore et est bien sans sécurité par ligne', async () => {
    const withoutRls = await names(
      `select relname from (${TENANT_TABLES}) t where not relrowsecurity`,
    );

    expect(withoutRls).toEqual(expect.arrayContaining(RLS_EXCEPTIONS));
  });

  it('leon_app ne peut vider aucune table (jamais de truncate)', async () => {
    expect(
      await names(`
        select c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and has_table_privilege('leon_app', c.oid, 'TRUNCATE')`),
    ).toEqual([]);
  });

  it('leon_app ne supprime de lignes que dans les tables dont le droit est décidé', async () => {
    const deletable = await names(
      `select relname from (${TENANT_TABLES}) t where has_table_privilege('leon_app', oid, 'DELETE')`,
    );

    expect(
      deletable.filter((name) => !DELETE_ALLOWED.includes(name)),
      'ajouter la table à DELETE_ALLOWED si ce droit est voulu par le plan, sinon le retirer de la migration',
    ).toEqual([]);
  });
});

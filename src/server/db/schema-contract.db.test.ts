import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it, onTestFinished } from 'vitest';
import { adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { EMBEDDING_DIMS } from '../embeddings/embedder';
import { passageVectors } from './schema/search';

// Contrat « colonnes utilisées ↔ migrations » : chaque colonne Drizzle existe en base sous le même nom.
// Les fichiers de schéma sont lus dans le dossier, sans liste à la main : un nouveau fichier est couvert dès
// qu'il existe, et aucune de ses tables ne peut échapper au contrat.
const schemaFiles = readdirSync(new URL('./schema', import.meta.url))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .sort();
const schemaModules = await Promise.all(
  schemaFiles.map((file) => import(`./schema/${file.replace(/\.ts$/, '')}.ts`)),
);
const tables: PgTable[] = schemaModules.flatMap((module) =>
  Object.values(module as Record<string, unknown>).filter((value): value is PgTable =>
    is(value, PgTable),
  ),
);

async function databaseColumns(table: string): Promise<string[]> {
  const { rows } = await adminPool.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  );
  return rows.map((row) => row.column_name);
}

// Le type et la nullité de chaque colonne, tels que la base les a (celui de `format_type`, comme `getSQLType()` de Drizzle).
async function databaseColumnShapes(table: string): Promise<Map<string, string>> {
  const { rows } = await adminPool.query<{ name: string; shape: string }>(
    `select a.attname as name,
            format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' not null' else '' end as shape
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = $1 and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped`,
    [table],
  );
  return new Map(rows.map((row) => [row.name, row.shape]));
}

// Colonnes que Postgres calcule et que Drizzle ne déclare pas exprès (search.ts : la recherche lit `tsv` en SQL).
const COMPUTED_BY_POSTGRES = new Set(['passages.tsv']);

// Valeurs autorisées par le CHECK « colonne in (...) », lues dans le catalogue de Postgres.
async function checkValues(table: string, column: string): Promise<string[] | undefined> {
  const { rows } = await adminPool.query<{ def: string }>(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid = c.conrelid
      where t.relname = $1 and c.contype = 'c'`,
    [table],
  );
  const def = rows.map((row) => row.def).find((d) => d.includes(`(${column} = ANY`));
  return def?.match(/'[^']*'/g)?.map((literal) => literal.slice(1, -1));
}

// Depuis 0010, la liste des outils se valide dans le code (SOURCE_KINDS, PROVIDER_IDS) : ces deux colonnes
// gardent leur enum côté TypeScript mais n'ont plus de CHECK en base.
const VALIDATED_IN_CODE = new Set(['sources.kind', 'connections.provider']);

const enumColumns = tables.flatMap((table) => {
  const { name, columns } = getTableConfig(table);
  return columns
    .filter((column) => column.enumValues !== undefined)
    .filter((column) => !VALIDATED_IN_CODE.has(`${name}.${column.name}`))
    .map((column) => [`${name}.${column.name}`, name, column.name, column.enumValues] as const);
});

const DROPPED_TABLES = [
  'review_items',
  'facts',
  'fact_candidates',
  'card_aliases',
  'cards',
  'predicates',
  'card_types',
];

describe('schéma Drizzle ↔ migrations', () => {
  it('lit les fichiers du dossier schema et en tire des tables', () => {
    expect(schemaFiles).toEqual(
      expect.arrayContaining([
        'api-tokens.ts',
        'auth.ts',
        'connections.ts',
        'memory.ts',
        'search.ts',
      ]),
    );
    expect(tables.length).toBeGreaterThanOrEqual(11);
  });

  it.each(tables.map((table) => [getTableConfig(table).name, table] as const))(
    'les colonnes de %s existent en base',
    async (name, table) => {
      const expected = getTableConfig(table).columns.map((column) => column.name);
      const actual = await databaseColumns(name);
      expect(actual).not.toHaveLength(0);
      for (const column of expected) expect(actual, `${name}.${column}`).toContain(column);
    },
  );

  // L'inverse, et la forme : une colonne `not null` que Drizzle ne déclare pas fait échouer chaque insertion qu'il écrit
  // (23502), un type ou une nullité qui diffèrent fait mentir les types de la lecture. api_tokens a reçu dix colonnes de
  // la 0049 : rien ne dit, sans ce test, que les dix sont celles du schéma.
  it.each(tables.map((table) => [getTableConfig(table).name, table] as const))(
    'les colonnes de %s en base sont celles de Drizzle, du même type et de la même nullité',
    async (name, table) => {
      const declared = new Map(
        getTableConfig(table).columns.map((column) => [
          column.name,
          `${column.getSQLType()}${column.notNull ? ' not null' : ''}`,
        ]),
      );
      const actual = await databaseColumnShapes(name);
      const undeclared = [...actual.keys()].filter(
        (column) => !declared.has(column) && !COMPUTED_BY_POSTGRES.has(`${name}.${column}`),
      );
      const differing = [...declared]
        .filter(([column, shape]) => actual.has(column) && actual.get(column) !== shape)
        .map(([column, shape]) => `${column} : Drizzle ${shape}, base ${actual.get(column)}`);

      expect({ undeclared, differing }).toEqual({ undeclared: [], differing: [] });
    },
  );

  it.each(enumColumns)(
    "l'enum de %s a les mêmes valeurs que son CHECK",
    async (_label, table, column, enumValues) => {
      const values = await checkValues(table, column);
      expect(values, `CHECK de ${table}.${column}`).toBeDefined();
      expect(new Set(values)).toEqual(new Set(enumValues));
    },
  );
});

describe('suppression du tri (0010)', () => {
  it.each(DROPPED_TABLES)('la table %s n’existe plus', async (table) => {
    const { rows } = await adminPool.query<{ found: string | null }>(
      'select to_regclass($1)::text as found',
      [`public.${table}`],
    );
    expect(rows).toEqual([{ found: null }]);
  });

  it('read_log pointe vers une source et un passage facultatif, plus vers une fiche', async () => {
    const { rows } = await adminPool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'read_log'
          and column_name in ('card_id', 'source_id', 'passage_id')
        order by column_name`,
    );
    expect(rows).toEqual([
      { column_name: 'passage_id', is_nullable: 'YES' },
      { column_name: 'source_id', is_nullable: 'NO' },
    ]);
  });

  it("ingest_runs n'a plus de colonne triage, et son étape vaut index par défaut", async () => {
    const { rows } = await adminPool.query<{ column_name: string; column_default: string | null }>(
      `select column_name, column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'ingest_runs'
          and column_name in ('triage', 'step')`,
    );
    expect(rows).toEqual([{ column_name: 'step', column_default: "'index'::text" }]);
  });

  it("n'a plus de CHECK sur sources.kind ni sur connections.provider", async () => {
    for (const table of ['sources', 'connections']) {
      const column = table === 'sources' ? 'kind' : 'provider';
      expect(await checkValues(table, column), `${table}.${column}`).toBeUndefined();
    }
  });

  it('accepte au niveau SQL un outil hors liste, validé par le code seulement', async () => {
    const {
      tenantId,
      members: [paul],
    } = await createTestTenant(['Paul']);
    if (!paul) throw new Error('membre de test manquant');
    await expect(
      adminPool.query(
        `insert into sources (tenant_id, kind, external_id, owner_user_id, acl)
         values ($1, 'nouvel_outil', $2, $3, array[$1::uuid])`,
        [tenantId, randomUUID(), paul.userId],
      ),
    ).resolves.toBeDefined();
    await expect(
      adminPool.query(
        `insert into connections (tenant_id, created_by, provider, label, secret, secret_hint, since, acl)
         values ($1, $2, 'nouvel_outil', 'Connexion de test', 'v1:a:b:c', 'abcd', now(), array[$1::uuid])`,
        [tenantId, paul.userId],
      ),
    ).resolves.toBeDefined();
  });
});

// Comparaison numérique, partie par partie : « 0.10.0 » est plus récent que « 0.8.0 ».
function versionAtLeast(version: string, minimum: number[]): boolean {
  const parts = version.split('.').map(Number);
  for (const [index, wanted] of minimum.entries()) {
    const part = parts[index] ?? 0;
    if (part !== wanted) return part > wanted;
  }
  return true;
}

describe('passages et vecteurs (0011)', () => {
  it('les vecteurs sont des halfvec de 1 024 dimensions, en base comme dans Drizzle', async () => {
    const { rows } = await adminPool.query<{ type: string }>(
      `select format_type(atttypid, atttypmod) as type from pg_attribute
        where attrelid = 'public.passage_vectors'::regclass and attname = 'embedding'`,
    );
    const embedding = getTableConfig(passageVectors).columns.find(
      (column) => column.name === 'embedding',
    );

    // La constante des fournisseurs (EMBEDDING_DIMS) est la même que la colonne : changer l'une sans l'autre échoue ici.
    expect(rows).toEqual([{ type: `halfvec(${EMBEDDING_DIMS})` }]);
    expect(embedding?.getSQLType()).toBe(`halfvec(${EMBEDDING_DIMS})`);
  });

  // halfvec et halfvec_cosine_ops demandent pgvector 0.7 ; hnsw.iterative_scan, que la recherche pose (T06),
  // demande 0.8. Une base plus ancienne passerait la migration et ferait échouer chaque recherche.
  it('pgvector est en version 0.8.0 au moins', async () => {
    expect(versionAtLeast('0.10.0', [0, 8, 0])).toBe(true);
    expect(versionAtLeast('0.7.4', [0, 8, 0])).toBe(false);
    const { rows } = await adminPool.query<{ version: string }>(
      "select extversion as version from pg_extension where extname = 'vector'",
    );

    expect(rows).toHaveLength(1);
    const version = rows[0]?.version ?? '';
    expect(versionAtLeast(version, [0, 8, 0]), `pgvector ${version}`).toBe(true);
  });

  it('le plein texte est une colonne générée, en français et en simple', async () => {
    const { rows } = await adminPool.query<{ is_generated: string; generation_expression: string }>(
      `select is_generated, generation_expression from information_schema.columns
        where table_schema = 'public' and table_name = 'passages' and column_name = 'tsv'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_generated).toBe('ALWAYS');
    expect(rows[0]?.generation_expression).toContain("'french'");
    expect(rows[0]?.generation_expression).toContain("'simple'");
  });

  it('le plein texte retrouve un mot par sa racine française et un nom tel quel', async () => {
    const {
      members: [paul],
    } = await createTestTenant(['Paul']);
    if (!paul) throw new Error('membre de test manquant');
    const { sourceId, turnId } = await seedSource(paul, { text: 'Les contrats OVH sont signés.' });
    // Le passage, sans vecteur, ne doit pas rester dans la file des autres fichiers (passages_sans_vecteur) :
    // supprimer la source l'emporte en cascade.
    onTestFinished(async () => {
      await adminPool.query('delete from sources where id = $1', [sourceId]);
    });
    await adminPool.query(
      `insert into passages (tenant_id, source_id, turn_id, ord, text, char_start, char_end, ts, acl)
       values ($1, $2, $3, 0, 'Les contrats OVH sont signés.', 0, 29, now(), array[$4::uuid])`,
      [paul.tenantId, sourceId, turnId, paul.userId],
    );

    const { rows } = await adminPool.query<{ racine: boolean; nom: boolean }>(
      `select tsv @@ to_tsquery('french', 'contrat') as racine, tsv @@ to_tsquery('simple', 'ovh') as nom
         from passages where turn_id = $1`,
      [turnId],
    );

    expect(rows).toEqual([{ racine: true, nom: true }]);
  });

  it('les index de la recherche existent', async () => {
    const { rows } = await adminPool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename in ('passages', 'passage_vectors')`,
    );
    const definitions = rows.map((row) => row.indexdef).join('\n');
    for (const expected of [
      'USING gin (tsv)',
      'USING btree (tenant_id, source_id)',
      'USING btree (tenant_id, ts DESC)',
      'USING hnsw (embedding halfvec_cosine_ops)',
      'USING btree (turn_id, ord)',
    ]) {
      expect(definitions, expected).toContain(expected);
    }
  });

  it('leon_app lit, écrit et supprime passages et vecteurs, sous la politique tenant_acl', async () => {
    for (const table of ['passages', 'passage_vectors']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const { rows } = await adminPool.query<{ granted: boolean }>(
          'select has_table_privilege($1, $2, $3) as granted',
          ['leon_app', `public.${table}`, privilege],
        );
        expect(rows, `${privilege} sur ${table}`).toEqual([{ granted: true }]);
      }
    }
    const { rows } = await adminPool.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
        where schemaname = 'public' and tablename in ('passages', 'passage_vectors')
        order by tablename`,
    );
    expect(rows).toEqual([
      { tablename: 'passage_vectors', policyname: 'tenant_acl' },
      { tablename: 'passages', policyname: 'tenant_acl' },
    ]);
  });
});

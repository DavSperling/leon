import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_ENV } from '@/test/test-env';
import { MIGRATIONS_DIR } from '../migrate';

// Migration 0010 : le tri disparaît. La base de test est déjà migrée et ne garde aucune donnée du tri : on
// rejoue donc les migrations 0001 à 0010 dans un schéma jetable, à l'intérieur d'une transaction que l'on
// annule. Entre 0009 et 0010, on y pose des données comme en laissait le premier jet (runs à toutes les
// étapes, lectures de fiches) pour voir ce que la migration en fait. `public` reste intact.

const SCHEMA = 'rejeu_0010';
const DROPPED_TABLES = [
  'review_items',
  'facts',
  'fact_candidates',
  'card_aliases',
  'cards',
  'predicates',
  'card_types',
];

type Snapshot = {
  runs: Array<{ step: string; status: string; error: string | null }>;
  readLogAfter: number;
  droppedTables: Record<string, string | null>;
  readLogColumns: string[];
  readLogCascade: { before: number; after: number };
  badStepCode: string | null;
  kindOutsideListCode: string | null;
};

async function applyFiles(client: Client, files: string[]): Promise<void> {
  for (const file of files) await client.query(await readFile(`${MIGRATIONS_DIR}/${file}`, 'utf8'));
}

async function seedFirstDraftData(client: Client): Promise<{ sourceId: string }> {
  const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    const { rows } = await client.query<T>(sql, params);
    const row = rows[0];
    if (!row) throw new Error(`aucune ligne pour : ${sql}`);
    return row;
  };
  const org = await one<{ id: string }>(
    `insert into organization (name, slug, "createdAt") values ('Org', $1, now()) returning id`,
    [`rejeu-${randomUUID()}`],
  );
  const user = await one<{ id: string }>(
    `insert into "user" (name, email, "emailVerified") values ('Paul', $1, false) returning id`,
    [`${randomUUID()}@test.leon`],
  );
  const source = await one<{ id: string }>(
    `insert into sources (tenant_id, kind, external_id, owner_user_id, acl)
     values ($1, 'github', 'ticket-1', $2, array[$1::uuid]) returning id`,
    [org.id, user.id],
  );
  const turn = await one<{ id: string }>(
    `insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl)
     values ($1, $2, 't1', 'document', 'Texte', now(), 'connector', array[$1::uuid]) returning id`,
    [org.id, source.id],
  );
  // Un run à chaque étape et dans chaque état que le tri pouvait laisser.
  const runs: Array<[string, string, string | null, string | null]> = [
    ['triage', 'queued', null, null],
    ['extraction', 'running', '{"verdict":"x"}', null],
    ['placement', 'failed', '{"verdict":"y"}', 'message technique'],
    ['done', 'done', '{"verdict":"z"}', null],
  ];
  for (const [step, status, triage, error] of runs) {
    await client.query(
      `insert into ingest_runs (tenant_id, source_id, turn_ids, step, status, triage, error, acl)
       values ($1, $2, array[$3::uuid], $4, $5, $6::jsonb, $7, array[$1::uuid])`,
      [org.id, source.id, turn.id, step, status, triage, error],
    );
  }
  // Une lecture de fiche, que le journal ne sait plus décrire.
  const type = await one<{ id: string }>(
    `insert into card_types (tenant_id, slug, label, acl) values ($1, 'client', 'Client', array[$1::uuid])
     returning id`,
    [org.id],
  );
  const card = await one<{ id: string }>(
    `insert into cards (tenant_id, type_id, title, status, acl)
     values ($1, $2, 'ACME', 'confirmed', array[$1::uuid]) returning id`,
    [org.id, type.id],
  );
  await client.query(
    `insert into read_log (tenant_id, user_id, client, card_id, acl)
     values ($1, $2, 'claude-code', $3, array[$1::uuid])`,
    [org.id, user.id, card.id],
  );
  return { sourceId: source.id };
}

async function replay(): Promise<Snapshot> {
  const client = new Client({ connectionString: TEST_ENV.DATABASE_URL_ADMIN });
  await client.connect();
  try {
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => /^\d{4}-[a-z0-9-]+\.sql$/.test(file))
      .sort();
    const before = files.filter((file) => file < '0010');
    const after = files.filter((file) => file === '0010-suppression-tri.sql');
    await client.query('begin');
    await client.query(`create schema ${SCHEMA}`);
    await client.query(`set local search_path = ${SCHEMA}, public`);
    await applyFiles(client, before);
    const { sourceId } = await seedFirstDraftData(client);
    await applyFiles(client, after);

    const runs = await client.query(
      'select step, status, error from ingest_runs order by created_at, step',
    );
    const readLogAfter = await client.query('select count(*)::int as n from read_log');
    const droppedTables: Record<string, string | null> = {};
    for (const table of DROPPED_TABLES) {
      const { rows } = await client.query('select to_regclass($1)::text as found', [
        `${SCHEMA}.${table}`,
      ]);
      droppedTables[table] = rows[0]?.found ?? null;
    }
    const columns = await client.query(
      `select column_name from information_schema.columns
        where table_schema = $1 and table_name = 'read_log' order by column_name`,
      [SCHEMA],
    );

    // Une étape de l'ancien tri est refusée (avant la suppression de la source, qui emporte ses runs).
    await client.query('savepoint etape');
    let badStepCode: string | null = null;
    try {
      await client.query(`update ingest_runs set step = 'triage'`);
    } catch (error) {
      badStepCode = (error as { code?: string }).code ?? null;
    }
    await client.query('rollback to savepoint etape');

    // La suppression d'une source emporte ses lectures (clé composée, on delete cascade).
    const { rows: tenantRows } = await client.query('select id from organization limit 1');
    const { rows: userRows } = await client.query('select id from "user" limit 1');
    await client.query(
      `insert into read_log (tenant_id, user_id, client, source_id, passage_id, acl)
       values ($1, $2, 'claude-code', $3, $4, array[$1::uuid])`,
      [tenantRows[0]?.id, userRows[0]?.id, sourceId, randomUUID()],
    );
    const cascadeBefore = await client.query('select count(*)::int as n from read_log');
    await client.query('delete from sources where id = $1', [sourceId]);
    const cascadeAfter = await client.query('select count(*)::int as n from read_log');

    // Un type d'outil hors liste passe : la liste se valide dans le code.
    let kindOutsideListCode: string | null = null;
    try {
      await client.query(
        `insert into sources (tenant_id, kind, external_id, owner_user_id, acl)
         values ($1, 'nouvel_outil', 'x', $2, array[$1::uuid])`,
        [tenantRows[0]?.id, userRows[0]?.id],
      );
    } catch (error) {
      kindOutsideListCode = (error as { code?: string }).code ?? 'inconnu';
    }

    return {
      runs: runs.rows,
      readLogAfter: readLogAfter.rows[0]?.n,
      droppedTables,
      readLogColumns: columns.rows.map((row) => row.column_name),
      readLogCascade: { before: cascadeBefore.rows[0]?.n, after: cascadeAfter.rows[0]?.n },
      badStepCode,
      kindOutsideListCode,
    };
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}

let snapshot: Snapshot;
beforeAll(async () => {
  snapshot = await replay();
});

describe('migration 0010 rejouée sur des données du tri', () => {
  it('repasse tous les runs en indexation en attente, sans leur ancienne erreur', () => {
    expect(snapshot.runs).toHaveLength(4);
    for (const run of snapshot.runs) {
      expect(run).toEqual({ step: 'index', status: 'queued', error: null });
    }
  });

  it('vide le journal de lecture, dont les lignes pointaient vers des fiches', () => {
    expect(snapshot.readLogAfter).toBe(0);
    expect(snapshot.readLogColumns).toEqual(
      expect.arrayContaining(['source_id', 'passage_id', 'client', 'user_id']),
    );
    expect(snapshot.readLogColumns).not.toContain('card_id');
  });

  it('supprime les tables du tri', () => {
    expect(snapshot.droppedTables).toEqual({
      review_items: null,
      facts: null,
      fact_candidates: null,
      card_aliases: null,
      cards: null,
      predicates: null,
      card_types: null,
    });
  });

  it("emporte les lectures d'une source supprimée", () => {
    expect(snapshot.readLogCascade).toEqual({ before: 1, after: 0 });
  });

  it("refuse une étape de l'ancien tri et accepte un outil hors liste", () => {
    expect(snapshot.badStepCode).toBe('23514');
    expect(snapshot.kindOutsideListCode).toBeNull();
  });
});

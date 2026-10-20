import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Migration 0020 : les corrections du second audit du 20/10 qui touchent la base.

let alice: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice']);
  [alice] = team.members as [TenantContext];
});

type Scans = Record<string, { seq: number; idx: number }>;

// Parcours des tables faits par la transaction en cours (pg_stat_xact_user_tables) : ils comptent ceux des
// fonctions appelées, quel que soit leur plan.
async function scans(client: { query: typeof adminPool.query }): Promise<Scans> {
  const { rows } = await client.query<{ relname: string; seq: string; idx: string }>(
    `select relname, seq_scan as seq, coalesce(idx_scan, 0) as idx from pg_stat_xact_user_tables
      where relname in ('passages', 'passage_vectors')`,
  );
  return Object.fromEntries(
    rows.map((row) => [row.relname, { seq: Number(row.seq), idx: Number(row.idx) }]),
  );
}

// Audit 2 n° 1 : passages_sans_vecteur (security definer) est planifiée sans la valeur du modèle : l'index de la
// première correction n'était jamais choisi et la table des passages était relue à chaque tic. Le test du premier
// tour vérifiait une requête recopiée à la main ; celui-ci compte les parcours de l'appel réel de la fonction, sur
// une table de passages tous vectorisés (le cas de chaque minute) et analysée.
it('le tic des vecteurs ne relit ni les passages ni les vecteurs quand tout est vectorisé', async () => {
  const model = `modele-${randomUUID()}`;
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    const {
      rows: [source],
    } = await client.query<{ id: string }>(
      `insert into sources (tenant_id, kind, external_id, owner_user_id, title, acl, metadata)
       values ($1, 'claude_code', $2, $3, 'Source', array[$3::uuid], '{}') returning id`,
      [alice.tenantId, randomUUID(), alice.userId],
    );
    const {
      rows: [turn],
    } = await client.query<{ id: string }>(
      `insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl)
       values ($1, $2, 'tour-0', 'user', 'Tour.', now(), 'connector', array[$3::uuid]) returning id`,
      [alice.tenantId, source?.id, alice.userId],
    );
    await client.query(
      `insert into passages (tenant_id, source_id, turn_id, ord, text, char_start, char_end, ts, acl)
       select $1, $2, $3, g, 'Passage ' || g, 0, 7, now(), array[$4::uuid] from generate_series(0, 2999) g`,
      [alice.tenantId, source?.id, turn?.id, alice.userId],
    );
    // Le premier tic d'un modèle peut tout relire (changement de modèle). Puis tous les passages de la base, ceux
    // des autres fichiers compris, reçoivent le vecteur de ce modèle, comme après le rattrapage.
    await client.query('select * from passages_sans_vecteur($1, 500)', [model]);
    await client.query(
      `insert into passage_vectors (passage_id, tenant_id, model, embedding, acl)
       select id, tenant_id, $1, array_fill(0.1, array[1024])::halfvec, acl from passages`,
      [model],
    );
    for (const table of ['passages', 'passage_vectors', 'passages_a_vectoriser']) {
      await client.query(`analyze ${table}`);
    }
    const before = await scans(client);

    await client.query('select * from passages_sans_vecteur($1, 500)', [model]);

    const after = await scans(client);
    for (const table of ['passages', 'passage_vectors']) {
      expect(after[table]?.seq, table).toBe(before[table]?.seq);
    }
  } finally {
    await client.query('rollback');
    client.release();
  }
});

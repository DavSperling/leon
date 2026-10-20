import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { beforeAll, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool, oneQueueTestAtATime } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedPassages } from '@/test/seed-search';

// Migration 0020 : les corrections du second audit du 20/10 qui touchent la base.

let alice: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice']);
  [alice] = team.members as [TenantContext];
});

// Lignes de ces tables lues par la transaction en cours, par un parcours complet ou par un index (lignes vivantes
// lues dans la table) : elles comptent celles des fonctions appelées, quel que soit leur plan. Les entrées d'index
// ne sont pas comptées : celles des lignes supprimées ou annulées par les autres tests y restent jusqu'au prochain
// nettoyage.
async function rowsRead(client: PoolClient): Promise<Record<string, number>> {
  const { rows } = await client.query<{ relname: string; lus: string }>(
    `select relname, pg_stat_get_xact_tuples_returned(oid) + pg_stat_get_xact_tuples_fetched(oid) as lus
       from pg_class
      where relnamespace = 'public'::regnamespace and relname in ('passages', 'passage_vectors')`,
  );
  return Object.fromEntries(rows.map((row) => [row.relname, Number(row.lus)]));
}

// Dans la transaction de `client` : 3 000 passages d'Alice, puis le vecteur de `model` pour tous les passages de la
// base (ceux des autres fichiers compris), comme après le rattrapage d'un modèle, et les tables analysées. Le premier
// tic d'un modèle peut tout relire (il remplit la file) : il passe avant, et avant toute écriture (comme le tic, qui
// l'appelle seul) : le remplissage attend les transactions qui écrivent dans la file.
async function vectorizeEverything(client: PoolClient, model: string): Promise<void> {
  await client.query('select * from passages_sans_vecteur($1, 500)', [model]);
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
  // Sauf ceux qu'une suppression des autres fichiers tient (ils disparaissent) : les attendre pourrait interbloquer.
  await client.query(
    `insert into passage_vectors (passage_id, tenant_id, model, embedding, acl)
     select id, tenant_id, $1, array_fill(0.1, array[1024])::halfvec, acl from passages
     for key share skip locked`,
    [model],
  );
  for (const table of ['passages', 'passage_vectors', 'passages_a_vectoriser']) {
    await client.query(`analyze ${table}`);
  }
}

// Les lignes de ces tables lues par `call` (l'appel réel d'une fonction), au deuxième appel : le premier fait le
// travail laissé par les autres fichiers de test (vieux vecteurs de leurs passages). Dans une transaction annulée.
function rowsReadBy(call: string): Promise<Record<string, number>> {
  return oneQueueTestAtATime(() => rowsReadInTransaction(call));
}

async function rowsReadInTransaction(call: string): Promise<Record<string, number>> {
  const client = await adminPool.connect();
  try {
    await client.query('begin');
    await vectorizeEverything(client, model);
    await client.query(call, [model]);
    const before = await rowsRead(client);
    await client.query(call, [model]);
    const after = await rowsRead(client);
    return Object.fromEntries(
      Object.keys(after).map((table) => [table, (after[table] ?? 0) - (before[table] ?? 0)]),
    );
  } finally {
    await client.query('rollback');
    client.release();
  }
}

// Le modèle des tests de plan, qu'aucun autre fichier n'écrit.
const model = `modele-${randomUUID()}`;

// Chaque table compte au moins les 3 000 lignes d'Alice : un parcours entier en lirait au moins autant. Les
// quelques lignes lues viennent des autres fichiers de test, qui en écrivent en même temps.
const FEW = 300;

// Audit 2 n° 1 : passages_sans_vecteur (security definer) est planifiée sans la valeur du modèle : l'index de la
// première correction n'était jamais choisi et la table des passages était relue à chaque tic. Le test du premier
// tour vérifiait une requête recopiée à la main ; celui-ci compte les parcours de l'appel réel de la fonction, sur
// une base toute vectorisée (le cas de chaque minute) et analysée.
it('le tic des vecteurs ne lit ni les passages ni les vecteurs en entier quand tout est vectorisé', async () => {
  const read = await rowsReadBy('select * from passages_sans_vecteur($1, 500)');

  expect(read.passages).toBeLessThan(FEW);
  expect(read.passage_vectors).toBeLessThan(FEW);
});

// Audit 2 n° 7 bis : le retrait des vieux vecteurs passe chaque minute ; sans vieux vecteur, il ne relit pas la
// table des vecteurs.
it('le retrait des vieux vecteurs ne lit pas la table des vecteurs en entier', async () => {
  const read = await rowsReadBy('select retirer_vieux_vecteurs($1, 5000)');

  expect(read.passages).toBeLessThan(FEW);
  expect(read.passage_vectors).toBeLessThan(FEW);
});

// Audit 2 n° 1 (suite) : le remplissage de la file au changement de modèle prenait un verrou partagé sur les vecteurs
// avant de vider la file. La suppression d'une source retire en cascade les lignes de la file, puis les vecteurs :
// elle attendait le remplissage, qui l'attendait (interblocage).
it('remplit la file d’un nouveau modèle sans interblocage avec une suppression en cours', () =>
  oneQueueTestAtATime(async () => {
    const [passageId] = (await seedPassages(alice, { count: 1, token: randomUUID() }))
      .passageIds as [string];
    const deleting = await adminPool.connect();
    const filling = await adminPool.connect();
    try {
      await deleting.query('begin');
      // La cascade d'une suppression : la file d'abord…
      await deleting.query('delete from passages_a_vectoriser where passage_id = $1', [passageId]);
      // Audit 3 n° 1 : le remplissage n'attend plus la suppression (il saute ce qu'elle tient) : il finit avant elle.
      const fill = await filling
        .query('select count(*) from passages_sans_vecteur($1, 1)', [`modele-${randomUUID()}`])
        .then(
          () => 'rempli',
          (error: Error) => error.message,
        );
      // … puis les vecteurs.
      await deleting.query('delete from passage_vectors where passage_id = $1', [passageId]);
      await deleting.query('commit');

      expect(fill).toBe('rempli');
    } finally {
      await deleting.query('rollback');
      deleting.release();
      filling.release();
      await adminPool.query('delete from passages where id = $1', [passageId]);
    }
  }));

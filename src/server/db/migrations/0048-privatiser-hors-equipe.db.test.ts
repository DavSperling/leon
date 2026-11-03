import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { recordReads } from '@/server/memory/read-log';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedIndexed } from '@/test/seed-indexed';

// Migration 0048 : aligner_sources_github() rend privées à qui les a branchées les sources GitHub hors des dépôts
// d'équipe, et rend à l'organisation celles d'un dépôt d'équipe, avec leurs tours, passages, vecteurs, runs et
// lectures notées.
// Fixtures par le propriétaire (hors RLS), l'appel sous withTenant, comme setDepotEquipe.

const tenantIds: string[] = [];
let ana: TenantContext; // administratrice
let paul: TenantContext; // a branché GitHub
let zoe: TenantContext; // l'autre organisation

beforeAll(async () => {
  const team = await createTestTenant(['Ana', 'Paul']);
  const other = await createTestTenant(['Zoé']);
  [ana, paul] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
});

// Les passages de ces tests ne doivent pas rester dans la file des vecteurs des autres fichiers.
afterAll(async () => {
  await adminPool.query('delete from depots_equipe where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
});

// Une source relevée avant le lot 2 : visible de toute l'organisation, quel que soit son dépôt. Son auteur l'a déjà
// lue une fois : le journal des lectures en a une ligne, avec l'accès de la source.
async function relevee(ctx: TenantContext, kind: 'github' | 'gitlab', repo: string) {
  const { sourceId } = await seedIndexed(ctx, {
    kind,
    acl: [ctx.tenantId],
    metadata: { nature: 'pull_request', origin: { repo } },
  });
  await recordReads(ctx, { tool: 'fetch', client: 'claude-code', reads: [{ sourceId }] });
  return sourceId;
}

const choose = (ctx: TenantContext, project: string) =>
  adminPool.query(
    `insert into depots_equipe (tenant_id, project, acl, choisi_par) values ($1, $2, array[$1::uuid], $3)`,
    [ctx.tenantId, project, ctx.userId],
  );

const align = (ctx: TenantContext) =>
  withTenant(ctx, (tx) => tx.execute(sql`select aligner_sources_github()`));

// L'accès de la source et de chacune de ses lignes, une entrée par table et par accès distinct.
async function accessOf(sourceId: string): Promise<Array<[string, string[]]>> {
  const { rows } = await adminPool.query<{ t: string; acl: string[] }>(
    `select t, acl::text[] as acl from (
       select 'sources' as t, acl from sources where id = $1
       union select 'turns', acl from turns where source_id = $1
       union select 'passages', acl from passages where source_id = $1
       union select 'passage_vectors', v.acl
               from passage_vectors v join passages p on p.id = v.passage_id where p.source_id = $1
       union select 'ingest_runs', acl from ingest_runs where source_id = $1
       union select 'read_log', acl from read_log where source_id = $1
     ) a order by t collate "C"`,
    [sourceId],
  );
  return rows.map((row) => [row.t, row.acl]);
}

const TABLES = ['ingest_runs', 'passage_vectors', 'passages', 'read_log', 'sources', 'turns'];
const everywhere = (acl: string[]) => TABLES.map((table): [string, string[]] => [table, acl]);

describe('aligner_sources_github', () => {
  it('rend privée à qui l’a branchée une source hors de la liste, et laisse à l’équipe celle d’un dépôt coché', async () => {
    const perso = await relevee(paul, 'github', 'Paul/Perso');
    const equipe = await relevee(paul, 'github', 'Acme/App');
    await choose(ana, 'github.com/acme/app');

    await align(ana);

    expect(await accessOf(perso)).toEqual(everywhere([paul.userId]));
    expect(await accessOf(equipe)).toEqual(everywhere([paul.tenantId]));
  });

  it('rend à l’équipe une source privée dont le dépôt entre dans la liste', async () => {
    const source = await relevee(paul, 'github', 'acme/site');
    await align(ana);
    expect(await accessOf(source)).toEqual(everywhere([paul.userId]));

    await choose(ana, 'github.com/acme/site');
    await align(ana);

    expect(await accessOf(source)).toEqual(everywhere([paul.tenantId]));
  });

  it('ne touche ni aux sources d’un autre outil, ni à une autre organisation', async () => {
    const gitlab = await relevee(paul, 'gitlab', 'paul/perso');
    const ailleurs = await relevee(zoe, 'github', 'zoe/perso');

    await align(ana);

    expect(await accessOf(gitlab)).toEqual(everywhere([paul.tenantId]));
    expect(await accessOf(ailleurs)).toEqual(everywhere([zoe.tenantId]));
  });

  // L'indexation recopie l'accès des tours sur les passages, et celui des passages sur les vecteurs, sous le verrou
  // partagé de leur source (lockSources). Ici la source est déjà privée, mais la relève, qui a lu la liste avant le
  // décochage, vient d'en écrire un tour avec l'accès de l'organisation : une indexation l'a recopié, sans valider.
  it('attend une indexation ouverte : les passages et vecteurs qu’elle écrit après un décochage finissent privés', async () => {
    const sourceId = await relevee(paul, 'github', 'Paul/Indexe');
    await align(ana);
    const { rows } = await adminPool.query<{ id: string }>(
      `insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, acl)
       select tenant_id, source_id, 'apres-decochage', role, 'Écrit après le décochage', ts, capture_mode,
              array[tenant_id]
         from turns where source_id = $1 limit 1
       returning id`,
      [sourceId],
    );
    const indexation = await adminPool.connect();
    try {
      await indexation.query('begin');
      await indexation.query('select id from sources where id = $1 for share', [sourceId]);
      await indexation.query(
        `with p as (
           insert into passages (tenant_id, source_id, turn_id, ord, text, char_start, char_end, ts, acl)
           select tenant_id, source_id, id, 0, text, 0, length(text), ts, acl from turns where id = $1
           returning id, tenant_id, acl)
         insert into passage_vectors (passage_id, tenant_id, model, embedding, acl)
         select p.id, p.tenant_id, v.model, v.embedding, p.acl
           from p, (select v.model, v.embedding
                      from passage_vectors v join passages q on q.id = v.passage_id
                     where q.source_id = $2 limit 1) v`,
        [rows[0]?.id, sourceId],
      );

      const aligned = align(ana).then(() => 'aligné');
      const waiting = new Promise((resolve) => setTimeout(() => resolve('en attente'), 300));
      expect(await Promise.race([aligned, waiting])).toBe('en attente');
      await indexation.query('commit');
      await aligned;
    } finally {
      await indexation.query('rollback');
      indexation.release();
    }

    expect(await accessOf(sourceId)).toEqual(everywhere([paul.userId]));
  });

  // Au déploiement, la boucle aligne toutes les organisations dans une seule transaction : un verrou gardé par
  // organisation jusqu'à la fin remplirait la table des verrous passé quelques milliers d'organisations.
  it('aligne une organisation de plus, dans la même transaction, sans garder un verrou de plus', async () => {
    const client = await adminPool.connect();
    const locksAfter = async (tenantId: string) => {
      await client.query(`select set_config('app.tenant', $1, true)`, [tenantId]);
      await client.query('select aligner_sources_github()');
      const { rows } = await client.query<{ n: number }>(
        'select count(*)::int as n from pg_locks where pid = pg_backend_pid()',
      );
      return rows[0]?.n;
    };
    try {
      await client.query('begin');
      await client.query('select txid_current()');
      const first = await locksAfter(paul.tenantId);
      expect(await locksAfter(zoe.tenantId)).toBe(first);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('ne s’exécute pas pour public, seulement pour leon_app, avec les droits du propriétaire', async () => {
    const signature = 'aligner_sources_github()';
    const { rows } = await adminPool.query(
      `select (select count(*)::int
                 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = $1::regprocedure and a.grantee = 0
                  and a.privilege_type = 'EXECUTE') as public_grants,
              has_function_privilege('leon_app', $1::regprocedure, 'EXECUTE') as app,
              (select prosecdef from pg_proc where oid = $1::regprocedure) as definer`,
      [signature],
    );

    expect(rows).toEqual([{ public_grants: 0, app: true, definer: true }]);
  });
});

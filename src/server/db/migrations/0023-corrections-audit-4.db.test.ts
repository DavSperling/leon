import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool, oneQueueTestAtATime } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedPassages } from '@/test/seed-search';

// Migration 0023 : les corrections du quatrième audit du 20/10 qui touchent la base.

let alice: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice']);
  [alice] = team.members as [TenantContext];
});

// Audit 4 n° 2 : le retrait ne visait que les passages qui ont le vecteur du modèle courant. Un passage sorti de la
// file sans l'avoir (texte refusé par le fournisseur, propriétaire parti) gardait pour toujours celui de l'ancien
// modèle. Sous la règle « un modèle », il est retiré, mais seulement une fois la file remplie pour ce modèle :
// avant, un passage absent de la file peut encore y entrer.
it('retire le vieux vecteur d’un passage sorti de la file, une fois la file remplie', () =>
  oneQueueTestAtATime(async () => {
    const { sourceId, passageIds } = await seedPassages(alice, { count: 2, token: randomUUID() });
    const [refused, waiting] = passageIds as [string, string];
    const model = `modele-${randomUUID()}`;
    const old = `ancien-${randomUUID()}`;
    // Une seule transaction, annulée : le retrait ne touche pas aux vecteurs des autres fichiers.
    const client = await adminPool.connect();
    const left = async () => {
      const { rows } = await client.query<{ passage_id: string }>(
        'select passage_id from passage_vectors where passage_id = any($1) order by passage_id',
        [passageIds],
      );
      return rows.map((row) => row.passage_id);
    };
    try {
      await client.query('begin');
      for (let call = 0; call < 50; call++) {
        await client.query('select count(*) from passages_sans_vecteur($1, 1)', [model]);
        const { rows } = await client.query<{ rempli: boolean }>(
          'select rempli from passages_a_vectoriser_modele where model = $1',
          [model],
        );
        if (rows[0]?.rempli) break;
      }
      // Le passage refusé sort de la file (sortir_de_la_file) ; l'autre y attend son vecteur.
      await client.query('delete from passages_a_vectoriser where passage_id = $1', [refused]);
      await client.query(
        `insert into passage_vectors (passage_id, tenant_id, model, embedding, acl)
         select id, tenant_id, $2, array_fill(0.1, array[1024])::halfvec, acl from passages where id = any($1)`,
        [passageIds, old],
      );

      await client.query('update passages_a_vectoriser_modele set rempli = false');
      await client.query('select retirer_vieux_vecteurs($1, 100000)', [model]);
      const whileFilling = await left();
      await client.query('update passages_a_vectoriser_modele set rempli = true');
      await client.query('select retirer_vieux_vecteurs($1, 100000)', [model]);
      const filled = await left();

      expect(whileFilling).toEqual([...passageIds].sort());
      expect(filled).toEqual([waiting]);
    } finally {
      await client.query('rollback');
      client.release();
      await adminPool.query('delete from sources where id = $1', [sourceId]);
    }
  }));

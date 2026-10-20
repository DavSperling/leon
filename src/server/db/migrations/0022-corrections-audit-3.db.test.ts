import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool, oneQueueTestAtATime } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedPassages } from '@/test/seed-search';

// Migration 0022 : les corrections du troisième audit du 20/10 qui touchent la base.

let alice: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice']);
  [alice] = team.members as [TenantContext];
});

// Une attente de verrou plus longue échoue : le test dit « attend » au lieu de pendre. Large : les autres fichiers
// de test changent aussi le modèle de la file, et la ligne du modèle reste verrouillée le temps de leur appel.
const LOCK_TIMEOUT = "set lock_timeout = '8s'";

async function filled(model: string): Promise<boolean> {
  const { rows } = await adminPool.query<{ rempli: boolean }>(
    'select rempli from passages_a_vectoriser_modele where model = $1',
    [model],
  );
  return rows[0]?.rempli ?? false;
}

// Audit 3 n° 1 : au changement de modèle, la file était vidée (truncate) puis remplie dans la même transaction :
// une suppression de source, qui retire en cascade les lignes de la file, attendait la fin de tout le remplissage,
// et le remplissage attendait les suppressions en cours.
it('remplit la file d’un nouveau modèle sans attendre une suppression de source en cours', () =>
  oneQueueTestAtATime(async () => {
    const { sourceId } = await seedPassages(alice, { count: 3, token: randomUUID() });
    const model = `modele-${randomUUID()}`;
    const deleting = await adminPool.connect();
    const tick = await adminPool.connect();
    try {
      await deleting.query('begin');
      await deleting.query('delete from sources where id = $1', [sourceId]);
      // Le tic : des appels successifs, chacun dans sa transaction, jusqu'à la fin du remplissage.
      await tick.query(LOCK_TIMEOUT);
      for (let call = 0; call < 20; call++) {
        await tick.query('select count(*) from passages_sans_vecteur($1, 500)', [model]);
        if (await filled(model)) break;
      }
      await deleting.query('commit');

      expect(await filled(model)).toBe(true);
    } finally {
      await deleting.query('rollback');
      await tick.query('reset lock_timeout');
      deleting.release();
      tick.release();
      await adminPool.query('delete from sources where id = $1', [sourceId]);
    }
  }));

it('une suppression de source pendant le remplissage n’en attend pas la fin', () =>
  oneQueueTestAtATime(async () => {
    const model = `modele-${randomUUID()}`;
    // Écrits à l'instant : déjà dans la file (déclencheur), ils ne sont ni du lot en cours de remplissage ni de la
    // tête de la file que lit l'appel.
    const { sourceId } = await seedPassages(alice, {
      count: 3,
      token: randomUUID(),
      createdAt: new Date(),
    });
    const filling = await adminPool.connect();
    const deleting = await adminPool.connect();
    try {
      // Le remplissage est en cours : sa transaction est ouverte.
      await filling.query('begin');
      await filling.query('select count(*) from passages_sans_vecteur($1, 500)', [model]);

      await deleting.query('begin');
      await deleting.query(LOCK_TIMEOUT);
      const deleted = await deleting.query('delete from sources where id = $1', [sourceId]).then(
        (result) => result.rowCount,
        (error: Error) => error.message,
      );
      await deleting.query('commit');
      await filling.query('commit');

      expect(deleted).toBe(1);
    } finally {
      await deleting.query('rollback');
      await filling.query('rollback');
      deleting.release();
      filling.release();
      await adminPool.query('delete from sources where id = $1', [sourceId]);
    }
  }));

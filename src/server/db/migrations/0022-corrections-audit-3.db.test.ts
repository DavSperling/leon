import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool, oneQueueTestAtATime } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedPassages } from '@/test/seed-search';

// Migration 0022 : les corrections du troisième audit du 20/10 qui touchent la base.

let alice: TenantContext;
let leaver: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Alice', 'Départ']);
  [alice, leaver] = team.members as [TenantContext, TenantContext];
});

// Le membre parti : sa ligne `member` est retirée, ses sources restent.
const leave = (ctx: TenantContext) =>
  adminPool.query('delete from member where "userId" = $1 and "organizationId" = $2', [
    ctx.userId,
    ctx.tenantId,
  ]);

async function queued(passageIds: string[]): Promise<number> {
  const { rows } = await adminPool.query<{ n: number }>(
    'select count(*)::int as n from passages_a_vectoriser where passage_id = any($1)',
    [passageIds],
  );
  return rows[0]?.n ?? 0;
}

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

// Audit 3 n° 2 : le remplissage mettait en file les passages d'un propriétaire parti, que la lecture sautait sans
// les retirer : la tête de la file les reparcourait à chaque tic.
describe('membres partis', () => {
  let departed: { sourceId: string; passageIds: string[] };
  let kept: { sourceId: string; passageIds: string[] };

  beforeAll(async () => {
    const token = randomUUID();
    kept = await seedPassages(alice, { count: 2, token });
    departed = await seedPassages(leaver, { count: 2, token });
    await leave(leaver);
  });

  it('le remplissage ne met en file que les passages d’un membre', () =>
    oneQueueTestAtATime(async () => {
      // Hors de la file, comme des passages vectorisés dans l'ancien modèle.
      await adminPool.query('delete from passages_a_vectoriser where passage_id = any($1)', [
        [...kept.passageIds, ...departed.passageIds],
      ]);
      const model = `modele-${randomUUID()}`;

      for (let call = 0; call < 20; call++) {
        await adminPool.query('select count(*) from passages_sans_vecteur($1, 1)', [model]);
        if (await filled(model)) break;
      }

      expect(await queued(kept.passageIds)).toBe(2);
      expect(await queued(departed.passageIds)).toBe(0);
    }));

  it('la lecture sort de la file les passages d’un propriétaire parti', async () => {
    await adminPool.query(
      `insert into passages_a_vectoriser (tenant_id, passage_id, created_at)
       select tenant_id, id, created_at from passages where id = any($1)
       on conflict do nothing`,
      [departed.passageIds],
    );

    await adminPool.query('select count(*) from passages_sans_vecteur($1, 1000000)', [
      `modele-${randomUUID()}`,
    ]);

    expect(await queued(departed.passageIds)).toBe(0);
  });
});

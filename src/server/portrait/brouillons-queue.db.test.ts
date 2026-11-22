import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { lignesFiche } from '@/server/db/schema/portrait';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import {
  BROUILLONS_QUEUE,
  enqueueBrouillons,
  getBrouillonsBoss,
  requestBrouillons,
} from './brouillons-queue';
import { answerProposal } from './propositions';

// La file `brouillons-ecrire` sur le vrai pg-boss de la base de test : la règle « un seul passage en attente et un seul
// en cours par personne » est celle de la file (politique `stately`), pas du code. Aucun worker ne la lit ici, et ce
// fichier est le seul à y mettre des travaux. Le déclencheur de la relève se teste avec elle (connectors/sync.db.test.ts).

const jobs: Array<{ tenantId: string; userId: string }> = [];
const tenantIds: string[] = [];
const person = () => {
  const job = { tenantId: randomUUID(), userId: randomUUID() };
  jobs.push(job);
  return job;
};

async function statesOf(job: { tenantId: string; userId: string }): Promise<string[]> {
  const boss = await getBrouillonsBoss();
  const found = await boss.findJobs(BROUILLONS_QUEUE, { key: `${job.tenantId}:${job.userId}` });
  return found.map((one) => one.state).sort();
}

afterAll(async () => {
  const boss = await getBrouillonsBoss();
  for (const job of jobs) {
    const found = await boss.findJobs(BROUILLONS_QUEUE, { key: `${job.tenantId}:${job.userId}` });
    if (found.length > 0)
      await boss.deleteJob(
        BROUILLONS_QUEUE,
        found.map((one) => one.id),
      );
  }
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await boss.stop();
});

// Julie, sa boîte Gmail branchée par elle et une fiche qui compte une réponse : l'agent lui est proposé.
async function julie(): Promise<TenantContext> {
  const { tenantId, members } = await createTestTenant(['Julie Martin']);
  tenantIds.push(tenantId);
  const [ctx] = members as [TenantContext];
  jobs.push(ctx);
  await seedConnection(ctx, { provider: 'gmail' });
  const side = { medianeMinutes: 42, reponses: 3 };
  await adminDb.insert(lignesFiche).values({
    tenantId,
    userId: ctx.userId,
    genre: 'delai-reponse',
    valeur: { tous: side, interne: side, externe: side },
    provenance: 'calcul',
    mails: 40,
    acl: [ctx.userId],
  });
  return ctx;
}

describe('la file brouillons-ecrire sur le vrai pg-boss', () => {
  it('est « stately », avec deux reprises', async () => {
    const queue = await (await getBrouillonsBoss()).getQueue(BROUILLONS_QUEUE);

    expect(queue).toMatchObject({ policy: 'stately', retryLimit: 2 });
  });

  it('un seul passage en attente et un seul en cours par personne ; celui d’une autre s’ajoute', async () => {
    const boss = await getBrouillonsBoss();
    const one = person();
    const other = person();

    expect(await enqueueBrouillons(one)).toBe(true);
    expect(await enqueueBrouillons(one)).toBe(false);
    expect(await enqueueBrouillons(other)).toBe(true);
    expect(await statesOf(one)).toEqual(['created']);
    expect(await statesOf(other)).toEqual(['created']);

    // Son passage en cours : une demande de plus attend derrière lui, une troisième ne s'ajoute pas.
    await boss.fetch(BROUILLONS_QUEUE, { batchSize: 10 });
    expect(await statesOf(one)).toEqual(['active']);
    expect(await enqueueBrouillons(one)).toBe(true);
    expect(await enqueueBrouillons(one)).toBe(false);
    expect(await statesOf(one)).toEqual(['active', 'created']);
    // Tant que le premier n'a pas fini, le second n'est pas pris : jamais deux passages à la fois pour elle.
    const fetched = await boss.fetch(BROUILLONS_QUEUE, { batchSize: 10 });
    expect(fetched).toEqual([]);
    expect(await statesOf(one)).toEqual(['active', 'created']);
  });

  it('le travail ne porte que les deux identifiants de la personne', async () => {
    const boss = await getBrouillonsBoss();
    const ctx = { ...person(), principals: ['x'], equipe: true };

    await enqueueBrouillons(ctx);

    const [job] = await boss.findJobs(BROUILLONS_QUEUE, { key: `${ctx.tenantId}:${ctx.userId}` });
    expect(job?.data).toEqual({ tenantId: ctx.tenantId, userId: ctx.userId });
    await expect(enqueueBrouillons({ tenantId: 'x', userId: ctx.userId })).rejects.toThrow();
  });
});

describe('requestBrouillons : un passage seulement pour qui a dit oui', () => {
  const answer = (ctx: TenantContext, oui: boolean) =>
    adminPool.query(
      `insert into reponses_agent (tenant_id, user_id, agent, oui, acl)
       values ($1, $2, 'brouillon-reponse', $3, array[$2::uuid])
       on conflict (tenant_id, user_id, agent) do update set oui = excluded.oui`,
      [ctx.tenantId, ctx.userId, oui],
    );

  it('sans réponse, ou après un non, rien ne part en file ; après un oui, un passage', async () => {
    const ctx = await julie();

    await requestBrouillons(ctx);
    await answer(ctx, false);
    await requestBrouillons(ctx);
    expect(await statesOf(ctx)).toEqual([]);

    await answer(ctx, true);
    await requestBrouillons(ctx);
    await requestBrouillons(ctx);
    expect(await statesOf(ctx)).toEqual(['created']);
  });

  it('son oui à un autre agent ne demande rien', async () => {
    const ctx = await julie();
    await adminPool.query(
      `insert into reponses_agent (tenant_id, user_id, agent, oui, acl)
       values ($1, $2, 'point-du-jour', true, array[$2::uuid])`,
      [ctx.tenantId, ctx.userId],
    );

    await requestBrouillons(ctx);

    expect(await statesOf(ctx)).toEqual([]);
  });

  it('une demande qui échoue est journalisée, sans lever', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      requestBrouillons({ tenantId: 'pas-un-uuid', userId: randomUUID(), principals: [] }),
    ).resolves.toBeUndefined();

    expect(log.mock.calls.flat().map(String).join('\n')).toContain('brouillons.enqueue');
    log.mockRestore();
  });
});

describe('answerProposal : son « oui » à l’agent en service demande un premier passage', () => {
  it('oui : un passage en file ; non : rien', async () => {
    const yes = await julie();
    const no = await julie();

    expect(await answerProposal(yes, 'brouillon-reponse', true)).toBe(true);
    expect(await answerProposal(no, 'brouillon-reponse', false)).toBe(true);

    expect(await statesOf(yes)).toEqual(['created']);
    expect(await statesOf(no)).toEqual([]);
  });

  it('un oui à un agent qui n’est pas en service ne demande rien', async () => {
    const ctx = await julie();

    expect(await answerProposal(ctx, 'point-du-jour', true)).toBe(true);

    expect(await statesOf(ctx)).toEqual([]);
  });

  it('un oui refusé (l’agent ne lui est pas proposé) ne demande rien', async () => {
    const { tenantId, members } = await createTestTenant(['Paul Durand']);
    tenantIds.push(tenantId);
    const [paul] = members as [TenantContext];
    jobs.push(paul);

    expect(await answerProposal(paul, 'brouillon-reponse', true)).toBe(false);

    expect(await statesOf(paul)).toEqual([]);
  });
});

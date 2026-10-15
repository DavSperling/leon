import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { adminDb, adminPool } from '@/test/db';
import { fakeConnector } from '@/test/fake-connector';
import { collect, fakeFetch } from '@/test/fake-fetch';
import { createTestTenant, createTestUser, seedConnection } from '@/test/fixtures';
import type { ConnectorHttp } from './http';
import { runConnectorSync, SYNC_ITEMS_MAX, type SyncDeps } from './sync';
import type { AnyConnector, ConnectorItem, SyncPage } from './types';

vi.mock('@/server/pipeline/queue');

// Une organisation neuve par test (Paul y branche l'outil) : le connecteur factice rend toujours
// les mêmes identifiants d'élément, et une source se retrouve par (organisation, créateur, outil,
// identifiant). La base de test est partagée : on ne retire que nos connexions, une connexion n'est
// due que si le test le veut, et on n'asserte que sur nos propres ids (voir « Connexions dans les
// tests » dans le plan).

const DUE = new Date('2000-01-01T00:00:00Z');

const tenantIds: string[] = [];
let tenantId: string;
let paul: TenantContext;

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(async () => {
  vi.mocked(enqueuePipelineStep).mockReset();
  const team = await createTestTenant(['Paul']);
  tenantId = team.tenantId;
  [paul] = team.members as [TenantContext];
  tenantIds.push(tenantId);
});

type Row = {
  status: string;
  cursor: string | null;
  next_sync_at: Date | null;
  seconds_to_next: number | null;
  sync_lock_at: Date | null;
  last_sync_at: Date | null;
  last_error: string | null;
  items_synced: number;
};

async function readRow(id: string): Promise<Row> {
  const { rows } = await adminPool.query<Row>(
    `select status, cursor, next_sync_at, sync_lock_at, last_sync_at, last_error, items_synced,
            extract(epoch from next_sync_at - now())::float as seconds_to_next
     from connections where id = $1`,
    [id],
  );
  if (!rows[0]) throw new Error('connexion introuvable');
  return rows[0];
}

async function sourceCount(id: string): Promise<{ total: number; distinct: number }> {
  const { rows } = await adminPool.query<{ total: number; distinct: number }>(
    `select count(*)::int as total, count(distinct external_id)::int as distinct
     from sources where connection_id = $1`,
    [id],
  );
  return rows[0] ?? { total: 0, distinct: 0 };
}

const makeDue = (id: string) =>
  adminPool.query('update connections set next_sync_at = $2 where id = $1', [id, DUE]);

const dueConnection = () => seedConnection(paul, { nextSyncAt: DUE });

function run(id: string, connector: AnyConnector | null, extra: Partial<SyncDeps> = {}) {
  const job = { connectionId: id, tenantId, userId: paul.userId };
  return runConnectorSync(job, { getConnector: () => connector, ...extra });
}

const MINUTE = 60;
const expectDelayAbout = (row: Row, seconds: number) => {
  expect(row.seconds_to_next).toBeGreaterThan(seconds - 30);
  expect(row.seconds_to_next).toBeLessThanOrEqual(seconds + 5);
};

describe('runConnectorSync : un passage qui réussit', () => {
  it('ingère tous les éléments, garde le curseur et planifie le prochain passage dans 15 minutes', async () => {
    const id = await dueConnection();

    const result = await run(id, fakeConnector({ items: 30, pageSize: 10 }));

    expect(result).toBe('ok');
    expect(await sourceCount(id)).toEqual({ total: 30, distinct: 30 });
    const row = await readRow(id);
    expect(row).toMatchObject({
      status: 'active',
      cursor: '30',
      items_synced: 30,
      last_error: null,
      sync_lock_at: null,
    });
    expect(row.last_sync_at).not.toBeNull();
    expectDelayAbout(row, 15 * MINUTE);
  });

  it('met chaque élément nouveau en file du pipeline, au nom du créateur de la connexion', async () => {
    const id = await dueConnection();

    await run(id, fakeConnector({ items: 3, pageSize: 3 }));

    const calls = vi.mocked(enqueuePipelineStep).mock.calls;
    expect(calls).toHaveLength(3);
    for (const [step, job] of calls) {
      expect(step).toBe('triage');
      expect(job).toMatchObject({ tenantId, userId: paul.userId });
    }
  });

  it('reprend après le curseur enregistré : un second passage ne refait rien', async () => {
    const id = await dueConnection();
    const connector = fakeConnector({ items: 5, pageSize: 5 });
    await run(id, connector);
    await makeDue(id);

    expect(await run(id, connector)).toBe('ok');

    expect(await sourceCount(id)).toEqual({ total: 5, distinct: 5 });
    expect((await readRow(id)).items_synced).toBe(5);
  });

  it("s'arrête à 200 éléments puis reprend une minute plus tard, sans doublon", async () => {
    expect(SYNC_ITEMS_MAX).toBe(200);
    const id = await dueConnection();
    const connector = fakeConnector({ items: 450, pageSize: 100 });

    expect(await run(id, connector)).toBe('ok');
    expect((await sourceCount(id)).total).toBe(200);
    const first = await readRow(id);
    expect(first.cursor).toBe('200');
    expectDelayAbout(first, MINUTE);

    await makeDue(id);
    expect(await run(id, connector)).toBe('ok');
    expect((await sourceCount(id)).total).toBe(400);
    expectDelayAbout(await readRow(id), MINUTE);

    await makeDue(id);
    expect(await run(id, connector)).toBe('ok');
    expect(await sourceCount(id)).toEqual({ total: 450, distinct: 450 });
    const last = await readRow(id);
    expect(last.items_synced).toBe(450);
    expectDelayAbout(last, 15 * MINUTE);
  });

  it("n'ingère pas un élément refusé par la normalisation et garde le curseur de la page", async () => {
    const id = await dueConnection();
    const good = await oneItem();
    const bad = { ...good, externalId: 'fake:mauvaise-date', updatedAt: '2026-01-01 10:00:00' };
    const connector = inlineConnector(async () => [{ items: [bad, good], cursor: 'page-1' }]);

    expect(await run(id, connector)).toBe('ok');

    expect((await sourceCount(id)).total).toBe(1);
    expect(await readRow(id)).toMatchObject({ cursor: 'page-1', items_synced: 1 });
  });
});

describe('runConnectorSync : une clé refusée ou une panne', () => {
  it('passe en erreur sans échéance quand la clé est refusée à la page 2, et garde le curseur de la page 1', async () => {
    const id = await dueConnection();

    const result = await run(
      id,
      fakeConnector({ items: 250, pageSize: 100, failAt: { page: 2, status: 401 } }),
    );

    expect(result).toBe('auth_error');
    const row = await readRow(id);
    expect(row).toMatchObject({
      status: 'error',
      next_sync_at: null,
      cursor: '100',
      sync_lock_at: null,
      last_error: 'Clé refusée par GitHub : vérifiez-la ou remplacez-la.',
    });
    expect((await sourceCount(id)).total).toBe(100);
  });

  it('retente dans une heure après une autre erreur', async () => {
    const id = await dueConnection();

    const result = await run(
      id,
      fakeConnector({ items: 10, pageSize: 10, failAt: { page: 1, status: 500 } }),
    );

    expect(result).toBe('error');
    const row = await readRow(id);
    expect(row).toMatchObject({ status: 'error', sync_lock_at: null, cursor: null });
    expect(row.last_error).toBe('GitHub a répondu 500');
    expectDelayAbout(row, 60 * MINUTE);
  });

  it("n'écrit dans last_error ni le corps de la réponse ni la clé (client HTTP réel, 503 en boucle)", async () => {
    const id = await dueConnection();
    const connector = inlineConnector(async (http) => {
      await http.json({ url: 'https://api.github.test/issues?key=secret-de-test' }, z.unknown());
      return [];
    });
    const fetchImpl = fakeFetch(
      Array.from({ length: 4 }, () => ({
        url: 'https://api.github.test/issues',
        status: 503,
        text: '{"detail":"corps-secret-xyz"}',
      })),
    );

    const result = await run(id, connector, { fetchImpl, sleep: async () => {} });

    expect(result).toBe('error');
    expect(fetchImpl.calls).toHaveLength(4);
    const { last_error } = await readRow(id);
    expect(last_error).toBe('GitHub a répondu 503');
    expect(last_error).not.toContain('corps-secret-xyz');
    expect(last_error).not.toContain('secret-de-test');
  });

  it('traite une clé refusée par le client HTTP réel (401) comme une clé refusée', async () => {
    const id = await dueConnection();
    const connector = inlineConnector(async (http) => {
      await http.json({ url: 'https://api.github.test/issues' }, z.unknown());
      return [];
    });
    const fetchImpl = fakeFetch([{ url: 'https://api.github.test/issues', status: 401, json: {} }]);

    expect(await run(id, connector, { fetchImpl, sleep: async () => {} })).toBe('auth_error');

    expect(await readRow(id)).toMatchObject({ status: 'error', next_sync_at: null });
  });

  it('résume sans détail une erreur inattendue du connecteur', async () => {
    const id = await dueConnection();
    const connector = inlineConnector(async () => {
      throw new TypeError('boum');
    });

    expect(await run(id, connector)).toBe('error');

    expect((await readRow(id)).last_error).toBe('TypeError: boum');
  });
});

describe('runConnectorSync : ce qui ne se synchronise pas', () => {
  it("ne touche pas une connexion qui n'est pas due", async () => {
    const id = await seedConnection(paul);
    const getConnector = vi.fn(() => fakeConnector({ items: 3, pageSize: 3 }));

    const result = await runConnectorSync(
      { connectionId: id, tenantId, userId: paul.userId },
      { getConnector },
    );

    expect(result).toBe('skipped');
    expect(getConnector).not.toHaveBeenCalled();
    expect(await readRow(id)).toMatchObject({ sync_lock_at: null, last_sync_at: null });
  });

  it("ne fait rien quand le créateur n'est plus dans l'organisation", async () => {
    const leaver = await createTestUser(tenantId, 'Léa');
    const id = await seedConnection(leaver, { nextSyncAt: DUE });
    await adminDb.delete(members).where(eq(members.userId, leaver.userId));
    const getConnector = vi.fn(() => fakeConnector({ items: 3, pageSize: 3 }));

    const result = await runConnectorSync(
      { connectionId: id, tenantId, userId: leaver.userId },
      { getConnector },
    );

    expect(result).toBe('skipped');
    expect(getConnector).not.toHaveBeenCalled();
    expect((await sourceCount(id)).total).toBe(0);
  });

  it("signale un connecteur qui n'existe pas encore", async () => {
    const id = await dueConnection();

    expect(await run(id, null)).toBe('error');

    const row = await readRow(id);
    expect(row).toMatchObject({
      status: 'error',
      last_error: 'Connecteur indisponible',
      sync_lock_at: null,
    });
    expectDelayAbout(row, 60 * MINUTE);
  });

  it("demande de rebrancher l'outil quand la configuration ne passe plus le schéma", async () => {
    const id = await dueConnection();
    const connector: AnyConnector = {
      ...fakeConnector({ items: 3, pageSize: 3 }),
      configSchema: z.object({ token: z.string(), site: z.string().min(1) }),
    };

    expect(await run(id, connector)).toBe('error');

    expect(await readRow(id)).toMatchObject({
      status: 'error',
      last_error: "Configuration illisible : rebranchez l'outil",
      sync_lock_at: null,
    });
    expect((await sourceCount(id)).total).toBe(0);
  });

  it('demande de remplacer une clé recopiée depuis une autre connexion, sans la montrer', async () => {
    const source = await seedConnection(paul);
    const target = await dueConnection();
    await adminPool.query(
      'update connections set secret = (select secret from connections where id = $1) where id = $2',
      [source, target],
    );

    expect(await run(target, fakeConnector({ items: 3, pageSize: 3 }))).toBe('error');

    const row = await readRow(target);
    expect(row).toMatchObject({
      status: 'error',
      last_error: 'Clé illisible : remplacez-la.',
      sync_lock_at: null,
    });
    expectDelayAbout(row, 60 * MINUTE);
  });
});

// Un connecteur dont les pages (ou l'erreur) sont celles du test.
function inlineConnector(pages: (http: ConnectorHttp) => Promise<SyncPage[]>): AnyConnector {
  return {
    ...fakeConnector({ items: 0, pageSize: 1 }),
    async *sync(_config, _state, http) {
      yield* await pages(http);
    },
  };
}

async function oneItem(): Promise<ConnectorItem> {
  const connector = fakeConnector({ items: 1, pageSize: 1 });
  const state = { cursor: null, since: new Date() };
  const [page] = await collect(connector.sync({ token: 'x' }, state, undefined as never));
  return page?.items[0] as ConnectorItem;
}

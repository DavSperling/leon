import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { adminDb, adminPool } from '@/test/db';
import { fakeConnector } from '@/test/fake-connector';
import { collect, fakeFetch } from '@/test/fake-fetch';
import { fakeOAuthConnector } from '@/test/fake-oauth-connector';
import { createTestTenant, createTestUser, seedConnection } from '@/test/fixtures';
import { createConnection, listConnections, saveOAuthTokens } from './connections';
import { gmailConnector } from './gmail/connector';
import { ConnectorAuthError, type ConnectorHttp } from './http';
import { OAUTH_SECRET_FIELDS } from './oauth';
import { forgetPipedreamToken, PIPEDREAM_SECRET_FIELDS } from './pipedream';
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

  it("met l'indexation de chaque élément nouveau en file, au nom du créateur de la connexion", async () => {
    const id = await dueConnection();

    await run(id, fakeConnector({ items: 3, pageSize: 3 }));

    const calls = vi.mocked(enqueuePipelineStep).mock.calls;
    expect(calls).toHaveLength(3);
    for (const [step, job] of calls) {
      expect(step).toBe('index');
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

  // Audit 2 n° 16 : une page qui retire des éléments (Outlook : un événement devenu privé) retire
  // leurs sources ; les autres restent.
  it('retire la source d’un élément retiré par une page (removed)', async () => {
    const id = await dueConnection();
    await run(id, fakeConnector({ items: 3, pageSize: 3 }));
    await makeDue(id);
    const removal = inlineConnector(async () => [{ items: [], removed: ['fake:2'], cursor: '3' }]);

    expect(await run(id, removal)).toBe('ok');

    const { rows } = await adminPool.query<{ external_id: string }>(
      'select external_id from sources where connection_id = $1 order by external_id',
      [id],
    );
    expect(rows.map((row) => row.external_id)).toEqual(['fake:1', 'fake:3']);
  });
});

// Audit n° 4 : une autre relève a repris la connexion en plein passage (réservation jugée
// abandonnée) ; l'ancienne s'arrête sans rien écrire : ni curseur, ni fin de passage.
describe('runConnectorSync : une réservation reprise', () => {
  it("s'arrête sans écrire quand une autre relève a repris la connexion", async () => {
    const id = await dueConnection();
    const [first, second] = [await oneItem(), { ...(await oneItem()), externalId: 'fake:2' }];
    const connector: AnyConnector = {
      ...fakeConnector({ items: 0, pageSize: 1 }),
      async *sync() {
        yield { items: [first], cursor: 'page-1' };
        await adminPool.query(
          'update connections set last_sync_started_at = now(), sync_lock_at = now() where id = $1',
          [id],
        );
        yield { items: [second], cursor: 'page-2' };
      },
    };

    expect(await run(id, connector)).toBe('skipped');

    const row = await readRow(id);
    expect(row).toMatchObject({ cursor: 'page-1', items_synced: 1, last_sync_at: null });
    expect(row.sync_lock_at).not.toBeNull();
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

describe('runConnectorSync : une connexion OAuth', () => {
  const TOKEN_URL = 'https://github.test/login/oauth/access_token';
  const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const tokenRoute = (json: unknown, status = 200) => ({
    method: 'POST' as const,
    url: TOKEN_URL,
    status,
    json,
  });

  beforeEach(() => {
    vi.stubEnv('LEON_OAUTH_GITHUB_ID', 'id-appli');
    vi.stubEnv('LEON_OAUTH_GITHUB_SECRET', 'secret-appli-xyz');
  });
  afterEach(() => vi.unstubAllEnvs());

  async function oauthConnection(extra: Record<string, unknown> = {}): Promise<string> {
    const id = await createConnection(paul, {
      provider: 'github',
      label: 'Connexion OAuth',
      config: {
        authMode: 'oauth',
        accessToken: 'acces-ancien-0001',
        refreshToken: 'rafraichir-ancien',
        expiresAt: inMinutes(60),
        repos: ['acme/leon'],
        ...extra,
      },
      secretFields: [...OAUTH_SECRET_FIELDS, 'token'],
      since: new Date(Date.now() - 30 * 24 * 3_600_000),
    });
    await makeDue(id);
    return id;
  }

  const storedConfig = async (id: string) =>
    (await listConnections(paul)).find((view) => view.id === id)?.config;
  const hintOf = async (id: string) =>
    (await listConnections(paul)).find((view) => view.id === id)?.secretHint;

  // Un connecteur dont le premier accès est refusé (401 par défaut) et le second accepté.
  const refusesOldAccess = (acceptsNew: boolean, status = 401): AnyConnector => ({
    ...fakeOAuthConnector(),
    async *sync(config): AsyncGenerator<SyncPage> {
      if (config.accessToken === 'acces-ancien-0001' || !acceptsNew) {
        throw new ConnectorAuthError('GitHub', status);
      }
      yield { items: [], cursor: 'apres-renouvellement' };
    },
  });

  it('renouvelle un accès qui expire bientôt, enregistre les nouveaux jetons, et ne renouvelle plus ensuite', async () => {
    const id = await oauthConnection({ expiresAt: inMinutes(2) });
    const fetchImpl = fakeFetch([
      tokenRoute({
        access_token: 'acces-nouveau-0002',
        refresh_token: 'rafraichir-2',
        expires_in: 3600,
      }),
    ]);

    expect(await run(id, fakeOAuthConnector(), { fetchImpl })).toBe('ok');

    expect(fetchImpl.calls).toHaveLength(1);
    const config = await storedConfig(id);
    expect(Date.parse(String(config?.expiresAt))).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(config).not.toHaveProperty('accessToken');
    expect(await hintOf(id)).toBe('0002');

    await makeDue(id);
    const idle = fakeFetch([]);
    expect(await run(id, fakeOAuthConnector(), { fetchImpl: idle })).toBe('ok');
    expect(idle.calls).toHaveLength(0);
  });

  // Audit 5 n° 2 : une connexion enregistrée sans `accountKey` se reconnaissait au seul libellé, et un compte
  // renommé ne se reconnectait plus. Elle reçoit l'identifiant à sa première relève réussie, une seule fois.
  it('donne son identifiant à une ancienne connexion, à la première relève réussie seulement', async () => {
    const counted = (accountKey?: string) => {
      const base = fakeOAuthConnector({ account: 'acme-renomme', accountKey });
      const verify = vi.fn(base.verify);
      return { connector: { ...base, verify }, verify };
    };
    const id = await oauthConnection();
    const keyed = counted('4101');

    expect(await run(id, keyed.connector)).toBe('ok');
    expect((await storedConfig(id))?.accountKey).toBe('4101');
    await makeDue(id);
    expect(await run(id, keyed.connector)).toBe('ok');
    expect(keyed.verify).toHaveBeenCalledTimes(1);

    // Un outil qui ne rend pas d'identifiant n'est pas réinterrogé à chaque relève.
    const other = await oauthConnection();
    const keyless = counted();
    expect(await run(other, keyless.connector)).toBe('ok');
    await makeDue(other);
    expect(await run(other, keyless.connector)).toBe('ok');
    expect(keyless.verify).toHaveBeenCalledTimes(1);
    expect((await storedConfig(other))?.accountKey).toBeNull();
  });

  it('une vérification en panne ne fait pas échouer la relève, et sera refaite', async () => {
    const id = await oauthConnection();

    expect(await run(id, fakeOAuthConnector({ verifyFails: true }))).toBe('ok');
    expect(await storedConfig(id)).not.toHaveProperty('accountKey');
    await makeDue(id);
    expect(await run(id, fakeOAuthConnector({ accountKey: '4101' }))).toBe('ok');
    expect((await storedConfig(id))?.accountKey).toBe('4101');
  });

  it('met la connexion en erreur sans échéance quand le renouvellement est refusé', async () => {
    const id = await oauthConnection({ expiresAt: inMinutes(1) });
    const fetchImpl = fakeFetch([tokenRoute({ error: 'invalid_grant' }, 400)]);

    expect(await run(id, fakeOAuthConnector(), { fetchImpl })).toBe('auth_error');

    expect(await readRow(id)).toMatchObject({
      status: 'error',
      next_sync_at: null,
      sync_lock_at: null,
      last_error: "Reconnectez GitHub : l'autorisation a expiré.",
    });
  });

  it('renouvelle de force après un 401 en plein passage, puis relance le passage avec les nouveaux jetons', async () => {
    const id = await oauthConnection();
    const fetchImpl = fakeFetch([
      tokenRoute({
        access_token: 'acces-nouveau-0002',
        refresh_token: 'rafraichir-2',
        expires_in: 3600,
      }),
    ]);

    expect(await run(id, refusesOldAccess(true), { fetchImpl })).toBe('ok');

    expect(fetchImpl.calls).toHaveLength(1);
    expect(await hintOf(id)).toBe('0002');
    expect(await readRow(id)).toMatchObject({ status: 'active', cursor: 'apres-renouvellement' });
  });

  it('dit que l’autorisation a été retirée après deux refus de suite', async () => {
    const id = await oauthConnection();
    const fetchImpl = fakeFetch([
      tokenRoute({
        access_token: 'acces-nouveau-0002',
        refresh_token: 'rafraichir-2',
        expires_in: 3600,
      }),
    ]);

    expect(await run(id, refusesOldAccess(false), { fetchImpl })).toBe('auth_error');

    expect(await readRow(id)).toMatchObject({
      status: 'error',
      next_sync_at: null,
      last_error: "Reconnectez GitHub : l'autorisation a été retirée.",
    });
  });

  it('ne renouvelle pas sur un 403 (droits insuffisants) : aucun appel à l’éditeur, autorisation dite retirée', async () => {
    const id = await oauthConnection();
    const fetchImpl = fakeFetch([]);

    expect(await run(id, refusesOldAccess(true, 403), { fetchImpl })).toBe('auth_error');

    expect(fetchImpl.calls).toHaveLength(0);
    expect((await readRow(id)).last_error).toBe(
      "Reconnectez GitHub : l'autorisation a été retirée.",
    );
  });

  // Audit 3 n° 15 : la relève partie avec les anciens jetons échoue après un « Reconnecter » ; la connexion
  // reste celle de la reconnexion (active, sans erreur, échéance maintenant) au lieu de « Reconnectez ».
  it('garde le statut posé par un « Reconnecter » fait pendant la relève qui échoue', async () => {
    const id = await oauthConnection({ refreshToken: null });
    await adminPool.query(
      "update connections set status = 'error', last_error = 'Reconnectez GitHub' where id = $1",
      [id],
    );
    const reconnectedMidway: AnyConnector = {
      ...fakeOAuthConnector(),
      // biome-ignore lint/correctness/useYield: le passage échoue avant sa première page
      async *sync(): AsyncGenerator<SyncPage> {
        const config = {
          authMode: 'oauth',
          accessToken: 'acces-reconnecte-0009',
          refreshToken: 'rafraichir-reconnecte',
          expiresAt: inMinutes(60),
          repos: ['acme/leon'],
        };
        const secretFields = [...OAUTH_SECRET_FIELDS, 'token'];
        await saveOAuthTokens(paul, id, config, secretFields, { reconnect: true });
        throw new ConnectorAuthError('GitHub', 403);
      },
    };

    await run(id, reconnectedMidway, { fetchImpl: fakeFetch([]) });

    const row = await readRow(id);
    expect(row).toMatchObject({ status: 'active', last_error: null, sync_lock_at: null });
    expect(row.seconds_to_next).toBeLessThanOrEqual(5);
    expect(await hintOf(id)).toBe('0009');
  });

  // Audit 3 n° 16 : l'appli retirée du serveur (variables effacées) n'est pas un refus de l'éditeur.
  it('erreur ordinaire, nouvel essai dans une heure, quand l’appli OAuth n’est plus configurée', async () => {
    const id = await oauthConnection({ expiresAt: inMinutes(1) });
    vi.unstubAllEnvs();
    const fetchImpl = fakeFetch([]);

    expect(await run(id, fakeOAuthConnector(), { fetchImpl })).toBe('error');

    expect(fetchImpl.calls).toHaveLength(0);
    const row = await readRow(id);
    expect(row).toMatchObject({
      status: 'error',
      last_error: "L'appli GitHub n'est plus configurée sur ce serveur.",
    });
    expectDelayAbout(row, 60 * MINUTE);
  });

  it('dit que l’autorisation a été retirée, sans renouveler, quand il n’y a pas de jeton de rafraîchissement', async () => {
    const id = await oauthConnection({ refreshToken: null });
    const fetchImpl = fakeFetch([]);

    expect(await run(id, refusesOldAccess(true), { fetchImpl })).toBe('auth_error');

    expect(fetchImpl.calls).toHaveLength(0);
    expect((await readRow(id)).last_error).toBe(
      "Reconnectez GitHub : l'autorisation a été retirée.",
    );
  });
});

describe('runConnectorSync : connexion Pipedream', () => {
  const CONNECT = 'https://api.pipedream.com/v1/connect/proj_essai';
  const LIST = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
  const BATCH = 'https://gmail.googleapis.com/batch/gmail/v1';
  // Le proxy reçoit l'adresse entière en base64url : seuls les groupes de 3 caractères du début
  // donnent le même début d'encodage, avec ou sans chaîne de requête.
  const proxied = (url: string) => {
    const head = Buffer.from(url.slice(0, url.length - (url.length % 3))).toString('base64url');
    return new RegExp(`^${CONNECT}/proxy/${head}`);
  };

  beforeEach(() => {
    forgetPipedreamToken();
    vi.stubEnv('PIPEDREAM_PROJECT_ID', 'proj_essai');
    vi.stubEnv('PIPEDREAM_CLIENT_ID', 'client-essai');
    vi.stubEnv('PIPEDREAM_CLIENT_SECRET', 'secret-essai-pipedream');
  });
  afterEach(() => vi.unstubAllEnvs());

  async function pipedreamConnection(accountKey?: string): Promise<string> {
    const id = await createConnection(paul, {
      provider: 'gmail',
      label: 'david@acme.test',
      config: {
        authMode: 'pipedream',
        externalUserId: 'leon-essai',
        accountId: 'apn_gm1',
        ...(accountKey ? { accountKey } : {}),
      },
      secretFields: PIPEDREAM_SECRET_FIELDS,
      since: new Date(Date.now() - 86_400_000),
    });
    await makeDue(id);
    return id;
  }

  it('lit par le proxy avec le compte chiffré, puis repasse au prochain créneau de bureau', async () => {
    const id = await pipedreamConnection('david@acme.test');
    const mail = {
      id: 'm1',
      threadId: 't1',
      labelIds: ['INBOX'],
      internalDate: String(Date.now() - 3_600_000),
      payload: {
        mimeType: 'text/plain',
        headers: [{ name: 'Subject', value: 'Devis' }],
        body: { data: Buffer.from('Voici le devis').toString('base64url') },
      },
    };
    const batch =
      '--b\r\nContent-Type: application/http\r\nContent-ID: <response-item0>\r\n\r\n' +
      `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(mail)}\r\n--b--\r\n`;
    const fetchImpl = fakeFetch([
      {
        method: 'POST',
        url: 'https://api.pipedream.com/v1/oauth/token',
        json: { access_token: 'pd' },
      },
      { url: proxied(LIST), json: { messages: [{ id: 'm1', threadId: 't1' }] } },
      {
        method: 'POST',
        url: proxied(BATCH),
        text: batch,
        headers: { 'content-type': 'multipart/mixed; boundary=b' },
      },
    ]);

    expect(await run(id, gmailConnector, { fetchImpl, sleep: async () => {} })).toBe('ok');

    const listCall = fetchImpl.calls[1];
    expect(new URL(listCall?.url ?? '').searchParams.get('account_id')).toBe('apn_gm1');
    expect(listCall?.headers.authorization).toBe('Bearer pd');
    expect(await sourceCount(id)).toEqual({ total: 1, distinct: 1 });
    const { rows } = await adminPool.query<{ hour: number }>(
      `select extract(hour from next_sync_at at time zone 'Europe/Paris')::int as hour
       from connections where id = $1`,
      [id],
    );
    expect([8, 11, 14, 17]).toContain(rows[0]?.hour);
  });

  it('un accès retiré chez Google arrête la connexion : « Reconnectez Gmail »', async () => {
    const id = await pipedreamConnection('david@acme.test');
    const fetchImpl = fakeFetch([
      {
        method: 'POST',
        url: 'https://api.pipedream.com/v1/oauth/token',
        json: { access_token: 'pd' },
      },
      { url: proxied(LIST), status: 403 },
    ]);

    expect(await run(id, gmailConnector, { fetchImpl, sleep: async () => {} })).toBe('auth_error');

    const row = await readRow(id);
    expect(row.last_error).toBe("Reconnectez Gmail : l'autorisation a été retirée.");
    expect(row.next_sync_at).toBeNull();
  });
});

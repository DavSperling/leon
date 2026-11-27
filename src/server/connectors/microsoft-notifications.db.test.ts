import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { createTestTenant } from '@/test/fixtures';
import { createConnection } from './connections';
import { keepNotified, NOTIFICATIONS_PATH } from './microsoft-notifications';
import { OAUTH_SECRET_FIELDS } from './oauth';
import { outlookConnector } from './outlook/connector';
import { runConnectorSync } from './sync';
import type { AnyConnector } from './types';

vi.mock('@/server/pipeline/queue');
vi.mock('@/server/portrait/brouillons-queue');

// Une organisation neuve par test : on n'asserte que sur nos propres connexions (base de test partagée).

const PUBLIC = 'https://leon.test';
const NOTIFY = `${PUBLIC}${NOTIFICATIONS_PATH}`;
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SUBSCRIPTIONS = `${GRAPH}/subscriptions`;
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const WATCHED = outlookConnector.watch?.map((watch) => watch.resource) ?? [];
const [INBOX, SENT, EVENTS] = WATCHED as [string, string, string];

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * MINUTE).toISOString();
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const tenantIds: string[] = [];
let paul: TenantContext;
// Microsoft donne des identifiants uniques partout : ceux d'un test portent sa marque.
let mark: string;
const abo = (name: string) => `abo-${name}-${mark}`;

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(async () => {
  const team = await createTestTenant(['Paul']);
  tenantIds.push(team.tenantId);
  [paul] = team.members as [TenantContext];
  mark = randomUUID();
  vi.stubEnv('LEON_OAUTH_MICROSOFT_ID', 'id-appli');
  vi.stubEnv('LEON_OAUTH_MICROSOFT_SECRET', 'secret-appli-xyz');
});
afterEach(() => vi.unstubAllEnvs());

function configOf(expiresAt: string) {
  return {
    authMode: 'oauth',
    accessToken: 'acces-1',
    refreshToken: 'rafraichir-1',
    expiresAt,
    accountKey: 'compte-1',
  };
}

async function outlookConnection(expiresAt: string) {
  const config = configOf(expiresAt);
  const id = await createConnection(paul, {
    provider: 'outlook',
    label: 'Paul (paul@outlook.test)',
    config,
    secretFields: OAUTH_SECRET_FIELDS,
    since: new Date(Date.now() - 24 * HOUR),
  });
  return { id, provider: 'outlook' as const, config };
}

async function seedSubscription(connectionId: string, ressource: string, id: string, due: boolean) {
  await adminPool.query(
    `insert into abonnements_microsoft (id, tenant_id, connection_id, ressource, empreinte, prochain_renouvellement)
     values ($1, $2, $3, $4, sha256(convert_to('secret-' || $1, 'UTF8')), now() + $5::interval)`,
    [id, paul.tenantId, connectionId, ressource, due ? '-1 minute' : '1 hour'],
  );
}

type Row = { id: string; ressource: string; empreinte: string; minutes: number };
async function rowsOf(connectionId: string): Promise<Map<string, Row>> {
  const { rows } = await adminPool.query<Row>(
    `select id, ressource, encode(empreinte, 'hex') as empreinte,
            extract(epoch from prochain_renouvellement - now())::float / 60 as minutes
     from abonnements_microsoft where connection_id = $1`,
    [connectionId],
  );
  return new Map(rows.map((row) => [row.ressource, row]));
}

const created = (id: string): FakeRoute => ({
  method: 'POST',
  url: SUBSCRIPTIONS,
  status: 201,
  json: { id, resource: 'ignoré', expirationDateTime: inMinutes(2 * 24 * 60) },
});
const renewed = (id: string): FakeRoute => ({
  method: 'PATCH',
  url: `${SUBSCRIPTIONS}/${id}`,
  json: { id, expirationDateTime: inMinutes(2 * 24 * 60) },
});

describe('keepNotified : les abonnements par lesquels Microsoft prévient Leon', () => {
  it("en crée un par ressource suivie, avec l'adresse de Leon et un secret propre à chacun, puis n'y touche plus", async () => {
    const connection = await outlookConnection(inMinutes(60));
    const fetchImpl = fakeFetch([created(abo('1')), created(abo('2')), created(abo('3'))]);

    await keepNotified(paul, connection, outlookConnector, { fetchImpl, publicUrl: PUBLIC });

    const bodies = fetchImpl.calls.map((call) => call.body as Record<string, string>);
    expect(bodies.map((body) => body.resource)).toEqual(WATCHED);
    expect(bodies.map((body) => body.changeType)).toEqual([
      'created',
      'created',
      'created,updated',
    ]);
    for (const body of bodies) {
      expect(body).toMatchObject({ notificationUrl: NOTIFY, lifecycleNotificationUrl: NOTIFY });
      expect(body.clientState).toMatch(/^[\w-]{43}$/);
      expect(Date.parse(String(body.expirationDateTime)) - Date.now()).toBeGreaterThan(47 * HOUR);
    }
    expect(new Set(bodies.map((body) => body.clientState)).size).toBe(3);
    expect(fetchImpl.calls[0]?.headers.authorization).toBe('Bearer acces-1');

    // Le secret n'est gardé qu'en empreinte ; le renouvellement tombe 20 minutes avant la fin du jeton.
    const rows = await rowsOf(connection.id);
    expect([...rows.values()].map((row) => row.id).sort()).toEqual([abo('1'), abo('2'), abo('3')]);
    expect(rows.get(INBOX)?.empreinte).toBe(sha256(String(bodies[0]?.clientState)));
    expect(rows.get(INBOX)?.minutes).toBeGreaterThan(38);
    expect(rows.get(INBOX)?.minutes).toBeLessThan(41);

    const idle = fakeFetch([]);
    await keepNotified(paul, connection, outlookConnector, { fetchImpl: idle, publicUrl: PUBLIC });
    expect(idle.calls).toHaveLength(0);
  });

  it("les renouvelle à l'heure dite, avec un jeton neuf quand le sien expire dans moins d'une demi-heure", async () => {
    const connection = await outlookConnection(inMinutes(10));
    for (const [ressource, id] of [
      [INBOX, abo('1')],
      [SENT, abo('2')],
      [EVENTS, abo('3')],
    ] as const)
      await seedSubscription(connection.id, ressource, id, true);
    const token = { access_token: 'acces-2', refresh_token: 'rafraichir-2', expires_in: 3600 };
    const fetchImpl = fakeFetch([
      { method: 'POST', url: TOKEN_URL, json: token },
      renewed(abo('1')),
      renewed(abo('2')),
      renewed(abo('3')),
    ]);

    await keepNotified(paul, connection, outlookConnector, { fetchImpl, publicUrl: PUBLIC });

    const patches = fetchImpl.calls.filter((call) => call.method === 'PATCH');
    expect(patches).toHaveLength(3);
    for (const patch of patches) {
      expect(patch.headers.authorization).toBe('Bearer acces-2');
      expect(Object.keys(patch.body as object)).toEqual(['expirationDateTime']);
    }
    const rows = await rowsOf(connection.id);
    expect(rows.get(SENT)?.id).toBe(abo('2'));
    expect(rows.get(SENT)?.empreinte).toBe(sha256(`secret-${abo('2')}`));
    expect(rows.get(SENT)?.minutes).toBeGreaterThan(38);
  });

  it("refait un abonnement que Microsoft ne connaît plus, et retire d'abord le doublon qui le bloque", async () => {
    const connection = await outlookConnection(inMinutes(60));
    await seedSubscription(connection.id, INBOX, abo('ancien'), true);
    await seedSubscription(connection.id, SENT, abo('2'), false);
    await seedSubscription(connection.id, EVENTS, abo('3'), false);
    const taken = '7f105c7d-2dc5-4530-97cd-4e7af6534c07';
    const fetchImpl = fakeFetch([
      {
        method: 'PATCH',
        url: `${SUBSCRIPTIONS}/${abo('ancien')}`,
        status: 404,
        json: { error: { code: 'ResourceNotFound', message: 'The object was not found.' } },
      },
      {
        method: 'POST',
        url: SUBSCRIPTIONS,
        status: 409,
        json: {
          error: {
            code: 'ExtensionError',
            message: `Subscription Id ${taken} already exists for the requested combination`,
          },
        },
      },
      { method: 'DELETE', url: `${SUBSCRIPTIONS}/${taken}`, status: 204 },
      created(abo('neuf')),
    ]);

    await keepNotified(paul, connection, outlookConnector, { fetchImpl, publicUrl: PUBLIC });

    expect(fetchImpl.calls.map((call) => call.method)).toEqual(['PATCH', 'POST', 'DELETE', 'POST']);
    const clientState = String(
      (fetchImpl.calls[3]?.body as Record<string, string> | undefined)?.clientState,
    );
    const rows = await rowsOf(connection.id);
    expect(rows.get(INBOX)).toMatchObject({ id: abo('neuf'), empreinte: sha256(clientState) });
    expect(rows.get(SENT)?.id).toBe(abo('2'));
  });

  it("ne fait rien sans adresse https (en local), ni pour un outil qu'on ne suit pas", async () => {
    const connection = await outlookConnection(inMinutes(60));
    const fetchImpl = fakeFetch([]);

    await keepNotified(paul, connection, outlookConnector, {
      fetchImpl,
      publicUrl: 'http://localhost:3000',
    });
    const { watch: _, ...unwatched } = outlookConnector as AnyConnector;
    await keepNotified(paul, connection, unwatched, { fetchImpl, publicUrl: PUBLIC });

    expect(fetchImpl.calls).toHaveLength(0);
    expect((await rowsOf(connection.id)).size).toBe(0);
  });

  it("une erreur de Microsoft n'arrête ni les autres abonnements ni la relève", async () => {
    const connection = await outlookConnection(inMinutes(60));
    const refused: FakeRoute = { method: 'POST', url: SUBSCRIPTIONS, status: 400, json: {} };
    const fetchImpl = fakeFetch([refused, created(abo('2')), created(abo('3'))]);

    await keepNotified(paul, connection, outlookConnector, { fetchImpl, publicUrl: PUBLIC });

    expect([...(await rowsOf(connection.id)).keys()].sort()).toEqual([EVENTS, SENT].sort());
  });
});

describe('runConnectorSync : une relève Outlook réussie pose ses abonnements', () => {
  it('relève la boîte, puis crée les abonnements sous la même réservation', async () => {
    const connection = await outlookConnection(inMinutes(60));
    await adminPool.query('update connections set next_sync_at = now() where id = $1', [
      connection.id,
    ]);
    const empty = (url: string): FakeRoute => ({ url, json: { value: [] } });
    const fetchImpl = fakeFetch([
      empty(`${GRAPH}/me/mailFolders/inbox/messages`),
      empty(`${GRAPH}/me/mailFolders/sentitems/messages`),
      empty(`${GRAPH}/me/events`),
      created(abo('1')),
      created(abo('2')),
      created(abo('3')),
    ]);
    const job = { connectionId: connection.id, tenantId: paul.tenantId, userId: paul.userId };

    const result = await runConnectorSync(job, {
      getConnector: () => outlookConnector,
      fetchImpl,
      publicUrl: PUBLIC,
    });

    expect(result).toBe('ok');
    expect((await rowsOf(connection.id)).size).toBe(3);
  });
});

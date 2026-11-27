import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { createTestTenant } from '@/test/fixtures';
import { createConnection } from './connections';
import {
  keepNotified,
  markNotified,
  NOTIFICATIONS_PATH,
  takeSignaled,
} from './microsoft-notifications';
import { OAUTH_SECRET_FIELDS } from './oauth';
import { outlookConnector } from './outlook/connector';
import { runConnectorSync } from './sync';
import { teamsChatsConnector, teamsConnector } from './teams/connector';
import { EVERYWHERE } from './teams/daily';
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

async function connectionOf(
  ctx: TenantContext,
  provider: 'outlook' | 'teams' | 'teamschats',
  expiresAt: string,
) {
  const config = configOf(expiresAt);
  const id = await createConnection(ctx, {
    provider,
    label: 'Paul (paul@outlook.test)',
    config,
    secretFields: OAUTH_SECRET_FIELDS,
    since: new Date(Date.now() - 24 * HOUR),
  });
  return { id, provider, config };
}
const outlookConnection = (expiresAt: string) => connectionOf(paul, 'outlook', expiresAt);

async function seedSubscription(
  connectionId: string,
  ressource: string,
  id: string,
  due: boolean,
  tenantId = paul.tenantId,
) {
  await adminPool.query(
    `insert into abonnements_microsoft (id, tenant_id, connection_id, ressource, empreinte, prochain_renouvellement)
     values ($1, $2, $3, $4, sha256(convert_to('secret-' || $1, 'UTF8')), now() + $5::interval)`,
    [id, tenantId, connectionId, ressource, due ? '-1 minute' : '1 hour'],
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

  it("une erreur de Microsoft n'arrête ni les autres abonnements ni la relève, et un refus attend le lendemain", async () => {
    const connection = await outlookConnection(inMinutes(60));
    const refused: FakeRoute = { method: 'POST', url: SUBSCRIPTIONS, status: 400, json: {} };
    const fetchImpl = fakeFetch([refused, created(abo('2')), created(abo('3'))]);

    await keepNotified(paul, connection, outlookConnector, { fetchImpl, publicUrl: PUBLIC });

    const rows = await rowsOf(connection.id);
    expect([rows.get(SENT)?.id, rows.get(EVENTS)?.id]).toEqual([abo('2'), abo('3')]);
    // Le refus est gardé un jour, sans secret : rien n'est redemandé avant.
    expect(rows.get(INBOX)).toMatchObject({ id: expect.stringMatching(/^refus:/), empreinte: '' });
    expect(rows.get(INBOX)?.minutes).toBeGreaterThan(23 * 60);
    const idle = fakeFetch([]);
    await keepNotified(paul, connection, outlookConnector, { fetchImpl: idle, publicUrl: PUBLIC });
    expect(idle.calls).toHaveLength(0);
  });
});

describe('keepNotified : Teams et Teams Chat (0098)', () => {
  it('Teams Chat suit les conversations et les transcriptions du compte ; des transcriptions fermées à Graph sont redemandées le lendemain, par une création', async () => {
    const connection = await connectionOf(paul, 'teamschats', inMinutes(60));
    const closed: FakeRoute = {
      method: 'POST',
      url: SUBSCRIPTIONS,
      status: 403,
      json: {
        error: { code: 'Forbidden', innerError: { code: 'GraphAccessToTranscriptsDisabled' } },
      },
    };
    const fetchImpl = fakeFetch([created(abo('conversations')), closed]);

    await keepNotified(paul, connection, teamsChatsConnector, { fetchImpl, publicUrl: PUBLIC });

    const bodies = fetchImpl.calls.map((call) => call.body as Record<string, string>);
    expect(bodies.map((body) => [body.resource, body.changeType])).toEqual([
      ['/users/compte-1/chats/getAllMessages', 'created,updated,deleted'],
      ['users/compte-1/onlineMeetings/getAllTranscripts', 'created'],
    ]);
    const transcripts = 'users/compte-1/onlineMeetings/getAllTranscripts';
    expect((await rowsOf(connection.id)).get(transcripts)?.id).toMatch(/^refus:/);

    // Le lendemain : une création, jamais un renouvellement de la ligne du refus.
    await adminPool.query(
      `update abonnements_microsoft set prochain_renouvellement = now() - interval '1 minute'
        where connection_id = $1 and ressource = $2`,
      [connection.id, transcripts],
    );
    const retry = fakeFetch([created(abo('transcriptions'))]);
    await keepNotified(paul, connection, teamsChatsConnector, {
      fetchImpl: retry,
      publicUrl: PUBLIC,
    });

    expect(retry.calls.map((call) => call.method)).toEqual(['POST']);
    expect((await rowsOf(connection.id)).get(transcripts)?.id).toBe(abo('transcriptions'));
  });

  it("Teams suit chaque canal de la liste du jour, sauf celui qu'un collègue suit déjà, et le reprend s'il ne le renouvelle plus", async () => {
    const team = await createTestTenant(['Paul', 'Marie']);
    tenantIds.push(team.tenantId);
    const [paulBis, marie] = team.members as [TenantContext, TenantContext];
    const [general, devis] = [`19:general-${mark}@thread.tacv2`, `19:devis-${mark}@thread.tacv2`];
    const resource = (channel: string) => `/teams/equipe-${mark}/channels/${channel}/messages`;
    const place = (key: string) => ({ key, parent: `equipe-${mark}`, name: key, origin: {} });
    const cursor = JSON.stringify({
      listedAt: new Date().toISOString(),
      places: [place(general), place(devis)],
      read: {},
      pending: null,
    });
    const theirs = await connectionOf(marie, 'teams', inMinutes(60));
    await seedSubscription(theirs.id, resource(general), abo('marie'), false, team.tenantId);
    const mine = { ...(await connectionOf(paulBis, 'teams', inMinutes(60))), cursor };

    const fetchImpl = fakeFetch([created(abo('devis'))]);
    await keepNotified(paulBis, mine, teamsConnector, { fetchImpl, publicUrl: PUBLIC });

    expect(fetchImpl.calls.map((call) => (call.body as Record<string, string>).resource)).toEqual([
      resource(devis),
    ]);
    expect([...(await rowsOf(mine.id)).keys()]).toEqual([resource(devis)]);

    // Marie ne le renouvelle plus depuis plus d'une heure (connexion en pause, retirée…) : Paul s'y abonne.
    await adminPool.query(
      `update abonnements_microsoft set prochain_renouvellement = now() - interval '2 hours' where id = $1`,
      [abo('marie')],
    );
    const takeover = fakeFetch([created(abo('general'))]);
    await keepNotified(paulBis, mine, teamsConnector, { fetchImpl: takeover, publicUrl: PUBLIC });

    expect(takeover.calls).toHaveLength(1);
    expect((await rowsOf(mine.id)).get(resource(general))?.id).toBe(abo('general'));
  });

  it("ne retire pas l'abonnement qu'un autre a déjà sur un canal : il réessaie dans une heure", async () => {
    const channel = `19:partage-${mark}@thread.tacv2`;
    const cursor = JSON.stringify({
      listedAt: new Date().toISOString(),
      places: [{ key: channel, parent: `hote-${mark}`, name: 'Partagé', origin: {} }],
      read: {},
      pending: null,
    });
    const mine = { ...(await connectionOf(paul, 'teams', inMinutes(60))), cursor };
    const fetchImpl = fakeFetch([
      {
        method: 'POST',
        url: SUBSCRIPTIONS,
        status: 409,
        json: {
          error: { message: 'Subscription Id 7f105c7d-2dc5-4530-97cd-4e7af6534c07 already exists' },
        },
      },
    ]);

    await keepNotified(paul, mine, teamsConnector, { fetchImpl, publicUrl: PUBLIC });

    expect(fetchImpl.calls.map((call) => call.method)).toEqual(['POST']);
    const row = (await rowsOf(mine.id)).get(`/teams/hote-${mark}/channels/${channel}/messages`);
    expect(row?.id).toMatch(/^refus:/);
    expect(row?.minutes).toBeGreaterThan(58);
    expect(row?.minutes).toBeLessThan(61);
  });
});

describe('markNotified et takeSignaled : où Teams a changé (0098)', () => {
  it("garde le lieu d'une notification Teams au bon secret pour la relève suivante de la connexion, et pour elle seule", async () => {
    const team = await createTestTenant(['Paul', 'Marie']);
    tenantIds.push(team.tenantId);
    const [paulBis, marie] = team.members as [TenantContext, TenantContext];
    const chats = await connectionOf(paulBis, 'teamschats', inMinutes(60));
    const mail = await connectionOf(paulBis, 'outlook', inMinutes(60));
    await seedSubscription(
      chats.id,
      '/users/compte-1/chats/getAllMessages',
      abo('chats'),
      false,
      team.tenantId,
    );
    await seedSubscription(mail.id, INBOX, abo('mail'), false, team.tenantId);
    const chat = `19:${mark}@thread.v2`;
    const notice = (id: string, resource: string, clientState = `secret-${id}`) => ({
      subscriptionId: id,
      clientState,
      resource,
    });

    const due = await markNotified([
      notice(abo('chats'), `chats('${chat}')/messages('1')`),
      notice(abo('chats'), `chats('${chat}')/messages('2')`),
      notice(abo('chats'), `chats('19:autre@thread.v2')/messages('3')`, 'secret-faux'),
      notice(abo('mail'), `chats('19:courrier@thread.v2')/messages('4')`),
    ]);

    expect(due).toBe(2);
    expect(await takeSignaled(marie, chats)).toEqual([]);
    expect(await takeSignaled(paulBis, mail)).toEqual([]);
    expect(await takeSignaled(paulBis, chats)).toEqual([chat]);
    expect(await takeSignaled(paulBis, chats)).toEqual([]);
  });

  it('des notifications perdues font tout relire, et renouveler l’abonnement', async () => {
    const chats = await connectionOf(paul, 'teamschats', inMinutes(60));
    await seedSubscription(chats.id, '/users/compte-1/chats/getAllMessages', abo('perdues'), false);

    await markNotified([
      {
        subscriptionId: abo('perdues'),
        clientState: `secret-${abo('perdues')}`,
        lifecycleEvent: 'missed',
      },
    ]);

    expect(await takeSignaled(paul, chats)).toEqual([EVERYWHERE]);
    expect(
      (await rowsOf(chats.id)).get('/users/compte-1/chats/getAllMessages')?.minutes,
    ).toBeLessThan(0.1);
  });
});

describe('runConnectorSync : une relève Teams Chat relit tout de suite la conversation signalée', () => {
  it('lit la seule conversation signalée, sans relire la liste, et la retire des signaux', async () => {
    const connection = await connectionOf(paul, 'teamschats', inMinutes(60));
    const chat = `19:${mark}@thread.v2`;
    const before = new Date(Date.now() - HOUR).toISOString();
    const cursor = JSON.stringify({
      listedAt: before,
      places: [{ key: chat, parent: null, name: 'Chantier', origin: { chat: 'Chantier' } }],
      read: { [chat]: before },
      pending: null,
    });
    await adminPool.query(
      'update connections set next_sync_at = now(), cursor = $2 where id = $1',
      [connection.id, cursor],
    );
    await adminPool.query(
      'insert into lieux_signales (tenant_id, connection_id, cle) values ($1, $2, $3)',
      [paul.tenantId, connection.id, chat],
    );
    const messages = `${GRAPH}/chats/${encodeURIComponent(chat)}/messages`;
    const fetchImpl = fakeFetch([{ url: messages, json: { value: [] } }]);
    const job = { connectionId: connection.id, tenantId: paul.tenantId, userId: paul.userId };

    const result = await runConnectorSync(job, {
      getConnector: () => teamsChatsConnector,
      fetchImpl,
      publicUrl: 'http://localhost:3000',
    });

    expect(result).toBe('ok');
    expect(fetchImpl.calls.map((call) => call.url.split('?')[0])).toEqual([messages]);
    const { rows } = await adminPool.query<{ cursor: string; signals: number }>(
      `select cursor, (select count(*)::int from lieux_signales where connection_id = $1) as signals
         from connections where id = $1`,
      [connection.id],
    );
    expect(rows[0]?.signals).toBe(0);
    expect(JSON.parse(rows[0]?.cursor ?? 'null').signaled).toEqual([]);
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

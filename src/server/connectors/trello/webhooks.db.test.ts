import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { createTestTenant } from '@/test/fixtures';
import { createConnection } from '../connections';
import { OAUTH_SECRET_FIELDS } from '../oauth';
import { runConnectorSync } from '../sync';
import { trelloConnector } from './connector';
import boards from './fixtures/boards.json';
import { keepTrelloWebhooks, markTrelloAlert, WEBHOOKS_PATH } from './webhooks';

vi.mock('@/server/pipeline/queue');
vi.mock('@/server/portrait/brouillons-queue');

// Une organisation neuve par test : on n'asserte que sur nos propres connexions (base de test partagée).

const PUBLIC = 'https://leon.test';
const API = 'https://api.trello.com/1';
const [BOARD_B, BOARD_A] = boards.map((board) => board.id) as [string, string];
const HOUR = 3_600_000;

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const tenantIds: string[] = [];
let paul: TenantContext;
// Trello donne des identifiants uniques partout : ceux d'un test portent sa marque.
let mark: string;
const hook = (name: string) => `wh-${name}-${mark}`;

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(async () => {
  const team = await createTestTenant(['Paul']);
  tenantIds.push(team.tenantId);
  [paul] = team.members as [TenantContext];
  mark = randomUUID();
  vi.stubEnv('LEON_OAUTH_TRELLO_ID', 'id-appli');
  vi.stubEnv('LEON_OAUTH_TRELLO_SECRET', 'secret-appli-xyz');
});
afterEach(() => vi.unstubAllEnvs());

async function trelloConnection(config: Record<string, unknown>) {
  const id = await createConnection(paul, {
    provider: 'trello',
    label: 'Marie Durand (@mariedurand), 2 boards',
    config,
    secretFields: config.authMode === 'oauth' ? OAUTH_SECRET_FIELDS : ['token'],
    since: new Date(Date.now() - 24 * HOUR),
  });
  return { id, provider: 'trello' as const, config };
}
const buttonConnection = () =>
  trelloConnection({
    authMode: 'oauth',
    accessToken: 'acces-1',
    refreshToken: 'rafraichir-1',
    expiresAt: new Date(Date.now() + HOUR).toISOString(),
    accountKey: 'membre-1',
  });

type Row = { id: string; tableau: string; empreinte: string };
async function rowsOf(connectionId: string): Promise<Map<string, Row>> {
  const { rows } = await adminPool.query<Row>(
    `select id, tableau, encode(empreinte, 'hex') as empreinte
     from webhooks_trello where connection_id = $1`,
    [connectionId],
  );
  return new Map(rows.map((row) => [row.tableau, row]));
}

const openBoards: FakeRoute = { url: `${API}/members/me/boards`, json: boards };
const created = (id: string, idModel: string): FakeRoute => ({
  method: 'POST',
  url: `${API}/webhooks`,
  json: { id, description: 'Leon', idModel, callbackURL: 'ignorée', active: true },
});

describe('keepTrelloWebhooks : un webhook par tableau ouvert, pour une connexion par bouton', () => {
  it('en crée un par tableau, avec l’adresse de Leon et un jeton propre à chacun, puis n’y touche plus', async () => {
    const connection = await buttonConnection();
    const fetchImpl = fakeFetch([
      openBoards,
      created(hook('b'), BOARD_B),
      created(hook('a'), BOARD_A),
    ]);

    await keepTrelloWebhooks(paul, connection, trelloConnector, { fetchImpl, publicUrl: PUBLIC });

    const posts = fetchImpl.calls.filter((call) => call.method === 'POST');
    const bodies = posts.map((call) => call.body as Record<string, string>);
    expect(bodies.map((body) => body.idModel)).toEqual([BOARD_B, BOARD_A]);
    const tokenOf = (body: Record<string, string> | undefined) =>
      String(body?.callbackURL).split('/').at(-1) ?? '';
    for (const body of bodies) {
      expect(body.description).toBe('Leon');
      expect(body.callbackURL).toBe(`${PUBLIC}${WEBHOOKS_PATH}/${tokenOf(body)}`);
      expect(tokenOf(body)).toMatch(/^[\w-]{43}$/);
    }
    expect(new Set(bodies.map(tokenOf)).size).toBe(2);
    for (const call of fetchImpl.calls) expect(call.headers.authorization).toBe('Bearer acces-1');

    // Le jeton n'est gardé qu'en empreinte.
    const rows = await rowsOf(connection.id);
    expect(rows.get(BOARD_B)).toEqual({
      id: hook('b'),
      tableau: BOARD_B,
      empreinte: sha256(tokenOf(bodies[0])),
    });
    expect(rows.get(BOARD_A)?.empreinte).toBe(sha256(tokenOf(bodies[1])));
    // Une alerte à ce jeton retrouve sa connexion.
    expect(await markTrelloAlert(tokenOf(bodies[1]))).toBe(true);
    expect(await markTrelloAlert('jeton-inconnu')).toBe(false);

    const idle = fakeFetch([openBoards]);
    await keepTrelloWebhooks(paul, connection, trelloConnector, {
      fetchImpl: idle,
      publicUrl: PUBLIC,
    });
    expect(idle.calls.map((call) => call.method)).toEqual(['GET']);
  });

  it('ne fait rien pour une connexion par clé, sans adresse https (en local), ni pour un autre outil', async () => {
    const button = await buttonConnection();
    const key = await trelloConnection({ apiKey: 'cle-1', token: 'jeton-1' });
    const fetchImpl = fakeFetch([]);

    await keepTrelloWebhooks(paul, key, trelloConnector, { fetchImpl, publicUrl: PUBLIC });
    await keepTrelloWebhooks(paul, button, trelloConnector, {
      fetchImpl,
      publicUrl: 'http://localhost:3000',
    });
    await keepTrelloWebhooks(paul, { ...button, provider: 'linear' }, trelloConnector, {
      fetchImpl,
      publicUrl: PUBLIC,
    });

    expect(fetchImpl.calls).toHaveLength(0);
    expect((await rowsOf(button.id)).size).toBe(0);
  });

  it('un refus de Trello n’arrête ni les autres tableaux ni la relève, et la relève suivante réessaie', async () => {
    const connection = await buttonConnection();
    const refused: FakeRoute = {
      method: 'POST',
      url: `${API}/webhooks`,
      status: 400,
      text: 'URL (ignorée) did not return 200 status code, got 404',
    };
    const fetchImpl = fakeFetch([openBoards, refused, created(hook('a'), BOARD_A)]);

    await keepTrelloWebhooks(paul, connection, trelloConnector, { fetchImpl, publicUrl: PUBLIC });

    expect([...(await rowsOf(connection.id)).keys()]).toEqual([BOARD_A]);
    const retry = fakeFetch([openBoards, created(hook('b'), BOARD_B)]);
    await keepTrelloWebhooks(paul, connection, trelloConnector, {
      fetchImpl: retry,
      publicUrl: PUBLIC,
    });
    expect(retry.calls[1]?.body).toMatchObject({ idModel: BOARD_B });
    expect([...(await rowsOf(connection.id)).keys()].sort()).toEqual([BOARD_A, BOARD_B].sort());

    // Un jeton refusé sur la liste des tableaux ne lève pas non plus.
    const revoked = fakeFetch([{ url: `${API}/members/me/boards`, status: 401, text: 'no' }]);
    await expect(
      keepTrelloWebhooks(paul, connection, trelloConnector, {
        fetchImpl: revoked,
        publicUrl: PUBLIC,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('runConnectorSync : une relève Trello réussie pose ses webhooks', () => {
  it('relève les tableaux, puis crée les webhooks sous la même réservation', async () => {
    const connection = await buttonConnection();
    await adminPool.query('update connections set next_sync_at = now() where id = $1', [
      connection.id,
    ]);
    const fetchImpl = fakeFetch([
      openBoards,
      { url: `${API}/boards/${BOARD_B}/actions`, json: [] },
      { url: `${API}/boards/${BOARD_A}/actions`, json: [] },
      openBoards,
      created(hook('b'), BOARD_B),
      created(hook('a'), BOARD_A),
    ]);
    const job = { connectionId: connection.id, tenantId: paul.tenantId, userId: paul.userId };

    const result = await runConnectorSync(job, {
      getConnector: () => trelloConnector,
      fetchImpl,
      publicUrl: PUBLIC,
    });

    expect(result).toBe('ok');
    expect((await rowsOf(connection.id)).size).toBe(2);
  });
});

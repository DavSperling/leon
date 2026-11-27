import { createHash } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { createTestTenant } from '@/test/fixtures';
import { createConnection } from '../connections';
import { runConnectorSync } from '../sync';
import { fathomConnector } from './connector';
import { keepFathomAlerted, WEBHOOKS_PATH } from './webhook';

vi.mock('@/server/pipeline/queue');

// Une organisation neuve par test : on n'asserte que sur nos propres connexions (base de test partagée).

const PUBLIC = 'https://leon.test';
const MEETINGS = 'https://api.fathom.ai/external/v1/meetings';
const WEBHOOKS = 'https://api.fathom.ai/external/v1/webhooks';
const CONFIG = { apiKey: 'cle-de-test' };
const READY = { connector: fathomConnector, config: CONFIG };
const EVERY_PLAN = ['my_recordings', 'shared_external_recordings'];
const ALL = [...EVERY_PLAN, 'my_shared_with_team_recordings', 'shared_team_recordings'];

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const tenantIds: string[] = [];
let paul: TenantContext;

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(async () => {
  const team = await createTestTenant(['Paul']);
  tenantIds.push(team.tenantId);
  [paul] = team.members as [TenantContext];
});

// Une connexion Fathom branchée par clé, due tout de suite.
async function fathomConnection() {
  const id = await createConnection(paul, {
    provider: 'fathom',
    label: 'Fathom (clé valide)',
    config: CONFIG,
    secretFields: fathomConnector.secretFields,
    since: new Date(Date.now() - 24 * 3_600_000),
  });
  return { id, provider: 'fathom' as const };
}

async function alertOf(connectionId: string) {
  const { rows } = await adminPool.query<{ id: string; empreinte: string }>(
    `select id, encode(empreinte, 'hex') as empreinte from alertes_fathom where connection_id = $1`,
    [connectionId],
  );
  return rows[0];
}

const emptyPage: FakeRoute = { url: MEETINGS, json: { limit: 10, next_cursor: null, items: [] } };
// Ce que rend Fathom à la création : l'id et le secret, une seule fois.
const created = (id: string): FakeRoute => ({
  method: 'POST',
  url: WEBHOOKS,
  status: 201,
  json: {
    id,
    url: `${PUBLIC}${WEBHOOKS_PATH}/x`,
    secret: 'whsec_c2VjcmV0LWRlLXRlc3Q',
    created_at: '2026-11-27T10:00:00Z',
    include_transcript: false,
    include_summary: false,
    include_action_items: true,
    include_crm_matches: false,
    triggered_for: ALL,
  },
});
const bodyOf = (call: { body: unknown } | undefined) => call?.body as Record<string, unknown>;

describe('keepFathomAlerted : l’alerte par laquelle Fathom prévient Leon', () => {
  it('à la première relève réussie, la crée avec la clé de la personne, à une adresse propre à la connexion, et n’en garde que l’empreinte', async () => {
    const connection = await fathomConnection();
    const fetchImpl = fakeFetch([emptyPage, created('wh-1')]);
    const job = { connectionId: connection.id, tenantId: paul.tenantId, userId: paul.userId };

    const result = await runConnectorSync(job, {
      getConnector: () => fathomConnector,
      fetchImpl,
      publicUrl: PUBLIC,
    });

    expect(result).toBe('ok');
    const call = fetchImpl.calls[1];
    expect(call?.method).toBe('POST');
    expect(call?.headers['x-api-key']).toBe('cle-de-test');
    const body = bodyOf(call);
    // Les actions à mener seulement : l'alerte n'est pas lue, la relève lit la réunion.
    expect(body).toEqual({
      destination_url: expect.stringMatching(
        /^https:\/\/leon\.test\/api\/fathom\/webhooks\/[\w-]{43}$/,
      ),
      triggered_for: ALL,
      include_action_items: true,
    });
    const jeton = String(body.destination_url).split('/').at(-1) ?? '';
    expect(await alertOf(connection.id)).toEqual({ id: 'wh-1', empreinte: sha256(jeton) });

    // La connexion a son alerte : les relèves suivantes n'en redemandent pas.
    const idle = fakeFetch([]);
    await keepFathomAlerted(paul, connection, READY, { fetchImpl: idle, publicUrl: PUBLIC });
    expect(idle.calls).toHaveLength(0);
  });

  it('chaque connexion a sa propre adresse : Fathom ne dit pas à quelle clé une alerte appartient', async () => {
    const first = await fathomConnection();
    const second = await fathomConnection();
    const fetchImpl = fakeFetch([created('wh-a'), created('wh-b')]);

    await keepFathomAlerted(paul, first, READY, { fetchImpl, publicUrl: PUBLIC });
    await keepFathomAlerted(paul, second, READY, { fetchImpl, publicUrl: PUBLIC });

    const urls = fetchImpl.calls.map((call) => bodyOf(call).destination_url);
    expect(new Set(urls).size).toBe(2);
    expect((await alertOf(first.id))?.id).toBe('wh-a');
    expect((await alertOf(second.id))?.id).toBe('wh-b');
  });

  it('redemande sans les valeurs des offres Équipe quand Fathom les refuse (400)', async () => {
    const connection = await fathomConnection();
    const refused: FakeRoute = { method: 'POST', url: WEBHOOKS, status: 400, json: {} };
    const fetchImpl = fakeFetch([refused, created('wh-2')]);

    await keepFathomAlerted(paul, connection, READY, { fetchImpl, publicUrl: PUBLIC });

    expect(fetchImpl.calls.map((call) => bodyOf(call).triggered_for)).toEqual([ALL, EVERY_PLAN]);
    expect(bodyOf(fetchImpl.calls[1]).destination_url).toBe(
      bodyOf(fetchImpl.calls[0]).destination_url,
    );
    expect((await alertOf(connection.id))?.id).toBe('wh-2');
  });

  it('une erreur de Fathom n’arrête pas la relève, et la suivante réessaie', async () => {
    const connection = await fathomConnection();
    const rejected: FakeRoute = { method: 'POST', url: WEBHOOKS, status: 403, json: {} };
    const fetchImpl = fakeFetch([emptyPage, rejected]);
    const job = { connectionId: connection.id, tenantId: paul.tenantId, userId: paul.userId };

    const result = await runConnectorSync(job, {
      getConnector: () => fathomConnector,
      fetchImpl,
      publicUrl: PUBLIC,
    });

    expect(result).toBe('ok');
    const { rows } = await adminPool.query<{ status: string; last_error: string | null }>(
      'select status, last_error from connections where id = $1',
      [connection.id],
    );
    expect(rows[0]).toEqual({ status: 'active', last_error: null });
    expect(await alertOf(connection.id)).toBeUndefined();

    const again = fakeFetch([created('wh-3')]);
    await keepFathomAlerted(paul, connection, READY, { fetchImpl: again, publicUrl: PUBLIC });
    expect((await alertOf(connection.id))?.id).toBe('wh-3');
  });

  it('ne fait rien sans adresse https (en local), ni pour un autre outil', async () => {
    const connection = await fathomConnection();
    const fetchImpl = fakeFetch([]);

    await keepFathomAlerted(paul, connection, READY, {
      fetchImpl,
      publicUrl: 'http://localhost:3000',
    });
    await keepFathomAlerted(paul, { ...connection, provider: 'tldv' }, READY, {
      fetchImpl,
      publicUrl: PUBLIC,
    });

    expect(fetchImpl.calls).toHaveLength(0);
    expect(await alertOf(connection.id)).toBeUndefined();
  });
});

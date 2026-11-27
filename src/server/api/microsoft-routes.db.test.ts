import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { enqueueDueSyncs } from '@/server/connectors/sync';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { app } from './app';

vi.mock('@/server/connectors/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/connectors/sync')>()),
  enqueueDueSyncs: vi.fn(async () => 1),
}));

const PATH = '/api/microsoft/notifications';
const LATER = new Date(Date.now() + 15 * 60_000);

const tenantIds: string[] = [];
let paul: TenantContext;
// Microsoft donne des identifiants uniques partout : ceux d'un test portent sa marque.
let mark: string;
const abo = (name: string) => `abo-${name}-${mark}`;

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(async () => {
  vi.mocked(enqueueDueSyncs).mockClear();
  const team = await createTestTenant(['Paul']);
  tenantIds.push(team.tenantId);
  [paul] = team.members as [TenantContext];
  mark = randomUUID();
});

// Une connexion Outlook relevée dans un quart d'heure, et son abonnement au secret `secret-<id>`.
async function watchedConnection(
  name: string,
  input: {
    status?: 'active' | 'paused' | 'error';
    nextSyncAt?: Date | null;
    provider?: 'outlook' | 'teamschats';
  } = {},
) {
  const subscriptionId = abo(name);
  const id = await seedConnection(paul, {
    provider: input.provider ?? 'outlook',
    status: input.status ?? 'active',
    nextSyncAt: input.nextSyncAt === undefined ? LATER : input.nextSyncAt,
  });
  await adminPool.query(
    `insert into abonnements_microsoft (id, tenant_id, connection_id, ressource, empreinte, prochain_renouvellement)
     values ($1, $2, $3, '/me/mailFolders(''inbox'')/messages', sha256(convert_to('secret-' || $1, 'UTF8')),
       now() + interval '1 hour')`,
    [subscriptionId, paul.tenantId, id],
  );
  return id;
}

async function stateOf(connectionId: string) {
  const { rows } = await adminPool.query<{ due: boolean | null; renew: boolean }>(
    `select c.next_sync_at <= now() as due, a.prochain_renouvellement <= now() as renew
       from connections c join abonnements_microsoft a on a.connection_id = c.id where c.id = $1`,
    [connectionId],
  );
  return rows[0];
}

const notify = (value: unknown[]) =>
  app.request(PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });

const change = (subscriptionId: string, clientState: string) => ({
  subscriptionId,
  clientState,
  changeType: 'created',
  resource: 'Users/u-1/Messages/m-1',
  subscriptionExpirationDateTime: '2026-11-29T10:00:00Z',
  tenantId: 't-1',
});

describe('POST /api/microsoft/notifications', () => {
  it('rend le jeton de validation tel quel, en texte brut', async () => {
    const token =
      'Validation: Testing client application reachability for subscription Request-Id: 1';
    const response = await app.request(`${PATH}?validationToken=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe(token);
  });

  it('une notification au bon secret rend la connexion due tout de suite et met sa relève en file', async () => {
    const id = await watchedConnection('1');

    const response = await notify([change(abo('1'), `secret-${abo('1')}`)]);

    expect(response.status).toBe(202);
    expect(await stateOf(id)).toEqual({ due: true, renew: false });
    expect(enqueueDueSyncs).toHaveBeenCalledTimes(1);
  });

  it('un mauvais secret ou un abonnement inconnu ne change rien, et Microsoft reçoit quand même un 202', async () => {
    const id = await watchedConnection('2');

    const response = await notify([
      change(abo('2'), 'secret-autre'),
      change(abo('inconnu'), `secret-${abo('inconnu')}`),
      { subscriptionId: abo('2'), clientState: null },
    ]);

    expect(response.status).toBe(202);
    expect(await stateOf(id)).toEqual({ due: false, renew: false });
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it("une notification du cycle de vie fait aussi renouveler l'abonnement au passage qui suit", async () => {
    const id = await watchedConnection('3');

    const response = await notify([
      change(abo('3'), `secret-${abo('3')}`),
      {
        subscriptionId: abo('3'),
        clientState: `secret-${abo('3')}`,
        lifecycleEvent: 'reauthorizationRequired',
      },
    ]);

    expect(response.status).toBe(202);
    expect(await stateOf(id)).toEqual({ due: true, renew: true });
  });

  it('une connexion en pause ou en erreur ne se réveille pas : elle attend sa reprise ou son prochain essai', async () => {
    const paused = await watchedConnection('4', { status: 'paused', nextSyncAt: null });
    const failing = await watchedConnection('5', { status: 'error' });

    await notify([change(abo('4'), `secret-${abo('4')}`), change(abo('5'), `secret-${abo('5')}`)]);

    expect((await stateOf(paused))?.due).toBeNull();
    expect((await stateOf(failing))?.due).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('une notification de Teams dit aussi où relire, pour la relève qui suit (0098)', async () => {
    const id = await watchedConnection('6', { provider: 'teamschats' });
    const chat = `19:${mark}@unq.gbl.spaces`;

    const response = await notify([
      { ...change(abo('6'), `secret-${abo('6')}`), resource: `chats('${chat}')/messages('1')` },
    ]);

    expect(response.status).toBe(202);
    const { rows } = await adminPool.query<{ cle: string }>(
      'select cle from lieux_signales where connection_id = $1',
      [id],
    );
    expect(rows.map((row) => row.cle)).toEqual([chat]);
  });

  it('refuse un corps illisible', async () => {
    const response = await app.request(PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"value": "pas une liste"}',
    });

    expect(response.status).toBe(400);
  });
});

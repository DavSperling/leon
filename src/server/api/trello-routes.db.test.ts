import { createHmac, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { autoImplementMethods } from 'next/dist/server/route-modules/app-route/helpers/auto-implement-methods';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiRoute from '@/app/api/[[...route]]/route';
import type { TenantContext } from '@/server/auth/tenant-context';
import { enqueueDueSyncs } from '@/server/connectors/sync';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { app } from './app';
import { createTrelloRoutes } from './trello-routes';

vi.mock('@/server/connectors/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/connectors/sync')>()),
  enqueueDueSyncs: vi.fn(async () => 1),
}));

// Les alertes de Trello, avec une adresse publique https de test : la signature porte sur l'adresse de rappel
// reconstruite depuis elle, jamais depuis l'en-tête Host.
const PUBLIC = 'https://leon.test';
const PATH = '/api/trello/webhooks';
const LATER = new Date(Date.now() + 15 * 60_000);
const SECRET = `secret-${randomBytes(16).toString('hex')}`;
const ALERT = JSON.stringify({
  action: { type: 'updateCard', data: { card: { id: 'c-1' } } },
  model: { id: 'b-1', name: 'Café crème' },
});

const routes = new Hono().route('/api/trello', createTrelloRoutes({ publicUrl: PUBLIC }));

const tenantIds: string[] = [];
let paul: TenantContext;

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(async () => {
  vi.mocked(enqueueDueSyncs).mockClear();
  const team = await createTestTenant(['Paul']);
  tenantIds.push(team.tenantId);
  [paul] = team.members as [TenantContext];
  vi.stubEnv('LEON_OAUTH_TRELLO_ID', 'id-appli-trello');
  vi.stubEnv('LEON_OAUTH_TRELLO_SECRET', SECRET);
});
afterEach(() => vi.unstubAllEnvs());

// Une connexion Trello relevée dans un quart d'heure, et le webhook d'un tableau à l'adresse …/<jeton>.
async function watchedConnection(
  input: { status?: 'active' | 'paused' | 'error'; nextSyncAt?: Date | null } = {},
) {
  const token = randomBytes(32).toString('base64url');
  const id = await seedConnection(paul, {
    provider: 'trello',
    status: input.status ?? 'active',
    nextSyncAt: input.nextSyncAt === undefined ? LATER : input.nextSyncAt,
  });
  await adminPool.query(
    `insert into webhooks_trello (id, tenant_id, connection_id, tableau, empreinte)
     values ($1, $2, $3, 'b-1', sha256(convert_to($4, 'UTF8')))`,
    [`wh-${token.slice(0, 12)}`, paul.tenantId, id, token],
  );
  return { id, token };
}

async function dueOf(connectionId: string) {
  const { rows } = await adminPool.query<{ due: boolean | null }>(
    'select next_sync_at <= now() as due from connections where id = $1',
    [connectionId],
  );
  return rows[0]?.due;
}

// La signature de Trello : base64 du HMAC-SHA1 du corps suivi de l'adresse de rappel.
const sign = (body: string, callbackURL: string, secret = SECRET) =>
  createHmac('sha1', secret).update(body).update(callbackURL).digest('base64');

// `origin` : l'adresse par laquelle la requête arrive (par défaut, celle de Hono en test).
const alert = (token: string, signature: string | null, body = ALERT, origin = '') =>
  routes.request(`${origin}${PATH}/${token}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature === null ? {} : { 'x-trello-webhook': signature }),
    },
    body,
  });

describe('HEAD et GET /api/trello/webhooks/:jeton', () => {
  it('répondent 200 sans corps, même avant que Leon ne garde le jeton', async () => {
    for (const method of ['HEAD', 'GET']) {
      const response = await app.request(`${PATH}/jeton-pas-encore-garde`, { method });
      expect(response.status, method).toBe(200);
      expect(await response.text(), method).toBe('');
    }
  });

  it('Next passe le HEAD au GET de l’API : aucun HEAD à exporter', async () => {
    expect('HEAD' in apiRoute).toBe(false);
    expect(autoImplementMethods(apiRoute).HEAD).toBe(apiRoute.GET);

    const head = new Request(`http://localhost:3000${PATH}/jeton`, { method: 'HEAD' });
    const response = await apiRoute.GET(head);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});

describe('POST /api/trello/webhooks/:jeton', () => {
  it('une alerte bien signée rend la connexion due tout de suite et met sa relève en file', async () => {
    const { id, token } = await watchedConnection();

    const response = await alert(token, sign(ALERT, `${PUBLIC}${PATH}/${token}`));

    expect(response.status).toBe(200);
    expect(await dueOf(id)).toBe(true);
    expect(enqueueDueSyncs).toHaveBeenCalledTimes(1);
  });

  it('une file en panne ne change pas la réponse : le tic de la minute prendra la connexion due', async () => {
    const { id, token } = await watchedConnection();
    vi.mocked(enqueueDueSyncs).mockRejectedValueOnce(new Error('file indisponible'));

    const response = await alert(token, sign(ALERT, `${PUBLIC}${PATH}/${token}`));

    expect(response.status).toBe(200);
    expect(await dueOf(id)).toBe(true);
  });

  it('une signature fausse, absente, d’un autre secret ou sur une autre adresse : 401, rien ne change', async () => {
    const { id, token } = await watchedConnection();
    const url = `${PUBLIC}${PATH}/${token}`;

    for (const [name, response] of [
      ['absente', await alert(token, null)],
      ['fausse', await alert(token, 'pas-une-signature')],
      ['autre secret', await alert(token, sign(ALERT, url, 'secret-autre'))],
      ['autre corps', await alert(token, sign('{}', url))],
      // L'adresse par laquelle l'alerte arrive (son en-tête Host) n'est jamais celle qui compte.
      [
        'autre hôte',
        await alert(
          token,
          sign(ALERT, `https://evil.test${PATH}/${token}`),
          ALERT,
          'https://evil.test',
        ),
      ],
    ] as const) {
      expect(response.status, name).toBe(401);
    }
    expect(await dueOf(id)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('sans appli Trello configurée ni adresse https, aucune alerte n’est crue : 401', async () => {
    const { id, token } = await watchedConnection();
    const signed = sign(ALERT, `${PUBLIC}${PATH}/${token}`);

    vi.stubEnv('LEON_OAUTH_TRELLO_SECRET', '');
    expect((await alert(token, signed)).status).toBe(401);
    vi.stubEnv('LEON_OAUTH_TRELLO_SECRET', SECRET);
    // L'API telle que montée : l'adresse publique des tests est en http, donc aucune adresse de rappel.
    const local = await app.request(`${PATH}/${token}`, {
      method: 'POST',
      headers: { 'x-trello-webhook': signed },
      body: ALERT,
    });
    expect(local.status).toBe(401);

    expect(await dueOf(id)).toBe(false);
  });

  it('un jeton inconnu bien signé (sa connexion a été supprimée) : 410, pour que Trello retire le webhook', async () => {
    const token = randomBytes(32).toString('base64url');

    const response = await alert(token, sign(ALERT, `${PUBLIC}${PATH}/${token}`));

    expect(response.status).toBe(410);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('une connexion en pause ou en erreur ne se réveille pas : 200, elle attend sa reprise ou son prochain essai', async () => {
    const paused = await watchedConnection({ status: 'paused', nextSyncAt: null });
    const failing = await watchedConnection({ status: 'error' });

    for (const { token } of [paused, failing]) {
      expect((await alert(token, sign(ALERT, `${PUBLIC}${PATH}/${token}`))).status).toBe(200);
    }

    expect(await dueOf(paused.id)).toBeNull();
    expect(await dueOf(failing.id)).toBe(false);
  });
});

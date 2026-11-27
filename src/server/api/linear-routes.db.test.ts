import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { enqueueDueSyncs } from '@/server/connectors/sync';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { app } from './app';

vi.mock('@/server/connectors/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/connectors/sync')>()),
  enqueueDueSyncs: vi.fn(async () => 1),
}));

const PATH = '/api/linear/webhooks';
const LATER = new Date(Date.now() + 15 * 60_000);
// Généré à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const SECRET = randomBytes(24).toString('hex');

const tenantIds: string[] = [];
let paul: TenantContext;
let lina: TenantContext;
// Linear donne des identifiants uniques partout : chaque test a sa propre organisation.
let organisation: string;

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(async () => {
  vi.mocked(enqueueDueSyncs).mockClear();
  vi.stubEnv('LEON_LINEAR_WEBHOOK_SECRET', SECRET);
  const team = await createTestTenant(['Paul', 'Lina']);
  tenantIds.push(team.tenantId);
  [paul, lina] = team.members as [TenantContext, TenantContext];
  organisation = randomUUID();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Une connexion Linear par le bouton, relevée dans un quart d'heure : son accountKey est `<viewer.id>:<organization.id>`.
function linearConnection(
  ctx: TenantContext,
  input: {
    accountKey?: string;
    status?: 'active' | 'paused' | 'error';
    nextSyncAt?: Date | null;
  } = {},
) {
  return seedConnection(ctx, {
    provider: 'linear',
    status: input.status ?? 'active',
    nextSyncAt: input.nextSyncAt === undefined ? LATER : input.nextSyncAt,
    config: {
      authMode: 'oauth',
      accountKey: input.accountKey ?? `${randomUUID()}:${organisation}`,
    },
  });
}

async function dueOf(connectionId: string): Promise<boolean | null | undefined> {
  const { rows } = await adminPool.query<{ due: boolean | null }>(
    'select next_sync_at <= now() as due from connections where id = $1',
    [connectionId],
  );
  return rows[0]?.due;
}

// La dernière relève a commencé il y a `ago` secondes, et l'échéance tombe `due` secondes après ce début.
async function lastSync(connectionId: string, ago: number, due: number) {
  await adminPool.query(
    `update connections set last_sync_started_at = now() - make_interval(secs => $2),
       next_sync_at = now() - make_interval(secs => $2) + make_interval(secs => $3) where id = $1`,
    [connectionId, ago, due],
  );
}

// L'échéance, en secondes après le début de la dernière relève.
async function dueAfterStart(connectionId: string): Promise<number | undefined> {
  const { rows } = await adminPool.query<{ seconds: number }>(
    'select extract(epoch from next_sync_at - last_sync_started_at)::float8 as seconds from connections where id = $1',
    [connectionId],
  );
  return rows[0]?.seconds;
}

const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');

// Une alerte comme Linear l'envoie : le corps signé tel quel, avec les en-têtes de la doc.
function send(body: string, signature: string | null = sign(body)) {
  return app.request(PATH, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'linear-delivery': randomUUID(),
      'linear-event': 'Issue',
      'linear-timestamp': String(Date.now()),
      ...(signature === null ? {} : { 'linear-signature': signature }),
    },
    body,
  });
}

const alert = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({
    action: 'update',
    type: 'Issue',
    data: { id: randomUUID(), title: 'Passer au plan Business' },
    url: 'https://linear.app/acme/issue/LEO-12/passer-au-plan-business',
    createdAt: new Date().toISOString(),
    organizationId: organisation,
    webhookTimestamp: Date.now(),
    ...fields,
  });

describe('POST /api/linear/webhooks', () => {
  it('une alerte bien signée rend dues tout de suite les connexions Linear de son organisation, et seulement elles', async () => {
    const mine = await linearConnection(paul);
    const colleague = await linearConnection(lina);
    const otherOrganisation = await linearConnection(paul, { accountKey: `v:${randomUUID()}` });
    // Une connexion par clé ne garde pas d'accountKey (connections/actions.ts) : relevée au quart d'heure, comme avant.
    const byKey = await seedConnection(paul, { provider: 'linear', nextSyncAt: LATER });

    const response = await send(alert());

    expect(response.status).toBe(200);
    expect(await dueOf(mine)).toBe(true);
    expect(await dueOf(colleague)).toBe(true);
    expect(await dueOf(otherOrganisation)).toBe(false);
    expect(await dueOf(byKey)).toBe(false);
    expect(enqueueDueSyncs).toHaveBeenCalledTimes(1);
  });

  it('une alerte sans relève dans la dernière minute rend la connexion due tout de suite', async () => {
    const id = await linearConnection(paul);
    await lastSync(id, 120, 15 * 60); // finie, la suivante au quart d'heure

    await send(alert());

    expect(await dueOf(id)).toBe(true);
  });

  // Une rafale d'alertes ne relance pas la relève à chaque ticket : au plus une par minute.
  it('une alerte 10 s après le début d’une relève donne une échéance une minute après ce début', async () => {
    const id = await linearConnection(paul);
    await lastSync(id, 10, -1); // en cours : l'échéance qui l'a lancée est passée

    await send(alert());

    expect(await dueAfterStart(id)).toBe(60);
    expect(await dueOf(id)).toBe(false);
  });

  it('une échéance plus proche, demandée depuis le début de la relève, reste', async () => {
    const id = await linearConnection(paul);
    await lastSync(id, 10, 5); // « Synchroniser maintenant » 5 s après le début

    await send(alert());

    expect(await dueAfterStart(id)).toBe(5);
  });

  it('compare la partie organisation de l’accountKey exactement : ni préfixe, ni partie utilisateur', async () => {
    const id = await linearConnection(paul);
    const viewerIsOrganisation = await linearConnection(paul, {
      accountKey: `${organisation}:${randomUUID()}`,
    });

    for (const organizationId of [organisation.slice(0, 8), `${organisation.slice(0, 8)}%`, '']) {
      expect((await send(alert({ organizationId }))).status).toBe(200);
    }
    expect(await dueOf(id)).toBe(false);

    await send(alert());
    expect(await dueOf(id)).toBe(true);
    expect(await dueOf(viewerIsOrganisation)).toBe(false);
  });

  it('une signature fausse ou absente, ou un corps changé après la signature : 401, rien ne change', async () => {
    const id = await linearConnection(paul);
    const body = alert();

    const responses = [
      await send(body, sign(body, 'autre-secret')),
      await send(body, null),
      await send(body, 'pas-de-l-hexadecimal'),
      await send(body.replace(organisation, randomUUID()), sign(body)),
    ];

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
    expect(await dueOf(id)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  // Un nouvel essai de Linear (1 min, 1 h, 6 h) peut garder l'horodatage du premier envoi : des refus répétés
  // pourraient faire désactiver le webhook. La relève du quart d'heure rattrape l'alerte.
  it('une alerte de plus d’une minute (un rejeu, un nouvel essai), ou datée de l’avenir : 200, sans rien faire', async () => {
    const id = await linearConnection(paul);

    const late = await send(alert({ webhookTimestamp: Date.now() - 61_000 }));
    const early = await send(alert({ webhookTimestamp: Date.now() + 61_000 }));

    expect([late.status, early.status]).toEqual([200, 200]);
    expect(await dueOf(id)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('une organisation inconnue ou absente : 200, sans rien faire', async () => {
    const id = await linearConnection(paul);

    const unknown = await send(alert({ organizationId: randomUUID() }));
    const absent = await send(alert({ organizationId: undefined }));
    const empty = await send(alert({ organizationId: null }));

    expect([unknown.status, absent.status, empty.status]).toEqual([200, 200, 200]);
    expect(await dueOf(id)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('une connexion en pause ou en erreur ne se réveille pas : elle attend sa reprise ou son prochain essai', async () => {
    const paused = await linearConnection(paul, { status: 'paused', nextSyncAt: null });
    const failing = await linearConnection(lina, { status: 'error' });

    const response = await send(alert());

    expect(response.status).toBe(200);
    expect(await dueOf(paused)).toBeNull();
    expect(await dueOf(failing)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('refuse un corps illisible, même bien signé', async () => {
    const responses = [
      await send('pas du json'),
      await send(JSON.stringify({ organizationId: organisation })),
      await send(JSON.stringify({ organizationId: organisation, webhookTimestamp: 'hier' })),
    ];

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('sans secret réglé : 503, dit une seule fois dans le journal', async () => {
    vi.stubEnv('LEON_LINEAR_WEBHOOK_SECRET', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const id = await linearConnection(paul);

    const responses = [await send(alert()), await send(alert())];

    expect(responses.map((response) => response.status)).toEqual([503, 503]);
    expect(warn.mock.calls).toEqual([['[leon]', 'linear.webhook_secret_missing']]);
    expect(await dueOf(id)).toBe(false);
    warn.mockRestore();
  });
});

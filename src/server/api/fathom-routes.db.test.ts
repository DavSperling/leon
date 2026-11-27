import { randomBytes, randomUUID } from 'node:crypto';
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

const LATER = new Date(Date.now() + 15 * 60_000);

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
});

const newToken = () => randomBytes(32).toString('base64url');

// Une connexion Fathom relevée dans un quart d'heure, et son alerte, dont seule l'empreinte du jeton est gardée.
async function alertedConnection(
  input: { status?: 'active' | 'paused' | 'error'; nextSyncAt?: Date | null } = {},
) {
  const jeton = newToken();
  const id = await seedConnection(paul, {
    provider: 'fathom',
    status: input.status ?? 'active',
    nextSyncAt: input.nextSyncAt === undefined ? LATER : input.nextSyncAt,
  });
  await adminPool.query(
    `insert into alertes_fathom (connection_id, tenant_id, id, empreinte)
     values ($1, $2, $3, sha256(convert_to($4, 'UTF8')))`,
    [id, paul.tenantId, `webhook-${randomUUID()}`, jeton],
  );
  return { id, jeton };
}

async function dueOf(connectionId: string) {
  const { rows } = await adminPool.query<{ due: boolean | null }>(
    'select next_sync_at <= now() as due from connections where id = $1',
    [connectionId],
  );
  return rows[0]?.due;
}

// Ce que Fathom envoie (signature « Standard Webhooks », réunion prête) : rien n'en est lu.
const alert = (jeton: string) =>
  app.request(`/api/fathom/webhooks/${jeton}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': `msg_${randomUUID()}`,
      'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
      'webhook-signature': 'v1,c2lnbmF0dXJlIG5vbiB2w6lyaWZpw6ll',
    },
    body: JSON.stringify({ recording_id: 123456789, title: 'Point produit', action_items: [] }),
  });

describe('POST /api/fathom/webhooks/:jeton', () => {
  it('une alerte au bon jeton rend la connexion due tout de suite et met sa relève en file', async () => {
    const { id, jeton } = await alertedConnection();

    const response = await alert(jeton);

    expect(response.status).toBe(200);
    expect(await dueOf(id)).toBe(true);
    expect(enqueueDueSyncs).toHaveBeenCalledTimes(1);
  });

  it('un jeton inconnu ou mal formé ne change rien, et Fathom reçoit quand même un 200', async () => {
    const { id } = await alertedConnection();

    for (const jeton of [newToken(), 'pas-un-jeton', `${newToken()}x`, '%00'.repeat(15)]) {
      const response = await alert(jeton);
      expect(response.status, jeton).toBe(200);
    }

    expect(await dueOf(id)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('une connexion en pause ou en erreur ne se réveille pas : elle attend sa reprise ou son prochain essai', async () => {
    const paused = await alertedConnection({ status: 'paused', nextSyncAt: null });
    const failing = await alertedConnection({ status: 'error' });

    await alert(paused.jeton);
    await alert(failing.jeton);

    expect(await dueOf(paused.id)).toBeNull();
    expect(await dueOf(failing.id)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('une file en panne ne fait pas réessayer Fathom : la connexion reste due pour le tic de la minute', async () => {
    const { id, jeton } = await alertedConnection();
    vi.mocked(enqueueDueSyncs).mockRejectedValueOnce(new Error('file indisponible'));

    const response = await alert(jeton);

    expect(response.status).toBe(200);
    expect(await dueOf(id)).toBe(true);
  });
});

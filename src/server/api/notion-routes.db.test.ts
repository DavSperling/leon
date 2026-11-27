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

const PATH = '/api/notion/webhooks';
const LATER = new Date(Date.now() + 15 * 60_000);
// Fabriqué à chaque lancement : aucun secret dans le dépôt.
const TOKEN = `secret_${randomBytes(16).toString('hex')}`;

const tenantIds: string[] = [];
let paul: TenantContext;
// Un espace par test : les connexions des autres tests n'y sont jamais.
let workspace: string;

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(async () => {
  vi.mocked(enqueueDueSyncs).mockClear();
  vi.stubEnv('LEON_NOTION_WEBHOOK_TOKEN', TOKEN);
  const team = await createTestTenant(['Paul']);
  tenantIds.push(team.tenantId);
  [paul] = team.members as [TenantContext];
  workspace = randomUUID();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Une connexion relevée dans un quart d'heure ; sa clé est celle que rend verify (notion/connector.ts).
function connection(
  accountKey: string,
  input: { status?: 'active' | 'paused' | 'error'; provider?: 'notion' | 'linear' } = {},
) {
  const status = input.status ?? 'active';
  return seedConnection(paul, {
    provider: input.provider ?? 'notion',
    status,
    nextSyncAt: status === 'paused' ? null : LATER,
    config: { authMode: 'oauth', accountKey },
  });
}

async function due(connectionId: string) {
  const { rows } = await adminPool.query<{ due: boolean | null }>(
    'select next_sync_at <= now() as due from connections where id = $1',
    [connectionId],
  );
  return rows[0]?.due;
}

const sign = (body: string, token = TOKEN) =>
  `sha256=${createHmac('sha256', token).update(body).digest('hex')}`;

const post = (body: string, signature?: string) =>
  app.request(PATH, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature === undefined ? {} : { 'x-notion-signature': signature }),
    },
    body,
  });

// Un événement comme ceux de la doc (webhooks-events-delivery), d'un espace donné.
const event = (workspaceId: string | undefined) =>
  JSON.stringify({
    id: randomUUID(),
    timestamp: '2026-11-27T10:00:00.000Z',
    workspace_id: workspaceId,
    workspace_name: 'Acme',
    subscription_id: randomUUID(),
    integration_id: randomUUID(),
    type: 'page.properties_updated',
    authors: [{ id: randomUUID(), type: 'person' }],
    entity: { id: randomUUID(), type: 'page' },
    data: { parent: { id: randomUUID(), type: 'space' }, updated_properties: ['XGe%40'] },
    attempt_number: 1,
    api_version: '2026-03-11',
  });

describe('POST /api/notion/webhooks : vérification de l’abonnement', () => {
  const verification = JSON.stringify({ verification_token: TOKEN });

  it('sans LEON_NOTION_WEBHOOK_TOKEN, journalise le jeton une fois, pour l’admin, et répond 200', async () => {
    vi.stubEnv('LEON_NOTION_WEBHOOK_TOKEN', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    // logError, seul chemin vers Sentry, écrit sur console.error.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post(verification);

    expect(response.status).toBe(200);
    const lines = [...warn.mock.calls, ...info.mock.calls].map((call) => call.join(' '));
    expect(lines.filter((line) => line.includes(TOKEN))).toHaveLength(1);
    expect(lines[0]).toContain('Notion › Verify');
    expect(lines[0]).toContain('LEON_NOTION_WEBHOOK_TOKEN');
    expect(error).not.toHaveBeenCalled();
  });

  it('avec la variable posée, dit qu’une vérification est arrivée sans journaliser le jeton', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const response = await post(JSON.stringify({ verification_token: 'secret_nouveau' }));

    expect(response.status).toBe(200);
    const lines = [...warn.mock.calls, ...info.mock.calls].map((call) => call.join(' '));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('notion.webhook_verification');
    expect(lines[0]).not.toContain('secret_nouveau');
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });
});

describe('POST /api/notion/webhooks : événements', () => {
  it('bien signé, rend dues tout de suite les connexions Notion actives de l’espace et met leur relève en file', async () => {
    const button = await connection(`${workspace}:${randomUUID()}`);
    const key = await connection(`${workspace}:espace`);
    const body = event(workspace);

    const response = await post(body, sign(body));

    expect(response.status).toBe(200);
    expect([await due(button), await due(key)]).toEqual([true, true]);
    expect(enqueueDueSyncs).toHaveBeenCalledTimes(1);
  });

  it('compare l’espace exactement : ni un autre espace, ni un préfixe, ni une clé sans espace, ni un autre outil', async () => {
    const others = [
      await connection(`${randomUUID()}:espace`),
      await connection(`${workspace}0:espace`),
      await connection(workspace),
      await connection(`${workspace}:espace`, { provider: 'linear' }),
    ];
    const body = event(workspace);

    expect((await post(body, sign(body))).status).toBe(200);
    for (const id of others) expect(await due(id)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('une signature fausse ou absente répond 401 et ne réveille rien, comme tout événement sans la variable', async () => {
    const id = await connection(`${workspace}:espace`);
    const body = event(workspace);

    expect((await post(body, sign(body, 'secret_autre'))).status).toBe(401);
    expect((await post(body, sign(`${body} `))).status).toBe(401);
    expect((await post(body, 'sha256=00')).status).toBe(401);
    expect((await post(body)).status).toBe(401);
    vi.stubEnv('LEON_NOTION_WEBHOOK_TOKEN', '');
    expect((await post(body, sign(body))).status).toBe(401);

    expect(await due(id)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('un espace inconnu ou absent répond 200 sans rien faire', async () => {
    const id = await connection(`${workspace}:espace`);
    const unknown = event(randomUUID());
    const absent = event(undefined);

    expect((await post(unknown, sign(unknown))).status).toBe(200);
    expect((await post(absent, sign(absent))).status).toBe(200);
    expect(await due(id)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('une connexion en pause ou en erreur ne se réveille pas : elle attend sa reprise ou son prochain essai', async () => {
    const paused = await connection(`${workspace}:espace`, { status: 'paused' });
    const failing = await connection(`${workspace}:${randomUUID()}`, { status: 'error' });
    const body = event(workspace);

    expect((await post(body, sign(body))).status).toBe(200);
    expect(await due(paused)).toBeNull();
    expect(await due(failing)).toBe(false);
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });

  it('une file en panne ne fait pas échouer la réponse : la connexion reste due', async () => {
    vi.mocked(enqueueDueSyncs).mockRejectedValueOnce(new Error('file indisponible'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await connection(`${workspace}:espace`);
    const body = event(workspace);

    expect((await post(body, sign(body))).status).toBe(200);
    expect(await due(id)).toBe(true);
  });

  it('refuse un corps illisible : 401 sans signature, 400 une fois la signature vérifiée', async () => {
    for (const body of ['pas du JSON', '[1, 2]', '{"workspace_id": 42}']) {
      expect((await post(body)).status).toBe(401);
      expect((await post(body, sign(body))).status).toBe(400);
    }
    expect(enqueueDueSyncs).not.toHaveBeenCalled();
  });
});

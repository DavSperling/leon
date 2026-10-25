import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection, seedSource } from '@/test/fixtures';
import {
  claimConnection,
  createConnection,
  deleteConnection,
  finishSync,
  listConnections,
  replaceConnectionSecret,
  requestSyncNow,
  saveOAuthTokens,
  saveSyncProgress,
  setConnectionPaused,
} from './connections';

// Organisation Paul + Marie (administratrice) + Bob (simple membre), une autre organisation (Zoé).
// La base de test est partagée : on ne retire que nos connexions (voir « Connexions dans les tests »
// dans le plan).

const DUE = new Date('2000-01-01T00:00:00Z');
const DAY_MS = 24 * 3_600_000;

const tenantIds: string[] = [];
let paul: TenantContext;
let marie: TenantContext;
let bob: TenantContext;
let zoe: TenantContext;

beforeAll(async () => {
  const team = await createTestTenant(['Paul', 'Marie', 'Bob']);
  const other = await createTestTenant(['Zoé']);
  [paul, marie, bob] = team.members as [TenantContext, TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  await adminPool.query(
    `update member set role = 'admin' where "userId" = $1 and "organizationId" = $2`,
    [marie.userId, marie.tenantId],
  );
  tenantIds.push(team.tenantId, other.tenantId);
});

afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

type Row = {
  status: string;
  secret: string;
  secret_hint: string;
  config: Record<string, unknown>;
  cursor: string | null;
  next_sync_at: Date | null;
  sync_lock_at: Date | null;
  last_sync_at: Date | null;
  last_error: string | null;
  items_synced: number;
  acl: string[];
  created_by: string;
  seconds_to_next: number | null;
};

async function readRow(id: string): Promise<Row> {
  const { rows } = await adminPool.query<Row>(
    `select status, secret, secret_hint, config, cursor, next_sync_at, sync_lock_at, last_sync_at,
            last_error, items_synced, acl, created_by,
            extract(epoch from next_sync_at - now())::float as seconds_to_next
     from connections where id = $1`,
    [id],
  );
  if (!rows[0]) throw new Error('connexion introuvable');
  return rows[0];
}

const makeDue = (id: string) =>
  adminPool.query('update connections set next_sync_at = $2 where id = $1', [id, DUE]);
const makeNotDue = (id: string) =>
  adminPool.query('update connections set next_sync_at = null where id = $1', [id]);

// Réserve la connexion (échue) et rend l'heure de réservation, que la relève passe à chaque écriture.
async function claimed(ctx: TenantContext, id: string): Promise<string> {
  const loaded = await claimConnection(ctx, id);
  if (!loaded) throw new Error('connexion non réservée');
  return loaded.lockedAt;
}

const atlassian = {
  provider: 'jira' as const,
  label: 'Jira Acme',
  config: { site: 'acme', email: 'marie@acme.test', apiToken: 'jeton-atlassian-AB12' },
  secretFields: ['apiToken'],
  since: new Date(Date.now() - 30 * DAY_MS),
};

describe('createConnection', () => {
  it('chiffre le secret et garde les autres champs en clair', async () => {
    const id = await createConnection(paul, atlassian);
    await makeNotDue(id);

    const row = await readRow(id);
    expect(row.config).toEqual({ site: 'acme', email: 'marie@acme.test' });
    expect(row.secret.startsWith('v1:')).toBe(true);
    expect(row.secret).not.toContain('jeton-atlassian');
    expect(row.secret_hint).toBe('AB12');
    expect(row.status).toBe('active');
    expect(row.acl).toEqual([paul.tenantId]);
    expect(row.created_by).toBe(paul.userId);
    expect(row.items_synced).toBe(0);
  });

  it("met l'échéance à maintenant : le tic suivant la prend", async () => {
    const id = await createConnection(paul, atlassian);

    const row = await readRow(id);
    await makeNotDue(id);
    expect(row.next_sync_at).not.toBeNull();
    expect(row.seconds_to_next).toBeLessThanOrEqual(0);
  });

  it("prend l'indice dans le premier champ secret, tous les secrets sont chiffrés ensemble", async () => {
    const id = await createConnection(paul, {
      provider: 'leexi',
      label: 'Leexi',
      config: { keyId: 'identifiant-0001', keySecret: 'secret-leexi-9999' },
      secretFields: ['keyId', 'keySecret'],
      since: atlassian.since,
    });
    await makeDue(id);

    const row = await readRow(id);
    expect(row.config).toEqual({});
    expect(row.secret_hint).toBe('0001');
    const loaded = await claimConnection(paul, id);
    expect(loaded?.config).toEqual({ keyId: 'identifiant-0001', keySecret: 'secret-leexi-9999' });
  });
});

describe('listConnections', () => {
  it('montre la connexion à toute l’équipe, sans jamais renvoyer le secret', async () => {
    const id = await createConnection(paul, atlassian);
    await makeNotDue(id);
    const stored = (await readRow(id)).secret;

    const seenByMarie = (await listConnections(marie)).find((view) => view.id === id);

    expect(seenByMarie).toMatchObject({
      provider: 'jira',
      label: 'Jira Acme',
      config: { site: 'acme', email: 'marie@acme.test' },
      secretHint: 'AB12',
      status: 'active',
      itemsSynced: 0,
      lastError: null,
      createdBy: { id: paul.userId, name: 'Paul' },
    });
    const json = JSON.stringify(seenByMarie);
    expect(json).not.toContain('jeton-atlassian');
    expect(json).not.toContain(stored);
    expect(Object.keys(seenByMarie ?? {})).not.toContain('secret');
  });

  it('ne montre rien à une autre organisation', async () => {
    const id = await seedConnection(paul);

    expect((await listConnections(zoe)).find((view) => view.id === id)).toBeUndefined();
  });
});

describe('claimConnection', () => {
  it('réserve une connexion échue et rend la configuration fusionnée, secret déchiffré', async () => {
    const id = await createConnection(paul, atlassian);
    await makeDue(id);

    const loaded = await claimConnection(paul, id);

    expect(loaded).toMatchObject({
      id,
      provider: 'jira',
      createdBy: paul.userId,
      config: { site: 'acme', email: 'marie@acme.test', apiToken: 'jeton-atlassian-AB12' },
      cursor: null,
    });
    expect(loaded?.since).toEqual(atlassian.since);
    const row = await readRow(id);
    expect(row.sync_lock_at).not.toBeNull();
  });

  it('ne réserve pas deux fois la même connexion', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });

    expect(await claimConnection(paul, id)).not.toBeNull();
    expect(await claimConnection(paul, id)).toBeNull();
  });

  it('reprend une réservation abandonnée depuis plus de 30 minutes', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    await adminPool.query(
      "update connections set sync_lock_at = now() - interval '31 minutes' where id = $1",
      [id],
    );

    expect(await claimConnection(paul, id)).not.toBeNull();
  });

  it("ne réserve ni une connexion en pause, ni une connexion qui n'est pas échue", async () => {
    const paused = await seedConnection(paul, { status: 'paused', nextSyncAt: DUE });
    const later = await seedConnection(paul, { nextSyncAt: new Date(Date.now() + DAY_MS) });
    const never = await seedConnection(paul, { status: 'error', nextSyncAt: null });

    expect(await claimConnection(paul, paused)).toBeNull();
    expect(await claimConnection(paul, later)).toBeNull();
    expect(await claimConnection(paul, never)).toBeNull();
  });

  it('réserve aussi une connexion en erreur dont l’échéance est passée', async () => {
    const id = await seedConnection(paul, { status: 'error', nextSyncAt: DUE });

    expect(await claimConnection(paul, id)).not.toBeNull();
  });

  it('ne réserve pas la connexion d’une autre organisation', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });

    expect(await claimConnection(zoe, id)).toBeNull();
    expect((await readRow(id)).sync_lock_at).toBeNull();
  });

  it('refuse un secret recopié sur une autre connexion, sans le montrer, et garde la réservation', async () => {
    const source = await createConnection(paul, atlassian);
    const target = await seedConnection(paul, { nextSyncAt: DUE });
    const copied = (await readRow(source)).secret;
    await adminPool.query('update connections set secret = $2 where id = $1', [target, copied]);
    await makeNotDue(source);

    const error = await claimConnection(paul, target).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain('jeton-atlassian');
    // La réservation reste posée : la relève la libère par finishSync.
    expect((await readRow(target)).sync_lock_at).not.toBeNull();
  });
});

describe('saveSyncProgress', () => {
  it('enregistre le curseur et additionne les éléments', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);

    expect(await saveSyncProgress(paul, id, lock, 'curseur-1', 100)).toBe(true);
    expect(await saveSyncProgress(paul, id, lock, 'curseur-2', 30)).toBe(true);

    const row = await readRow(id);
    expect(row.cursor).toBe('curseur-2');
    expect(row.items_synced).toBe(130);
  });

  // Audit n° 4 : un passage de plus de 30 minutes garde sa réservation tant qu'il avance.
  it('rafraîchit la réservation : une autre relève ne la reprend pas', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);
    await adminPool.query(
      "update connections set sync_lock_at = now() - interval '29 minutes' where id = $1",
      [id],
    );

    await saveSyncProgress(paul, id, lock, 'curseur-1', 10);
    await adminPool.query(
      "update connections set sync_lock_at = sync_lock_at - interval '2 minutes' where id = $1",
      [id],
    );

    expect(await claimConnection(paul, id)).toBeNull();
  });

  // Audit n° 4 : une réservation reprise par une autre relève, l'ancienne n'écrit plus rien.
  it("n'écrit rien quand la réservation a été reprise par une autre relève", async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const old = await claimed(paul, id);
    await adminPool.query(
      "update connections set sync_lock_at = now() - interval '31 minutes' where id = $1",
      [id],
    );
    const current = await claimed(paul, id);

    expect(await saveSyncProgress(paul, id, old, 'curseur-ancien', 50)).toBe(false);
    await finishSync(paul, id, old, { kind: 'error', message: 'ancienne relève' });

    const row = await readRow(id);
    expect(row.cursor).toBeNull();
    expect(row.items_synced).toBe(0);
    expect(row.last_error).toBeNull();
    expect(row.sync_lock_at).not.toBeNull();
    expect(await saveSyncProgress(paul, id, current, 'curseur-1', 5)).toBe(true);
  });
});

describe('finishSync', () => {
  it('ok « soon » : active, sans erreur, prochaine échéance dans environ 1 minute, réservation libérée', async () => {
    const id = await seedConnection(paul, { status: 'error', nextSyncAt: DUE });
    await adminPool.query("update connections set last_error = 'ancienne erreur' where id = $1", [
      id,
    ]);
    const lock = await claimed(paul, id);

    await finishSync(paul, id, lock, { kind: 'ok', again: 'soon' });

    const row = await readRow(id);
    expect(row.status).toBe('active');
    expect(row.last_error).toBeNull();
    expect(row.last_sync_at).not.toBeNull();
    expect(row.sync_lock_at).toBeNull();
    expect(row.seconds_to_next).toBeGreaterThan(30);
    expect(row.seconds_to_next).toBeLessThanOrEqual(60);
  });

  it('ok « later » : prochaine échéance dans environ 15 minutes', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);

    await finishSync(paul, id, lock, { kind: 'ok', again: 'later' });

    const row = await readRow(id);
    expect(row.seconds_to_next).toBeGreaterThan(14 * 60);
    expect(row.seconds_to_next).toBeLessThanOrEqual(15 * 60);
  });

  it('ok « office » : au prochain créneau de bureau, heure de Paris (8 h, 11 h, 14 h ou 17 h)', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);

    await finishSync(paul, id, lock, { kind: 'ok', again: 'office' });

    const { rows } = await adminPool.query<{ hour: number; minute: number; ahead: number }>(
      `select extract(hour from next_sync_at at time zone 'Europe/Paris')::int as hour,
              extract(minute from next_sync_at at time zone 'Europe/Paris')::int as minute,
              extract(epoch from next_sync_at - now())::float as ahead
       from connections where id = $1`,
      [id],
    );
    expect([8, 11, 14, 17]).toContain(rows[0]?.hour);
    expect(rows[0]?.minute).toBe(0);
    // Au plus loin : de 17 h au lendemain 8 h (16 h au changement d'heure).
    expect(rows[0]?.ahead).toBeGreaterThan(0);
    expect(rows[0]?.ahead).toBeLessThanOrEqual(16 * 3600);
  });

  it('error « office » : en erreur, réessayée au prochain créneau de bureau', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);

    const outcome = { kind: 'error', message: 'Gmail a répondu 500', again: 'office' } as const;
    await finishSync(paul, id, lock, outcome);

    const { rows } = await adminPool.query<{ status: string; hour: number; minute: number }>(
      `select status, extract(hour from next_sync_at at time zone 'Europe/Paris')::int as hour,
              extract(minute from next_sync_at at time zone 'Europe/Paris')::int as minute
       from connections where id = $1`,
      [id],
    );
    expect(rows[0]?.status).toBe('error');
    expect([8, 11, 14, 17]).toContain(rows[0]?.hour);
    expect(rows[0]?.minute).toBe(0);
  });

  it('auth_error : en erreur, sans échéance, le message est gardé et la réservation libérée', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);

    await finishSync(paul, id, lock, { kind: 'auth_error', message: 'Clé refusée par GitHub.' });

    const row = await readRow(id);
    expect(row.status).toBe('error');
    expect(row.next_sync_at).toBeNull();
    expect(row.last_error).toBe('Clé refusée par GitHub.');
    expect(row.sync_lock_at).toBeNull();
    expect(row.last_sync_at).toBeNull();
  });

  it('error : en erreur, nouvel essai dans environ 1 heure, message coupé à 300 caractères', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);

    await finishSync(paul, id, lock, { kind: 'error', message: 'x'.repeat(500) });

    const row = await readRow(id);
    expect(row.status).toBe('error');
    expect(row.last_error).toBe('x'.repeat(300));
    expect(row.seconds_to_next).toBeGreaterThan(59 * 60);
    expect(row.seconds_to_next).toBeLessThanOrEqual(3_600);
  });

  // « Synchroniser maintenant » cliqué pendant le passage : la demande n'est pas écrasée.
  it('garde une échéance demandée après le début du passage', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);

    expect(await requestSyncNow(paul, id)).toBe(true);
    await finishSync(paul, id, lock, { kind: 'ok', again: 'later' });

    const row = await readRow(id);
    await makeNotDue(id);
    expect(row.seconds_to_next).toBeLessThanOrEqual(0);
    expect(row.sync_lock_at).toBeNull();
  });

  it("une pause demandée pendant le passage l'emporte", async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);

    await setConnectionPaused(paul, id, true);
    await finishSync(paul, id, lock, { kind: 'ok', again: 'soon' });

    const row = await readRow(id);
    expect(row.status).toBe('paused');
    expect(row.next_sync_at).toBeNull();
    expect(row.sync_lock_at).toBeNull();
    expect(row.last_sync_at).not.toBeNull();
  });

  it("une pause l'emporte aussi sur une erreur, dont le message est gardé", async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);

    await setConnectionPaused(paul, id, true);
    await finishSync(paul, id, lock, { kind: 'error', message: 'GitHub a répondu 500' });

    const row = await readRow(id);
    expect(row.status).toBe('paused');
    expect(row.next_sync_at).toBeNull();
    expect(row.last_error).toBe('GitHub a répondu 500');
    expect(row.sync_lock_at).toBeNull();
  });
});

describe('requestSyncNow', () => {
  // Audit 2 n° 13 b : l'erreur reste affichée jusqu'à ce que le passage dise si elle est réglée.
  it("met l'échéance à maintenant, sans toucher au statut ni à l'erreur", async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);
    await finishSync(paul, id, lock, { kind: 'auth_error', message: 'Clé refusée par GitHub.' });

    expect(await requestSyncNow(paul, id)).toBe(true);

    const row = await readRow(id);
    await makeNotDue(id);
    expect(row.status).toBe('error');
    expect(row.last_error).toBe('Clé refusée par GitHub.');
    expect(row.next_sync_at).not.toBeNull();
    expect(row.seconds_to_next).toBeLessThanOrEqual(0);
  });

  it("ne réveille pas une connexion en pause (elle n'a pas d'échéance)", async () => {
    const id = await seedConnection(paul, { status: 'paused' });

    expect(await requestSyncNow(paul, id)).toBe(false);

    const row = await readRow(id);
    expect(row.status).toBe('paused');
    expect(row.next_sync_at).toBeNull();
  });

  it('refuse la connexion d’une autre organisation', async () => {
    const id = await seedConnection(paul);

    expect(await requestSyncNow(zoe, id)).toBe(false);
    expect((await readRow(id)).next_sync_at).toBeNull();
  });
});

describe('setConnectionPaused', () => {
  it("met en pause (sans échéance) puis reprend (échéance maintenant), au nom d'une administratrice", async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });

    expect(await setConnectionPaused(marie, id, true)).toBe(true);
    const paused = await readRow(id);
    expect(paused.status).toBe('paused');
    expect(paused.next_sync_at).toBeNull();

    expect(await setConnectionPaused(marie, id, false)).toBe(true);
    const resumed = await readRow(id);
    await makeNotDue(id);
    expect(resumed.status).toBe('active');
    expect(resumed.next_sync_at).not.toBeNull();
    expect(resumed.seconds_to_next).toBeLessThanOrEqual(0);
  });

  it("ne fait rien sur la connexion d'une autre organisation", async () => {
    const id = await seedConnection(paul);

    expect(await setConnectionPaused(zoe, id, true)).toBe(false);
    expect((await readRow(id)).status).toBe('active');
  });
});

describe('replaceConnectionSecret', () => {
  it('change le secret et son indice, la relève lit le nouveau', async () => {
    const id = await createConnection(paul, atlassian);
    await makeNotDue(id);
    const before = (await readRow(id)).secret;

    const replaced = await replaceConnectionSecret(
      paul,
      id,
      { ...atlassian.config, apiToken: 'nouveau-jeton-ZZ99' },
      atlassian.secretFields,
    );

    expect(replaced).toBe(true);
    const row = await readRow(id);
    expect(row.secret).not.toBe(before);
    expect(row.secret_hint).toBe('ZZ99');
    expect(row.config).toEqual({ site: 'acme', email: 'marie@acme.test' });
    await makeDue(id);
    expect((await claimConnection(paul, id))?.config.apiToken).toBe('nouveau-jeton-ZZ99');
  });

  it('relance une connexion refusée (« Clé refusée ») : active, sans erreur, échéance maintenant', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);
    await finishSync(paul, id, lock, { kind: 'auth_error', message: 'Clé refusée par Jira.' });

    await replaceConnectionSecret(paul, id, { token: 'autre-jeton-1234' }, ['token']);

    const row = await readRow(id);
    await makeNotDue(id);
    expect(row.status).toBe('active');
    expect(row.last_error).toBeNull();
    expect(row.next_sync_at).not.toBeNull();
    expect(row.seconds_to_next).toBeLessThanOrEqual(0);
  });

  it('laisse une connexion en pause en pause, sans échéance', async () => {
    const id = await seedConnection(paul, { status: 'paused' });

    await replaceConnectionSecret(paul, id, { token: 'autre-jeton-1234' }, ['token']);

    const row = await readRow(id);
    expect(row.status).toBe('paused');
    expect(row.next_sync_at).toBeNull();
    expect(row.secret_hint).toBe('1234');
  });

  it("ne touche pas la connexion d'une autre organisation", async () => {
    const id = await seedConnection(paul);
    const before = (await readRow(id)).secret;

    expect(await replaceConnectionSecret(zoe, id, { token: 'pirate-0000' }, ['token'])).toBe(false);
    expect((await readRow(id)).secret).toBe(before);
  });
});

describe('saveOAuthTokens', () => {
  const oauthFields = ['accessToken', 'refreshToken'];
  const oauthConfig = (extra: Record<string, unknown> = {}) => ({
    authMode: 'oauth',
    accessToken: 'acces-nouveau-AB12',
    refreshToken: 'rafraichir-nouveau',
    expiresAt: '2026-10-15T12:00:00.000Z',
    cloudId: 'nuage-1',
    ...extra,
  });

  // Connexion branchée par le bouton, échue, avec le jeton de rafraîchissement `refreshToken`.
  async function oauthConnection(refreshToken: string): Promise<string> {
    const config = oauthConfig({ accessToken: 'acces-ancien-0000', refreshToken });
    const id = await createConnection(paul, {
      ...atlassian,
      config,
      secretFields: oauthFields,
    });
    await makeDue(id);
    return id;
  }

  it('sans reconnexion : réécrit jetons et champs ouverts, statut, échéance et réservation inchangés', async () => {
    const id = await oauthConnection('rafraichir-ancien');
    const lock = await claimed(paul, id);
    const before = await readRow(id);

    const saved = await saveOAuthTokens(paul, id, oauthConfig(), oauthFields, {
      reconnect: false,
      renewedFrom: 'rafraichir-ancien',
    });

    expect(saved).toBe(true);
    const row = await readRow(id);
    expect(row.secret).not.toBe(before.secret);
    expect(row.secret).not.toContain('acces-nouveau');
    expect(row.secret_hint).toBe('AB12');
    expect(row.config).toEqual({
      authMode: 'oauth',
      expiresAt: '2026-10-15T12:00:00.000Z',
      cloudId: 'nuage-1',
    });
    expect(row.status).toBe(before.status);
    expect(row.next_sync_at).toEqual(before.next_sync_at);
    expect(row.sync_lock_at).toEqual(before.sync_lock_at);
    expect(row.sync_lock_at).not.toBeNull();
    await finishSync(paul, id, lock, { kind: 'ok', again: 'later' });
    await makeDue(id);
    const loaded = await claimConnection(paul, id);
    expect(loaded?.config).toMatchObject({
      accessToken: 'acces-nouveau-AB12',
      refreshToken: 'rafraichir-nouveau',
      cloudId: 'nuage-1',
    });
  });

  // Audit 2 n° 13 a : « Reconnecter » pendant un renouvellement. Le renouvellement, parti des anciens
  // jetons, n'écrase pas ceux de la reconnexion.
  it("sans reconnexion : n'écrit rien quand les jetons ont changé depuis leur lecture", async () => {
    const id = await oauthConnection('rafraichir-ancien');
    const reconnected = oauthConfig({ refreshToken: 'rafraichir-reconnecte' });
    await saveOAuthTokens(paul, id, reconnected, oauthFields, { reconnect: true });
    const before = await readRow(id);

    const saved = await saveOAuthTokens(paul, id, oauthConfig(), oauthFields, {
      reconnect: false,
      renewedFrom: 'rafraichir-ancien',
    });

    expect(saved).toBe(false);
    const row = await readRow(id);
    expect([row.secret, row.secret_hint, row.config]).toEqual([
      before.secret,
      before.secret_hint,
      before.config,
    ]);
    await makeDue(id);
    expect((await claimConnection(paul, id))?.config.refreshToken).toBe('rafraichir-reconnecte');
  });

  it('avec reconnexion : relance une connexion en erreur, active, sans erreur, échéance maintenant', async () => {
    const id = await seedConnection(paul, { nextSyncAt: DUE });
    const lock = await claimed(paul, id);
    await finishSync(paul, id, lock, { kind: 'auth_error', message: 'Reconnectez Linear.' });

    await saveOAuthTokens(paul, id, oauthConfig(), oauthFields, { reconnect: true });

    const row = await readRow(id);
    await makeNotDue(id);
    expect(row.status).toBe('active');
    expect(row.last_error).toBeNull();
    expect(row.next_sync_at).not.toBeNull();
    expect(row.seconds_to_next).toBeLessThanOrEqual(0);
  });

  it('avec reconnexion : laisse une connexion en pause en pause, sans échéance', async () => {
    const id = await seedConnection(paul, { status: 'paused' });

    await saveOAuthTokens(paul, id, oauthConfig(), oauthFields, { reconnect: true });

    const row = await readRow(id);
    expect(row.status).toBe('paused');
    expect(row.next_sync_at).toBeNull();
    expect(row.secret_hint).toBe('AB12');
  });

  it("ne touche pas la connexion d'une autre organisation", async () => {
    const id = await seedConnection(paul);
    const before = await readRow(id);

    expect(await saveOAuthTokens(zoe, id, oauthConfig(), oauthFields, { reconnect: true })).toBe(
      false,
    );
    expect(await readRow(id)).toEqual(before);
  });
});

describe('deleteConnection', () => {
  it('supprime la connexion et laisse les sources déjà captées', async () => {
    const id = await seedConnection(paul);
    const { sourceId } = await seedSource(paul, { kind: 'github' });
    await adminPool.query('update sources set connection_id = $2 where id = $1', [sourceId, id]);

    expect(await deleteConnection(marie, id)).toBe(true);

    const { rowCount } = await adminPool.query('select 1 from connections where id = $1', [id]);
    expect(rowCount).toBe(0);
    const kept = await adminPool.query<{ connection_id: string | null }>(
      'select connection_id from sources where id = $1',
      [sourceId],
    );
    expect(kept.rows).toHaveLength(1);
    expect(kept.rows[0]?.connection_id).toBeNull();
  });

  it("ne supprime pas la connexion d'une autre organisation", async () => {
    const id = await seedConnection(paul);

    expect(await deleteConnection(zoe, id)).toBe(false);
    expect((await readRow(id)).status).toBe('active');
  });
});

// Audit n° 3 : Bob, simple membre, ne touche pas aux connexions de Paul ; Marie, administratrice, oui.
describe('droits sur une connexion', () => {
  it('seuls le créateur et les administrateurs peuvent la gérer (canManage)', async () => {
    const id = await seedConnection(paul);

    const canManage = async (ctx: TenantContext) =>
      (await listConnections(ctx)).find((view) => view.id === id)?.canManage;

    expect(await canManage(paul)).toBe(true);
    expect(await canManage(marie)).toBe(true);
    expect(await canManage(bob)).toBe(false);
  });

  it('un simple membre ne peut ni mettre en pause, ni remplacer la clé, ni reconnecter, ni supprimer', async () => {
    const id = await seedConnection(paul);
    const before = await readRow(id);
    const oauth = { authMode: 'oauth', accessToken: 'jeton-de-bob-0000' };

    expect(await setConnectionPaused(bob, id, true)).toBe(false);
    expect(await replaceConnectionSecret(bob, id, { token: 'cle-de-bob-0000' }, ['token'])).toBe(
      false,
    );
    expect(await saveOAuthTokens(bob, id, oauth, ['accessToken'], { reconnect: true })).toBe(false);
    expect(await deleteConnection(bob, id)).toBe(false);

    expect(await readRow(id)).toEqual(before);
  });

  // Audit 2 n° 2 : la clé et les jetons sont ceux du compte du créateur. Une administratrice qui
  // « Reconnecte » mettrait son propre compte à sa place ; elle garde la pause et la suppression.
  it('une administratrice ne remplace ni la clé ni les jetons : réservés au créateur (isCreator)', async () => {
    const id = await seedConnection(paul);
    const before = await readRow(id);
    const oauth = { authMode: 'oauth', accessToken: 'jeton-de-marie-0000' };
    const isCreator = async (ctx: TenantContext) =>
      (await listConnections(ctx)).find((view) => view.id === id)?.isCreator;

    expect(await isCreator(paul)).toBe(true);
    expect(await isCreator(marie)).toBe(false);
    expect(
      await replaceConnectionSecret(marie, id, { token: 'cle-de-marie-0000' }, ['token']),
    ).toBe(false);
    expect(await saveOAuthTokens(marie, id, oauth, ['accessToken'], { reconnect: true })).toBe(
      false,
    );
    expect(await readRow(id)).toEqual(before);

    expect(await setConnectionPaused(marie, id, true)).toBe(true);
    expect(await deleteConnection(marie, id)).toBe(true);
  });

  it('un simple membre peut encore demander « Synchroniser maintenant »', async () => {
    const id = await seedConnection(paul);

    expect(await requestSyncNow(bob, id)).toBe(true);
    await makeNotDue(id);
  });
});

// Audit 3 n° 14 : la relève saute la connexion d'un créateur parti (connector_syncs_due).
describe('créateur parti', () => {
  it('la vue le dit et « Synchroniser maintenant » refuse', async () => {
    const team = await createTestTenant(['Paul', 'Bob']);
    tenantIds.push(team.tenantId);
    const [stays, leaves] = team.members as [TenantContext, TenantContext];
    const id = await seedConnection(leaves);
    await adminPool.query(`delete from member where "userId" = $1 and "organizationId" = $2`, [
      leaves.userId,
      leaves.tenantId,
    ]);

    const [view] = await listConnections(stays);
    expect(view).toMatchObject({ id, creatorLeft: true, createdBy: { name: 'Bob' } });
    expect(await requestSyncNow(stays, id)).toBe(false);

    const kept = await seedConnection(stays);
    expect((await listConnections(stays)).find((v) => v.id === kept)?.creatorLeft).toBe(false);
    expect(await requestSyncNow(stays, kept)).toBe(true);
  });
});

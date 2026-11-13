import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS, type Usage, ViewerProfileSchema } from '@/capture/api-contract';
import {
  createApiToken,
  createGrant,
  generateApiToken,
  hashApiToken,
} from '@/server/auth/api-tokens';
import { signComputerCode } from '@/server/auth/computer-code';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { members, users } from '@/server/db/schema/auth';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { app } from './app';

afterEach(() => vi.restoreAllMocks());

async function setup() {
  const { tenantId, members: team } = await createTestTenant(['Paul', 'Marie']);
  const [paul, marie] = team;
  if (!paul || !marie) throw new Error('membres de test manquants');
  return { tenantId, paul, marie };
}

// Ce que fait la CLI : elle tire son jeton, la page d'autorisation signe un code pour son empreinte, la CLI l'échange.
const codeFor = (
  token: string,
  who: TenantContext,
  options?: Parameters<typeof signComputerCode>[1],
) => signComputerCode({ e: hashApiToken(token), u: who.userId, t: who.tenantId }, options);

const exchange = (token: string, code: string, nom = 'MacBook-Pro') =>
  apiRequest(API_PATHS.ordinateurs, { token, body: { code, nom } });

const rowsOf = (token: string) =>
  adminDb
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashApiToken(token)));

// Un seul message pour tous les 401 : il ne dit pas laquelle des vérifications a échoué.
async function expectUnauthorized(response: Response) {
  expect(response.status).toBe(401);
  expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  expect(await response.json()).toEqual({ error: 'Missing or invalid token' });
}

// Espionne console.* : rien de ce qui identifie le jeton ne doit y passer.
function spyConsole() {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = methods.map((method) => vi.spyOn(console, method));
  return () => spies.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args));
}

describe('POST /api/v1/ordinateurs', () => {
  it('répond 201, enregistre le jeton de la CLI au nom de « Ordinateur : … », et le jeton marche ensuite', async () => {
    const { paul } = await setup();
    const token = generateApiToken();

    const response = await exchange(token, codeFor(token, paul));

    expect(response.status).toBe(201);
    const body = await response.json();
    // `compte` : l'e-mail du compte autorisé, que la CLI affiche pour qu'on voie à quel compte l'ordinateur se branche.
    const [account] = await adminDb
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, paul.userId));
    expect(account?.email).toMatch(/@test\.leon$/);
    // `usages` et `refus` (T64, C16) : toujours des tableaux, vides sans case sur la page.
    expect(body).toEqual({
      espace: 'Organisation de test',
      ordinateur: 'MacBook-Pro',
      compte: account?.email,
      usages: [],
      refus: [],
    });
    expect(JSON.stringify(body)).not.toContain(token);
    expect(await rowsOf(token)).toMatchObject([
      {
        userId: paul.userId,
        tenantId: paul.tenantId,
        name: 'Ordinateur : MacBook-Pro',
        tokenHint: token.slice(-4),
        revokedAt: null,
      },
    ]);

    const me = await apiRequest(API_PATHS.me, { token });
    expect(me.status).toBe(200);
    expect(ViewerProfileSchema.parse(await me.json()).userId).toBe(paul.userId);
  });

  // Les cases de la page (T64, C16) : la 201 rend les cochées (`usages`) et les décochées (`refus`), recalculées depuis
  // la charge signée : un `g` hors de `m` n'est jamais rendu.
  it.each([
    ['cochée', { m: ['lecture'], g: ['lecture'] }, { usages: ['lecture'], refus: [] }],
    ['décochée', { m: ['lecture'], g: [] }, { usages: [], refus: ['lecture'] }],
    ['un g hors de m', { m: ['lecture'], g: ['resume'] }, { usages: [], refus: ['lecture'] }],
    [
      'plusieurs',
      { m: ['lecture', 'noter'], g: ['noter'] },
      { usages: ['noter'], refus: ['lecture'] },
    ],
  ] as const)('rend les cases de la page : %s', async (_cas, boxes, expected) => {
    const { paul } = await setup();
    const token = generateApiToken();
    const code = signComputerCode({
      e: hashApiToken(token),
      u: paul.userId,
      t: paul.tenantId,
      m: [...boxes.m],
      g: [...boxes.g],
    });

    const response = await exchange(token, code);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject(expected);
  });

  it('répond 409 au même code présenté une seconde fois : une seule ligne', async () => {
    const { paul } = await setup();
    const token = generateApiToken();
    const code = codeFor(token, paul);

    expect((await exchange(token, code)).status).toBe(201);
    const again = await exchange(token, code, 'Autre nom');

    expect(again.status).toBe(409);
    const rows = await rowsOf(token);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Ordinateur : MacBook-Pro');
  });

  it('deux échanges simultanés du même code : un seul 201, l’autre 409, une seule ligne', async () => {
    const { paul } = await setup();
    const token = generateApiToken();
    const code = codeFor(token, paul);

    const statuses = (await Promise.all([exchange(token, code), exchange(token, code)])).map(
      (response) => response.status,
    );

    expect(statuses.sort()).toEqual([201, 409]);
    expect(await rowsOf(token)).toHaveLength(1);
  });

  it('répond 409 à un jeton déjà en base pour un autre membre, qu’il ne reprend pas', async () => {
    const { paul, marie } = await setup();
    const { token } = await createApiToken(marie, 'déjà là');

    expect((await exchange(token, codeFor(token, paul))).status).toBe(409);
    expect(await rowsOf(token)).toMatchObject([{ userId: marie.userId, name: 'déjà là' }]);
  });

  it("répond 401 à un jeton dont l'empreinte diffère de celle du code : aucune ligne", async () => {
    const { paul } = await setup();
    const token = generateApiToken();
    const other = generateApiToken();

    const response = await exchange(token, codeFor(other, paul));

    await expectUnauthorized(response);
    expect(await rowsOf(token)).toEqual([]);
    expect(await rowsOf(other)).toEqual([]);
  });

  it('répond 401 à un code expiré, aucune ligne ; un code de moins de 2 minutes passe', async () => {
    const { paul } = await setup();
    const fresh = generateApiToken();
    const stale = generateApiToken();
    const now = Date.now();

    // Signé il y a 100 s : encore valable. Signé il y a 3 minutes : expiré.
    expect((await exchange(fresh, codeFor(fresh, paul, { now: now - 100_000 }))).status).toBe(201);
    await expectUnauthorized(await exchange(stale, codeFor(stale, paul, { now: now - 180_000 })));
    expect(await rowsOf(stale)).toEqual([]);
  });

  it.each([
    [
      'signée avec un autre secret',
      (code: string) => code,
      { secret: 'un-autre-secret-un-autre-secret-0002' },
    ],
    [
      'à la signature altérée',
      (code: string) => `${code.slice(0, -2)}${code.endsWith('AA') ? 'BB' : 'AA'}`,
      undefined,
    ],
    ['sans signature', (code: string) => code.split('.')[0] ?? '', undefined],
    ['qui n’en est pas un', () => 'n’importe quoi', undefined],
    ['vide', () => '', undefined],
  ])('répond 401 à un code %s, aucune ligne', async (_cas, tamper, options) => {
    const { paul } = await setup();
    const token = generateApiToken();

    await expectUnauthorized(await exchange(token, tamper(codeFor(token, paul, options))));
    expect(await rowsOf(token)).toEqual([]);
  });

  it('répond 401 si le membre a quitté l’espace entre l’autorisation et l’échange, aucune ligne', async () => {
    const { paul } = await setup();
    const token = generateApiToken();
    const code = codeFor(token, paul);
    await adminDb
      .delete(members)
      .where(and(eq(members.userId, paul.userId), eq(members.organizationId, paul.tenantId)));

    await expectUnauthorized(await exchange(token, code));
    expect(await rowsOf(token)).toEqual([]);
  });

  it('répond 401 si le compte a été supprimé entre l’autorisation et l’échange, aucune ligne', async () => {
    const { paul } = await setup();
    const token = generateApiToken();
    const code = codeFor(token, paul);
    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, paul.userId));

    await expectUnauthorized(await exchange(token, code));
    expect(await rowsOf(token)).toEqual([]);
  });

  it('répond 401 si le code désigne un espace dont l’utilisateur n’est pas membre, aucune ligne', async () => {
    const { paul } = await setup();
    const { tenantId: elsewhere } = await createTestTenant(['Léa']);
    const token = generateApiToken();

    const code = codeFor(token, { ...paul, tenantId: elsewhere });

    await expectUnauthorized(await exchange(token, code));
    expect(await rowsOf(token)).toEqual([]);
  });

  it.each([
    ['sans en-tête Authorization', undefined],
    ['avec un jeton mal formé', 'Bearer abc'],
    ['avec un autre schéma', `Basic ${generateApiToken()}`],
  ])('répond 401 %s, avant de lire le corps', async (_cas, authorization) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authorization) headers.Authorization = authorization;

    // Corps invalide : si le corps était lu d'abord, ce serait un 400.
    const response = await app.request(API_PATHS.ordinateurs, {
      method: 'POST',
      headers,
      body: '{nope',
    });

    await expectUnauthorized(response);
  });

  it.each([
    ['un champ inconnu', (code: string) => ({ code, nom: 'Mac', extra: 1 })],
    ['un code qui n’est pas une chaîne', () => ({ code: 42, nom: 'Mac' })],
    ['un nom qui n’est pas une chaîne', (code: string) => ({ code, nom: 42 })],
    ['un nom absent', (code: string) => ({ code })],
    ['un code absent', () => ({ nom: 'Mac' })],
    ['plus de 2 Ko', (code: string) => ({ code, nom: 'a'.repeat(2048) })],
    ['un tableau', () => []],
  ])('répond 400 à %s, aucune ligne', async (_cas, body) => {
    const { paul } = await setup();
    const token = generateApiToken();

    const response = await apiRequest(API_PATHS.ordinateurs, {
      token,
      body: body(codeFor(token, paul)),
    });

    expect(response.status).toBe(400);
    expect(await rowsOf(token)).toEqual([]);
  });

  it('répond 400 à un corps qui n’est pas du JSON, sans recopier ce qu’il contient', async () => {
    const token = generateApiToken();

    const response = await app.request(API_PATHS.ordinateurs, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{nope',
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain('nope');
  });

  it.each([
    ['des caractères de contrôle', 'Mac\u0000Book\n\t-Pro\u007f\u0085', 'MacBook-Pro'],
    ['des blancs autour', '  Mac de Marie  ', 'Mac de Marie'],
    ['rien', '', 'ordinateur'],
    ['que des blancs', ' \t ', 'ordinateur'],
    ['que des caractères de contrôle', '\u0007\u001b\u0000', 'ordinateur'],
    ['60 caractères', 'é'.repeat(60), 'é'.repeat(60)],
    ['plus de 60 caractères', 'é'.repeat(61), 'ordinateur'],
    ['des emoji comptés pour un caractère chacun', '💻'.repeat(60), '💻'.repeat(60)],
  ])('nettoie le nom : %s', async (_cas, nom, expected) => {
    const { paul } = await setup();
    const token = generateApiToken();

    const response = await exchange(token, codeFor(token, paul), nom);

    expect(response.status).toBe(201);
    expect((await response.json()).ordinateur).toBe(expected);
    expect((await rowsOf(token))[0]?.name).toBe(`Ordinateur : ${expected}`);
  });

  it('une erreur à l’enregistrement répond 500 sans rien journaliser du jeton, du nom ni du code', async () => {
    const { paul } = await setup();
    const token = generateApiToken();
    const code = codeFor(token, paul);
    // Une erreur d'insertion de drizzle porte dans son message les paramètres de la requête.
    vi.spyOn(db, 'insert').mockImplementation(() => {
      throw new Error(
        `Failed query: insert into api_tokens params: ${hashApiToken(token)},${token.slice(-4)},Ordinateur : Secret-de-Paul,${code}`,
      );
    });
    const logged = spyConsole();

    const response = await exchange(token, code, 'Secret-de-Paul');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal error' });
    const output = logged().join('\n');
    expect(output).toContain('computer.register'); // l'incident est journalisé…
    for (const secret of [
      hashApiToken(token),
      token.slice(5),
      'Secret-de-Paul',
      code.split('.')[1] ?? '',
    ]) {
      expect(output).not.toContain(secret); // …sans rien de ce qui identifie l'ordinateur
    }
  });
});

// Le réglage `noter` du compte (T65, C16), sur la ligne du membre du porteur.
const noterRefuseLe = async (who: TenantContext) =>
  (
    await adminDb
      .select({ at: members.noterRefuseLe })
      .from(members)
      .where(and(eq(members.userId, who.userId), eq(members.organizationId, who.tenantId)))
  )[0]?.at;
const dateNoter = (who: TenantContext) =>
  adminDb
    .update(members)
    .set({ noterRefuseLe: new Date('2026-11-01T10:00:00Z') })
    .where(and(eq(members.userId, who.userId), eq(members.organizationId, who.tenantId)));

describe('POST /api/v1/ordinateurs : le réglage noter du compte (T65, C16)', () => {
  const codeWith = (token: string, who: TenantContext, m: Usage[], g: Usage[]) =>
    signComputerCode({ e: hashApiToken(token), u: who.userId, t: who.tenantId, m, g });

  it('noter montré et coché : la colonne revient à nul', async () => {
    const { paul } = await setup();
    await dateNoter(paul);
    const token = generateApiToken();

    expect((await exchange(token, codeWith(token, paul, ['noter'], ['noter']))).status).toBe(201);

    expect(await noterRefuseLe(paul)).toBeNull();
  });

  it('noter montré et décoché : la colonne est datée, sur la seule ligne du porteur', async () => {
    const { paul, marie } = await setup();
    const token = generateApiToken();
    const before = Date.now();

    expect((await exchange(token, codeWith(token, paul, ['lecture', 'noter'], []))).status).toBe(
      201,
    );

    expect((await noterRefuseLe(paul))?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await noterRefuseLe(marie)).toBeNull();
  });

  it('noter non montré : la colonne ne change pas, datée ou nulle', async () => {
    const { paul, marie } = await setup();
    await dateNoter(paul);
    const first = generateApiToken();
    const second = generateApiToken();

    expect((await exchange(first, codeWith(first, paul, ['lecture'], []))).status).toBe(201);
    expect((await exchange(second, codeWith(second, marie, ['lecture'], ['lecture']))).status).toBe(
      201,
    );

    expect(await noterRefuseLe(paul)).toEqual(new Date('2026-11-01T10:00:00Z'));
    expect(await noterRefuseLe(marie)).toBeNull();
  });

  it('un 409 ou un 401 n’y touchent pas', async () => {
    const { paul, marie } = await setup();
    const { token: taken } = await createApiToken(marie, 'déjà là');
    const token = generateApiToken();
    const other = generateApiToken();

    expect((await exchange(taken, codeWith(taken, paul, ['noter'], []))).status).toBe(409);
    expect((await exchange(token, codeWith(other, paul, ['noter'], []))).status).toBe(401);

    expect(await noterRefuseLe(paul)).toBeNull();
  });

  // Choix assumé (computer-routes.ts) : la connexion est déjà faite, l'échec est journalisé et l'échange répond 201.
  it('une erreur à l’écriture du réglage ne défait pas la connexion : 201, l’erreur journalisée', async () => {
    const { paul } = await setup();
    const token = generateApiToken();
    vi.spyOn(db, 'update').mockImplementation(() => {
      throw new Error('panne de la base');
    });
    const logged = spyConsole();

    const response = await exchange(token, codeWith(token, paul, ['noter'], []));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ usages: [], refus: ['noter'] });
    expect(await rowsOf(token)).toHaveLength(1);
    expect(logged().join('\n')).toContain('computer.noter_failed');
    expect(await noterRefuseLe(paul)).toBeNull();
  });
});

describe('POST /api/v1/usages (T65, C16)', () => {
  const refuse = (token: string | undefined, body: unknown) =>
    apiRequest(API_PATHS.usages, { token, body });

  it('{ noter: false } rend 204 sans corps et date la colonne du porteur, seule', async () => {
    const { paul, marie } = await setup();
    const { token } = await createApiToken(paul, 'Ordinateur : Mac');

    const response = await refuse(token, { noter: false });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(await noterRefuseLe(paul)).toBeInstanceOf(Date);
    expect(await noterRefuseLe(marie)).toBeNull();
  });

  it('la colonne d’un autre espace du même compte ne bouge pas', async () => {
    const { paul } = await setup();
    const { tenantId: elsewhere } = await createTestTenant([]);
    await adminDb.insert(members).values({
      organizationId: elsewhere,
      userId: paul.userId,
      role: 'member',
      createdAt: new Date(),
    });
    const { token } = await createApiToken(paul, 'Ordinateur : Mac');

    expect((await refuse(token, { noter: false })).status).toBe(204);

    expect(await noterRefuseLe({ ...paul, tenantId: elsewhere })).toBeNull();
  });

  it.each([
    ['{ noter: true } : rouvrir passe par le navigateur', { noter: true }],
    ['un champ inconnu', { noter: false, lecture: false }],
    ['un corps vide', {}],
    ['une chaîne', { noter: 'false' }],
  ])('répond 400 à %s, sans toucher la colonne', async (_cas, body) => {
    const { paul } = await setup();
    const { token } = await createApiToken(paul, 'Ordinateur : Mac');

    const response = await refuse(token, body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request' });
    expect(await noterRefuseLe(paul)).toBeNull();
  });

  it('répond 413 au-delà de 1 Kio', async () => {
    const { paul } = await setup();
    const { token } = await createApiToken(paul, 'Ordinateur : Mac');

    const response = await refuse(token, { noter: false, x: 'a'.repeat(1024) });

    expect(response.status).toBe(413);
    expect(await noterRefuseLe(paul)).toBeNull();
  });

  it('répond 401 sans jeton, et avec un jeton d’assistant (F9), sans toucher la colonne', async () => {
    const { paul } = await setup();
    const grant = await createGrant(paul, {
      grantId: `grant-${generateApiToken()}`,
      clientRef: 'claude-ai',
      clientName: 'Claude',
      clientHost: 'claude.ai',
      name: 'Claude',
    });
    if (!grant) throw new Error('jeton d’assistant non créé');

    await expectUnauthorized(await refuse(undefined, { noter: false }));
    await expectUnauthorized(await refuse(grant.accessToken, { noter: false }));

    expect(await noterRefuseLe(paul)).toBeNull();
  });
});

describe('DELETE /api/v1/jeton', () => {
  it('répond 204 puis 401 avec le même jeton, et ne révoque que celui-là', async () => {
    const { paul, marie } = await setup();
    const { id, token } = await createApiToken(paul, 'celui-ci');
    const { token: sibling } = await createApiToken(paul, 'un autre ordinateur de Paul');
    const { token: marieToken } = await createApiToken(marie, 'Marie');

    const revoked = await apiRequest(API_PATHS.jeton, { token, method: 'DELETE' });

    expect(revoked.status).toBe(204);
    expect(await revoked.text()).toBe('');
    const [row] = await adminDb.select().from(apiTokens).where(eq(apiTokens.id, id));
    expect(row?.revokedAt).toBeInstanceOf(Date);
    await expectUnauthorized(await apiRequest(API_PATHS.jeton, { token, method: 'DELETE' }));
    await expectUnauthorized(await apiRequest(API_PATHS.me, { token }));
    // Ni l'autre jeton de Paul, ni celui d'un collègue de son espace n'ont été touchés.
    expect((await apiRequest(API_PATHS.me, { token: sibling })).status).toBe(200);
    expect((await apiRequest(API_PATHS.me, { token: marieToken })).status).toBe(200);
  });

  it('révoque le jeton qu’un ordinateur vient d’enregistrer (leon logout)', async () => {
    const { paul } = await setup();
    const token = generateApiToken();
    expect((await exchange(token, codeFor(token, paul))).status).toBe(201);

    expect((await apiRequest(API_PATHS.jeton, { token, method: 'DELETE' })).status).toBe(204);

    await expectUnauthorized(await apiRequest(API_PATHS.me, { token }));
  });
});

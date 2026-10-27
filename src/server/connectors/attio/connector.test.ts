import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { attioCatalog } from './catalog';
import { attioConnector } from './connector';
import members from './fixtures/members.json';
import notesPage1 from './fixtures/notes-page-1.json';
import notesPage2 from './fixtures/notes-page-2.json';
import recordCompany from './fixtures/record-company.json';
import recordNameless from './fixtures/record-nameless.json';
import recordPerson from './fixtures/record-person.json';
import self from './fixtures/self.json';
import selfInactive from './fixtures/self-inactive.json';
import threadsPage1 from './fixtures/threads-page-1.json';

const API = 'https://api.attio.com/v2';
const TOKEN = 'attio_jeton_de_test_0123456789';
const OAUTH_TOKEN = 'acces-oauth-de-test-0123456789';
// La forme que `runConnectorSync` passe au connecteur : la configuration lue par le schéma.
const config = { authMode: 'key' as const, token: TOKEN };
// Un jeton d'espace du bouton : il n'expire pas et n'a pas de jeton de rafraîchissement.
const oauthConfig = {
  authMode: 'oauth' as const,
  accessToken: OAUTH_TOKEN,
  refreshToken: null,
  expiresAt: null,
};
const SINCE = new Date('2026-09-15T00:00:00Z');
const WORKSPACE = '14beef7a-99f7-4534-a87e-70b564330a4c';
const PERSON = '891dcbfc-9141-415d-9b2a-2238a6cc012d';
const COMPANY = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
const DEAL = 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70';
const MARIE = '50cf242c-7fa3-4cad-87d0-75b1af71c57b';
const NOTE_A = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const NOTE_B = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const NOTE_C = 'c0c0c0c0-0000-4000-8000-000000000003';
const NOTE_TIE = 'f0f0f0f0-0000-4000-8000-000000000004';

const NOTES_PER_PAGE = 50;

const recordRoute = (id: string, json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: new RegExp(`/objects/[^/]+/records/${id}$`),
  json,
  ...extra,
});

// Une note ancienne (avant la date de départ), pour remplir une page de 50 comme le fait l'outil.
function oldNote(index: number) {
  return {
    id: {
      workspace_id: WORKSPACE,
      note_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    },
    parent_object: 'people',
    parent_record_id: PERSON,
    title: `Ancienne note ${index}`,
    meeting_id: null,
    content_plaintext: `Texte ${index}`,
    content_markdown: `Texte ${index}`,
    tags: [],
    created_by_actor: { type: 'api-token', id: null },
    created_at: '2026-07-01T10:00:00.000000000Z',
  };
}

// Complète une page jusqu'à 50 notes : l'outil ne rend une page suivante que si celle-ci est pleine.
function padded(rows: unknown[], firstFillerIndex = 0) {
  const fillers = Array.from({ length: NOTES_PER_PAGE - rows.length }, (_, i) =>
    oldNote(firstFillerIndex + i),
  );
  return { data: [...rows, ...fillers] };
}

// Un premier passage sur les deux pages de notes et les fils de la fixture.
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: `${API}/notes`, json: padded(notesPage1.data) },
    { url: `${API}/notes`, json: notesPage2 },
    { url: `${API}/threads`, json: threadsPage1 },
    { url: `${API}/workspace_members`, json: members },
    recordRoute(PERSON, recordPerson),
    recordRoute(COMPANY, recordCompany),
    recordRoute(DEAL, recordNameless),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: {
    cursor?: string | null;
    since?: Date;
    config?: Parameters<typeof attioConnector.sync>[0];
  } = {},
) {
  const cfg = overrides.config ?? config;
  const { http, calls } = testHttp(attioConnector, cfg, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(attioConnector.sync(cfg, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const itemOf = (pages: SyncPage[], externalId: string) =>
  itemsOf(pages).find((item) => item.externalId === externalId);
const lastCursor = (pages: SyncPage[]) => pages.at(-1)?.cursor ?? null;
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;
const pathOf = (url: string | undefined) => new URL(url ?? '').pathname;

describe('attio : configuration', () => {
  const schema = attioConnector.configSchema;

  it('accepte un jeton, sans les espaces autour', () => {
    expect(schema.parse({ token: `  ${TOKEN} ` })).toEqual({ authMode: 'key', token: TOKEN });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ token: '   ' }).success).toBe(false);
  });

  it('fixe l’hôte, le champ à chiffrer et un rythme sous 10 requêtes par seconde', () => {
    expect(attioConnector.hosts(config)).toEqual(['api.attio.com']);
    expect(attioConnector.secretFields).toEqual(['token']);
    expect(attioConnector.minIntervalMs).toBeGreaterThanOrEqual(100);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('attio')).toBe(attioConnector);
    const entry = listCatalog('fr').find((item) => item.id === 'attio');
    expect(entry?.available).toBe(true);
    expect(entry?.fields.map((field) => field.name)).toEqual(['token']);
  });
});

describe('attio : verify', () => {
  it('lit l’espace avec le jeton en Bearer, puis vérifie que les notes sont lisibles', async () => {
    const { http, calls } = testHttp(attioConnector, config, [
      { url: `${API}/self`, json: self },
      { url: `${API}/notes`, json: { data: [] } },
    ]);

    const result = await attioConnector.verify(config, http);

    expect(result).toEqual({
      account: 'Attio (workspace Acme)',
      accountKey: '14beef7a-99f7-4534-a87e-70b564330a4c:50cf242c-7fa3-4cad-87d0-75b1af71c57b',
    });
    expect(calls[0]?.url).toBe(`${API}/self`);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(pathOf(calls[1]?.url)).toBe('/v2/notes');
    expect(paramsOf(calls[1]?.url).limit).toBe('1');
  });

  it('refuse une réponse 401', async () => {
    const { http } = testHttp(attioConnector, config, [
      {
        url: `${API}/self`,
        status: 401,
        json: { status_code: 401, type: 'auth_error', code: 'unauthorized', message: 'x' },
      },
    ]);
    await expect(attioConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse un jeton inconnu ou révoqué (active: false)', async () => {
    const { http } = testHttp(attioConnector, config, [{ url: `${API}/self`, json: selfInactive }]);
    await expect(attioConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse un jeton qui ne peut pas lire les notes (403)', async () => {
    const { http } = testHttp(attioConnector, config, [
      { url: `${API}/self`, json: self },
      { url: `${API}/notes`, status: 403, json: { status_code: 403, code: 'forbidden' } },
    ]);
    await expect(attioConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('attio : sync, premier passage', () => {
  it('rend les notes puis les fils, les plus anciens d’abord, sans ce qui précède since', async () => {
    const { pages } = await runSync(firstPassRoutes());

    // La note vide, le fil sans texte et les éléments d’avant since ne sont pas rendus.
    expect(idsOf(pages)).toEqual([
      `note:${NOTE_A}`,
      `note:${NOTE_B}`,
      `note:${NOTE_TIE}`,
      `note:${NOTE_C}`,
      'thread:a9a9a9a9-0000-4000-8000-0000000000a1',
      'thread:a8a8a8a8-0000-4000-8000-0000000000a2',
    ]);
  });

  it('lit les notes par pages de 50, du début, sans filtre de date côté outil', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const noteCalls = calls.filter((call) => pathOf(call.url) === '/v2/notes');
    expect(noteCalls.map((call) => paramsOf(call.url))).toEqual([
      { limit: '50', offset: '0' },
      { limit: '50', offset: '50' },
    ]);
    expect(noteCalls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    const threadCalls = calls.filter((call) => pathOf(call.url) === '/v2/threads');
    expect(threadCalls.map((call) => paramsOf(call.url))).toEqual([{ limit: '50', offset: '0' }]);
  });

  it('range une note : tour document daté de la note, auteur et fiche parente', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, `note:${NOTE_A}`)).toEqual({
      externalId: `note:${NOTE_A}`,
      nature: 'note',
      title: 'Appel de découverte (Jean Dupont)',
      url: `https://app.attio.com/acme/person/${PERSON}`,
      updatedAt: '2026-10-01T09:15:00.000Z',
      origin: { object: 'people', record: 'Jean Dupont' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Jean cherche un outil de suivi des ventes.\nIl veut une démo la semaine du 12 octobre.',
          ts: '2026-10-01T09:15:00.000Z',
        },
      ],
    });
  });

  it('lit le nom d’une entreprise dans sa valeur, et rend sans nom une fiche qui n’en a pas', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, `note:${NOTE_B}`)?.title).toBe('Décision budget (Dupont SA)');
    expect(itemOf(pages, `note:${NOTE_B}`)?.turns[0]?.author).toEqual({
      name: 'Paul Martin',
      email: 'paul@acme.test',
    });
    const withoutName = itemOf(pages, `note:${NOTE_C}`);
    expect(withoutName?.title).toBe('Relance');
    expect(withoutName?.origin).toEqual({ object: 'deals' });
    expect(withoutName?.url).toBe(`https://app.attio.com/acme/deal/${DEAL}`);
    // Créée par le système : pas d’auteur à nommer.
    expect(withoutName?.turns[0]?.author).toEqual({ name: null, email: null });
  });

  it('range un fil : un tour par commentaire, daté de sa création, l’élément daté du dernier', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 'thread:a9a9a9a9-0000-4000-8000-0000000000a1')).toEqual({
      externalId: 'thread:a9a9a9a9-0000-4000-8000-0000000000a1',
      nature: 'fil',
      title: 'Fil de commentaires sur Jean Dupont',
      url: `https://app.attio.com/acme/person/${PERSON}`,
      updatedAt: '2026-10-03T11:20:30.500Z',
      origin: { record: 'Jean Dupont' },
      turns: [
        {
          externalId: 'comment:c1c1c1c1-0000-4000-8000-0000000000b1',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Je propose de lui envoyer la grille tarifaire avant la démo.',
          ts: '2026-10-03T10:00:00.000Z',
        },
        {
          externalId: 'comment:c2c2c2c2-0000-4000-8000-0000000000b2',
          role: 'participant',
          author: { name: 'Paul Martin', email: 'paul@acme.test' },
          text: "D'accord, mais pas de remise avant la validation de marie@acme.test.",
          ts: '2026-10-03T11:20:30.500Z',
        },
      ],
    });
  });

  it('ne demande qu’une fois les membres et chaque fiche', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const paths = calls.map((call) => pathOf(call.url));
    expect(paths.filter((path) => path === '/v2/workspace_members')).toHaveLength(1);
    for (const record of [PERSON, COMPANY, DEAL]) {
      expect(paths.filter((path) => path.endsWith(`/records/${record}`))).toHaveLength(1);
    }
  });

  it('ne rend que ce qui suit since', async () => {
    const { pages } = await runSync(firstPassRoutes(), { since: new Date('2026-10-11T00:00:00Z') });

    expect(idsOf(pages)).toEqual([`note:${NOTE_C}`, 'thread:a8a8a8a8-0000-4000-8000-0000000000a2']);
  });

  it('rend des éléments que la normalisation accepte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages).length).toBeGreaterThan(0);
    for (const item of itemsOf(pages)) {
      expect(normalizeItem(item, 'attio'), item.externalId).not.toBeNull();
    }
  });

  it('ne rend ni note ni fil sans texte, mais le curseur les dépasse', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const ids = idsOf(pages);
    expect(ids).not.toContain('note:e1e1e1e1-0000-4000-8000-000000000002');
    expect(ids).not.toContain('thread:a7a7a7a7-0000-4000-8000-0000000000a3');
    const cursor = JSON.parse(lastCursor(pages) ?? 'null');
    // Le fil sans texte (6 octobre) est plus ancien que le dernier fil rendu : le repère est celui du 11.
    expect(cursor.threads.at).toBe(Date.parse('2026-10-11T16:45:00Z'));
  });
});

describe('attio : sync, curseur et reprise', () => {
  it('ne refait rien avec le dernier curseur : ni élément, ni requête de membre ou de fiche', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync(
      [
        { url: `${API}/notes`, json: padded(notesPage1.data) },
        { url: `${API}/notes`, json: notesPage2 },
        { url: `${API}/threads`, json: threadsPage1 },
      ],
      { cursor: lastCursor(first.pages) },
    );

    expect(itemsOf(pages)).toEqual([]);
    expect(calls.map((call) => pathOf(call.url))).toEqual([
      '/v2/notes',
      '/v2/notes',
      '/v2/threads',
    ]);
  });

  it('reprend après le curseur d’une première page, et rend les notes de la même milliseconde', async () => {
    // Deux notes à la même milliseconde (…123456 et …123999) : seule la première est déjà lue.
    const cursor = JSON.stringify({
      notes: { at: Date.parse('2026-10-10T14:30:12.123Z'), seen: [NOTE_B] },
    });

    const { pages } = await runSync(firstPassRoutes(), { cursor });

    expect(idsOf(pages).filter((id) => id.startsWith('note:'))).toEqual([
      `note:${NOTE_TIE}`,
      `note:${NOTE_C}`,
    ]);
  });

  it('coupe en pages de 100 éléments au plus et reprend au bon endroit', async () => {
    const base = Date.UTC(2026, 9, 1);
    const note = (i: number) => ({
      ...oldNote(i),
      title: `Note ${i}`,
      content_plaintext: `Texte ${i}`,
      created_by_actor: { type: 'workspace-member', id: MARIE },
      created_at: new Date(base + i * 60_000).toISOString(),
    });
    const all = Array.from({ length: 130 }, (_, i) => note(i));
    const routes = (): FakeRoute[] => [
      { url: `${API}/notes`, json: { data: all.slice(0, 50) } },
      { url: `${API}/notes`, json: { data: all.slice(50, 100) } },
      { url: `${API}/notes`, json: { data: all.slice(100) } },
      { url: `${API}/threads`, json: { data: [] } },
      { url: `${API}/workspace_members`, json: members },
      recordRoute(PERSON, recordPerson),
    ];

    const first = await runSync(routes());
    expect(first.pages.map((page) => page.items.length)).toEqual([100, 30]);
    expect(new Set(idsOf(first.pages)).size).toBe(130);

    const resumed = await runSync(routes(), { cursor: first.pages[0]?.cursor });
    expect(resumed.pages.map((page) => page.items.length)).toEqual([30]);
    expect(idsOf(resumed.pages)).toEqual(idsOf(first.pages).slice(100));
  });

  it('ne boucle pas si l’outil ignore le décalage et redonne toujours la même page', async () => {
    const full = padded(notesPage1.data);

    const { calls } = await runSync([
      { url: `${API}/notes`, json: full },
      { url: `${API}/notes`, json: full },
      { url: `${API}/notes`, json: full },
      { url: `${API}/threads`, json: { data: [] } },
      { url: `${API}/workspace_members`, json: members },
      recordRoute(PERSON, recordPerson),
      recordRoute(COMPANY, recordCompany),
    ]);

    expect(calls.filter((call) => pathOf(call.url) === '/v2/notes')).toHaveLength(2);
  });

  it('rend de nouveau un fil entier quand un commentaire s’y ajoute', async () => {
    const first = await runSync(firstPassRoutes());
    const [thread, ...others] = threadsPage1.data;
    const lateComment = {
      ...thread?.comments[1],
      id: { workspace_id: WORKSPACE, comment_id: 'c6c6c6c6-0000-4000-8000-0000000000b6' },
      content_plaintext: 'Démo confirmée pour jeudi.',
      created_at: '2026-10-14T09:00:00.000000000Z',
    };
    const grown = {
      data: [{ ...thread, comments: [...(thread?.comments ?? []), lateComment] }, ...others],
    };

    const { pages } = await runSync(
      [
        { url: `${API}/notes`, json: padded(notesPage1.data) },
        { url: `${API}/notes`, json: notesPage2 },
        { url: `${API}/threads`, json: grown },
        { url: `${API}/workspace_members`, json: members },
        recordRoute(PERSON, recordPerson),
      ],
      { cursor: lastCursor(first.pages) },
    );

    expect(idsOf(pages)).toEqual(['thread:a9a9a9a9-0000-4000-8000-0000000000a1']);
    expect(itemsOf(pages)[0]?.turns).toHaveLength(3);
    expect(itemsOf(pages)[0]?.updatedAt).toBe('2026-10-14T09:00:00.000Z');
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { pages } = await runSync(firstPassRoutes(), { cursor: 'pas du json' });

    expect(idsOf(pages)).toHaveLength(6);
  });
});

describe('attio : sync, ressources secondaires et erreurs', () => {
  const denied = { status: 403, json: { status_code: 403, code: 'forbidden', message: 'x' } };
  const missing = { status: 404, json: { status_code: 404, code: 'not_found', message: 'x' } };

  it('rend les éléments sans nom d’auteur quand la liste des membres est refusée (403)', async () => {
    const routes = firstPassRoutes().map((route) =>
      route.url === `${API}/workspace_members` ? { ...route, ...denied } : route,
    );

    const { pages, calls } = await runSync(routes);

    expect(idsOf(pages)).toHaveLength(6);
    expect(itemOf(pages, `note:${NOTE_A}`)?.turns[0]?.author).toEqual({ name: null, email: null });
    // Un refus n’est pas redemandé pour chaque élément.
    expect(calls.filter((call) => pathOf(call.url) === '/v2/workspace_members')).toHaveLength(1);
  });

  it('rend les éléments sans nom de fiche ni lien quand les fiches sont refusées (403), sans les redemander', async () => {
    const routes = firstPassRoutes().map((route) =>
      route.url instanceof RegExp ? { ...route, ...denied } : route,
    );

    const { pages, calls } = await runSync(routes);

    expect(idsOf(pages)).toHaveLength(6);
    const note = itemOf(pages, `note:${NOTE_A}`);
    expect(note?.title).toBe('Appel de découverte');
    expect(note?.url).toBeNull();
    expect(note?.origin).toEqual({ object: 'people' });
    expect(calls.filter((call) => pathOf(call.url).includes('/records/'))).toHaveLength(1);
  });

  it('rend les éléments sans nom de fiche quand une fiche est absente (404), les autres restent lues', async () => {
    const routes = firstPassRoutes().map((route) =>
      route.url instanceof RegExp && route.url.source.includes(PERSON)
        ? { ...route, ...missing }
        : route,
    );

    const { pages } = await runSync(routes);

    expect(itemOf(pages, `note:${NOTE_A}`)?.title).toBe('Appel de découverte');
    expect(itemOf(pages, `note:${NOTE_B}`)?.title).toBe('Décision budget (Dupont SA)');
  });

  it('rend les notes seules quand les commentaires sont refusés (403) ou que la liste est refusée (400, 404)', async () => {
    for (const reply of [
      denied,
      missing,
      { status: 400, json: { status_code: 400, code: 'validation_type', message: 'x' } },
    ]) {
      const routes = firstPassRoutes().map((route) =>
        route.url === `${API}/threads` ? { ...route, ...reply } : route,
      );

      const { pages } = await runSync(routes);

      expect(idsOf(pages)).toEqual([
        `note:${NOTE_A}`,
        `note:${NOTE_B}`,
        `note:${NOTE_TIE}`,
        `note:${NOTE_C}`,
      ]);
    }
  });

  it('remonte un 401 sur la liste des notes', async () => {
    const { http } = testHttp(attioConnector, config, [
      { url: `${API}/notes`, ...denied, status: 401 },
    ]);

    await expect(
      collect(attioConnector.sync(config, { cursor: null, since: SINCE }, http)),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un 403 sur la liste des notes : la clé n’a pas le droit de les lire', async () => {
    const { http } = testHttp(attioConnector, config, [{ url: `${API}/notes`, ...denied }]);

    await expect(
      collect(attioConnector.sync(config, { cursor: null, since: SINCE }, http)),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un 401 au milieu de la deuxième page de notes', async () => {
    const { http } = testHttp(attioConnector, config, [
      { url: `${API}/notes`, json: padded(notesPage1.data) },
      { url: `${API}/notes`, status: 401, json: { status_code: 401, code: 'unauthorized' } },
    ]);

    await expect(
      collect(attioConnector.sync(config, { cursor: null, since: SINCE }, http)),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('attio : connexion par le bouton', () => {
  const schema = attioConnector.configSchema;
  const issuePaths = (input: unknown) => [
    ...new Set((schema.safeParse(input).error?.issues ?? []).map((issue) => issue.path.join('.'))),
  ];

  it('accepte la forme du bouton et l’ancienne forme à clé, sans authMode', () => {
    expect(schema.parse(oauthConfig)).toEqual(oauthConfig);
    expect(schema.parse({ authMode: 'oauth', accessToken: ` ${OAUTH_TOKEN} ` })).toEqual({
      authMode: 'oauth',
      accessToken: OAUTH_TOKEN,
    });
    expect(schema.parse({ token: TOKEN }).authMode).toBe('key');
  });

  it('refuse une forme incomplète, en nommant le champ qui manque', () => {
    expect(issuePaths({ authMode: 'oauth' })).toEqual(['accessToken']);
    expect(issuePaths({ authMode: 'oauth', accessToken: '   ' })).toEqual(['accessToken']);
    expect(issuePaths({ authMode: 'oauth', token: TOKEN })).toEqual(['accessToken']);
    expect(issuePaths({ authMode: 'key', accessToken: OAUTH_TOKEN })).toEqual(['token']);
    expect(issuePaths({ authMode: 'autre', token: TOKEN })).toEqual(['authMode']);
  });

  it('reste un z.object (le catalogue lit ses champs) et ne chiffre que le champ de clé', () => {
    expect(Object.keys((schema as unknown as { shape: object }).shape).sort()).toEqual([
      'accessToken',
      'authMode',
      'expiresAt',
      'refreshToken',
      'token',
    ]);
    // Le socle ajoute lui-même accessToken et refreshToken au scellement.
    expect(attioConnector.secretFields).toEqual(['token']);
    expect(attioConnector.hosts(oauthConfig)).toEqual(['api.attio.com']);
  });

  it('verify lit l’espace avec le jeton d’accès, pas avec la clé', async () => {
    const { http, calls } = testHttp(attioConnector, oauthConfig, [
      { url: `${API}/self`, json: self },
      { url: `${API}/notes`, json: { data: [] } },
    ]);

    const result = await attioConnector.verify(oauthConfig, http);

    expect(result).toEqual({
      account: 'Attio (workspace Acme)',
      accountKey: '14beef7a-99f7-4534-a87e-70b564330a4c:50cf242c-7fa3-4cad-87d0-75b1af71c57b',
    });
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${OAUTH_TOKEN}`);
  });

  it('verify refuse un jeton d’accès révoqué (active: false)', async () => {
    const { http } = testHttp(attioConnector, oauthConfig, [
      { url: `${API}/self`, json: selfInactive },
    ]);

    await expect(attioConnector.verify(oauthConfig, http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('sync envoie le jeton d’accès sur chaque requête et rend les mêmes éléments qu’avec une clé', async () => {
    const withToken = await runSync(firstPassRoutes(), { config: oauthConfig });
    const withKey = await runSync(firstPassRoutes());

    expect(withToken.calls.length).toBeGreaterThan(5);
    for (const call of withToken.calls) {
      expect(call.headers.authorization).toBe(`Bearer ${OAUTH_TOKEN}`);
    }
    expect(idsOf(withToken.pages)).toEqual(idsOf(withKey.pages));
  });

  it('remonte un 401 du jeton d’accès comme une clé refusée : le socle propose alors de reconnecter', async () => {
    const { http } = testHttp(attioConnector, oauthConfig, [
      { url: `${API}/notes`, status: 401, json: { status_code: 401, code: 'unauthorized' } },
    ]);

    await expect(
      collect(attioConnector.sync(oauthConfig, { cursor: null, since: SINCE }, http)),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('dit dans son catalogue ce que l’utilisateur verra chez Attio, garde la clé en secours et signale la limite de 25 espaces', () => {
    expect(attioCatalog.oauthHelp).toMatch(/Attio/);
    expect(attioCatalog.oauthHelp).toMatch(/administrateur/);
    expect(attioCatalog.keyAccepted).not.toBe(false);
    expect(attioCatalog.warning).toMatch(/25 espaces/);
  });
});

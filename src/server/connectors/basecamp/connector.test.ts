import { describe, expect, it, vi } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { basecampCatalog } from './catalog';
import { USER_AGENT } from './client';
import { basecampConnector } from './connector';
import commentsPage1 from './fixtures/comments-5001-page1.json';
import commentsPage2 from './fixtures/comments-5001-page2.json';
import comments5003 from './fixtures/comments-5003.json';
import document6001 from './fixtures/document-6001.json';
import message5001 from './fixtures/message-5001.json';
import message5002 from './fixtures/message-5002.json';
import message5003 from './fixtures/message-5003.json';
import profile from './fixtures/profile.json';
import recordingsDocuments from './fixtures/recordings-documents.json';
import recordingsMessagesPage1 from './fixtures/recordings-messages-page1.json';
import recordingsMessagesPage2 from './fixtures/recordings-messages-page2.json';

// Le socle OAuth enregistre les jetons en base : ces tests n'en ont pas besoin.
vi.mock('../connections', () => ({ saveOAuthTokens: vi.fn(async () => true) }));

const BASE = 'https://3.basecampapi.com/99999999';
const TOKEN = 'jeton-de-test-0123456789';
const config = {
  authMode: 'oauth' as const,
  accessToken: TOKEN,
  refreshToken: 'rafraichissement-de-test',
  expiresAt: '2026-10-29T12:00:00.000Z',
  accountId: '99999999',
  accountName: 'Acme SAS',
};
const SINCE = new Date('2026-09-15T00:00:00Z');

const LIST = `${BASE}/projects/recordings.json`;
const MESSAGES_PAGE2 = `${LIST}?type=Message&status=active&sort=updated_at&direction=desc&page=2`;
const COMMENTS_5001_PAGE2 = `${BASE}/recordings/5001/comments.json?page=2`;

const link = (url: string) => ({ link: `<${url}>; rel="next"` });

// La première page de chaque liste (sans `page=`), reconnue par son type.
const firstListOf = (type: 'Message' | 'Document') =>
  new RegExp(`^${LIST.replaceAll('.', '\\.')}\\?(?!.*page=).*type=${type}`);

const messagesFirst = (extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: firstListOf('Message'),
  json: recordingsMessagesPage1,
  headers: link(MESSAGES_PAGE2),
  ...extra,
});
const documentsFirst = (): FakeRoute => ({
  url: firstListOf('Document'),
  json: recordingsDocuments,
});

// Toutes les routes d'un premier passage : deux pages de messages (dont un trop ancien), les
// commentaires du premier sur deux pages, puis les documents.
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: MESSAGES_PAGE2, json: recordingsMessagesPage2 },
    { url: COMMENTS_5001_PAGE2, json: commentsPage2 },
    messagesFirst(),
    { url: `${BASE}/messages/5001.json`, json: message5001 },
    {
      url: `${BASE}/recordings/5001/comments.json`,
      json: commentsPage1,
      headers: link(COMMENTS_5001_PAGE2),
    },
    { url: `${BASE}/messages/5002.json`, json: message5002 },
    { url: `${BASE}/messages/5003.json`, json: message5003 },
    { url: `${BASE}/recordings/5003/comments.json`, json: comments5003 },
    documentsFirst(),
    { url: `${BASE}/documents/6001.json`, json: document6001 },
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(basecampConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(basecampConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramOf = (url: string | undefined, name: string) =>
  new URL(url ?? '').searchParams.get(name);
const itemNamed = (pages: SyncPage[], id: string) =>
  itemsOf(pages).find((item) => item.externalId === id);

describe('basecamp : configuration', () => {
  const schema = basecampConnector.configSchema;

  it('accepte la forme du bouton : jetons, numéro et nom du compte', () => {
    const parsed = schema.parse(config);

    expect(parsed).toMatchObject({
      authMode: 'oauth',
      accessToken: TOKEN,
      accountId: '99999999',
      accountName: 'Acme SAS',
    });
  });

  it('accepte une connexion sans date d’expiration ni jeton de rafraîchissement', () => {
    const { refreshToken: _r, expiresAt: _e, ...bare } = config;

    expect(schema.safeParse(bare).success).toBe(true);
    expect(schema.safeParse({ ...config, refreshToken: null, expiresAt: null }).success).toBe(true);
  });

  it('refuse une configuration incomplète', () => {
    const { accessToken: _a, ...noToken } = config;
    const { accountId: _i, ...noAccount } = config;

    expect(schema.safeParse(noToken).success).toBe(false);
    expect(schema.safeParse({ ...config, accessToken: '' }).success).toBe(false);
    expect(schema.safeParse(noAccount).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('ne se branche pas par clé collée', () => {
    expect(schema.safeParse({ ...config, authMode: 'key' }).success).toBe(false);
    const { authMode: _m, ...noMode } = config;
    expect(schema.safeParse(noMode).success).toBe(false);
  });

  it.each(['', '12a', '99999999/../1', '99999999.evil.com', '-1', ' '])(
    'refuse un numéro de compte qui changerait l’adresse appelée : « %s »',
    (accountId) => {
      expect(schema.safeParse({ ...config, accountId }).success).toBe(false);
    },
  );

  it('déclare un seul hôte exact et un écart entre requêtes sous la limite de 50 par 10 secondes', () => {
    expect(basecampConnector.hosts(schema.parse(config))).toEqual(['3.basecampapi.com']);
    expect(basecampConnector.minIntervalMs).toBeGreaterThanOrEqual(200);
    expect(basecampConnector.secretFields).toEqual([]);
  });

  it('est dans le registre, avec un catalogue sans clé et un bouton', () => {
    expect(getConnector('basecamp')).toBe(basecampConnector);
    expect(basecampConnector.oauth?.appKey).toBe('BASECAMP');
    expect(basecampCatalog.keyAccepted).toBe(false);
    expect(basecampCatalog.fields).toEqual([]);
    expect(basecampCatalog.oauthHelp?.trim()).toBeTruthy();
    expect(listCatalog().find((item) => item.id === 'basecamp')).toMatchObject({
      available: true,
      keyAccepted: false,
      oauthPreFields: [],
    });
  });
});

describe('basecamp : verify', () => {
  it('lit le profil du compte avec le jeton et le User-Agent, et rend le compte et la personne', async () => {
    const { http, calls } = testHttp(basecampConnector, config, [
      { url: `${BASE}/my/profile.json`, json: profile },
    ]);

    await expect(basecampConnector.verify(config, http)).resolves.toEqual({
      account: 'Acme SAS (Marie Durand)',
      accountKey: '99999999:1049715913',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers['user-agent']).toBe(USER_AGENT);
  });

  it('lève ConnectorAuthError quand Basecamp refuse le jeton', async () => {
    const { http } = testHttp(basecampConnector, config, [
      { url: `${BASE}/my/profile.json`, status: 401, json: { error: 'non' } },
    ]);

    await expect(basecampConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('basecamp : premier passage', () => {
  it('demande les messages puis les documents modifiés, du plus récent au plus ancien, sur les projets actifs', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const lists = calls.filter((call) => call.url.includes('/projects/recordings.json'));
    expect(lists.map((call) => paramOf(call.url, 'type'))).toEqual([
      'Message',
      'Message',
      'Document',
    ]);
    for (const call of lists) {
      expect(paramOf(call.url, 'sort')).toBe('updated_at');
      expect(paramOf(call.url, 'direction')).toBe('desc');
      expect(paramOf(call.url, 'status')).toBe('active');
    }
    // La page suivante est celle de l'en-tête Link, jamais une adresse fabriquée.
    expect(lists[1]?.url).toBe(MESSAGES_PAGE2);
  });

  it('s’arrête à la première date déjà vue, même quand Basecamp annonce une page suivante', async () => {
    const page3 = `${LIST}?type=Message&status=active&sort=updated_at&direction=desc&page=3`;
    const routes = firstPassRoutes().map((route) =>
      route.url === MESSAGES_PAGE2 ? { ...route, headers: link(page3) } : route,
    );

    const { calls } = await runSync(routes);

    // La page 2 finit par un message plus ancien que `since` : tout ce qui suit l'est aussi.
    expect(calls.map((call) => call.url)).not.toContain(page3);
  });

  it('envoie le jeton OAuth en Bearer et le User-Agent sur chaque requête', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.length).toBeGreaterThan(5);
    for (const call of calls) {
      expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(call.headers['user-agent']).toBe(USER_AGENT);
    }
  });

  it('rend les messages et le document, sans le message plus ancien que `since`', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(idsOf(pages).sort()).toEqual([
      'document:6001',
      'message:5001',
      'message:5002',
      'message:5003',
    ]);
    expect(pages).toHaveLength(3); // deux pages de messages, une de documents
  });

  it('range une page dans l’ordre de modification croissant', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[0]?.items.map((item) => item.externalId)).toEqual([
      'message:5002',
      'message:5001',
    ]);
  });

  it('fait d’un message un fil : le corps en document, chaque commentaire daté de lui-même', async () => {
    const { pages } = await runSync(firstPassRoutes());
    const item = itemNamed(pages, 'message:5001');

    expect(item).toMatchObject({
      nature: 'fil',
      title: 'Lancement du site : calendrier',
      url: 'https://3.basecamp.com/99999999/buckets/2085958505/messages/5001',
      updatedAt: '2026-10-14T09:30:00.000Z',
      origin: { account: 'Acme SAS', project: 'Refonte du site' },
    });
    expect(item?.turns.map((turn) => [turn.externalId, turn.role, turn.ts])).toEqual([
      ['body', 'document', '2026-10-14T09:30:00.000Z'],
      ['comment:7001', 'participant', '2026-10-03T07:30:00.000Z'],
      ['comment:7002', 'participant', '2026-10-14T09:30:00.000Z'],
    ]);
    expect(item?.turns[0]?.author).toEqual({ name: 'Marie Durand', email: 'marie@acme.test' });
  });

  it('lit le texte du HTML de Basecamp, pièces jointes comprises, sans balise ni identifiant', async () => {
    const { pages } = await runSync(firstPassRoutes());
    const text = itemNamed(pages, 'message:5001')?.turns[0]?.text ?? '';

    expect(text).toContain('Le site ouvre le 3 novembre');
    expect(text).toContain('- Maquettes validées');
    expect(text).toContain('- Recette le 28 octobre');
    expect(text).not.toMatch(/[<>]/);
    expect(text).not.toContain('BAhbB0kiAbB7');
    expect(itemNamed(pages, 'message:5001')?.turns[2]?.text).toBe(
      "Merci, c'est noté.\nOn confirme le 3 novembre.",
    );
  });

  it('suit les pages de commentaires par l’en-tête Link', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const urls = calls.map((call) => call.url);
    expect(urls).toContain(`${BASE}/recordings/5001/comments.json`);
    expect(urls).toContain(COMMENTS_5001_PAGE2);
  });

  it('ne demande pas les commentaires d’un message qui n’en a pas', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.map((call) => call.url)).not.toContain(`${BASE}/recordings/5002/comments.json`);
  });

  it('marque externe l’auteur que Basecamp déclare client, et équipe les autres', async () => {
    const { pages } = await runSync(firstPassRoutes());
    const thread = itemNamed(pages, 'message:5001');

    expect(thread?.turns.map((turn) => turn.side)).toEqual(['team', 'external', 'team']);
    expect(itemNamed(pages, 'message:5002')?.turns[0]?.side).toBe('external');
  });

  it('fait d’un document une page, avec son texte', async () => {
    const { pages } = await runSync(firstPassRoutes());
    const item = itemNamed(pages, 'document:6001');

    expect(item).toMatchObject({
      nature: 'page',
      title: 'Cahier des charges',
      updatedAt: '2026-10-13T15:45:00.000Z',
      origin: { account: 'Acme SAS', project: 'Refonte du site' },
    });
    expect(item?.turns).toHaveLength(1);
    expect(item?.turns[0]).toMatchObject({ externalId: 'body', role: 'document' });
    expect(item?.turns[0]?.text).toContain('Le site présente les offres & les références.');
    expect(item?.turns[0]?.text).toContain('Aucune boutique en ligne.');
  });

  it('chaque élément rendu passe la normalisation du socle', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(4);
    for (const item of itemsOf(pages)) expect(normalizeItem(item, 'basecamp')).not.toBeNull();
  });
});

describe('basecamp : curseur', () => {
  it('garde la position et le plus récent vu pendant le parcours, puis avance `from` à la fin', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({
      message: { from: SINCE.toISOString(), top: '2026-10-14T09:30:00.000Z', next: MESSAGES_PAGE2 },
      document: { from: SINCE.toISOString(), top: null, next: null },
    });
    expect(cursorOf(pages[1]).message).toEqual({
      from: '2026-10-14T09:30:00.000Z',
      top: null,
      next: null,
    });
    expect(cursorOf(pages[2])).toEqual({
      message: { from: '2026-10-14T09:30:00.000Z', top: null, next: null },
      document: { from: '2026-10-13T15:45:00.000Z', top: null, next: null },
    });
  });

  it('reprend à la page suivante quand le parcours a été coupé', async () => {
    const first = await runSync(firstPassRoutes());
    const cursor = first.pages[0]?.cursor ?? null;

    const { pages, calls } = await runSync(
      [
        { url: MESSAGES_PAGE2, json: recordingsMessagesPage2 },
        { url: `${BASE}/messages/5003.json`, json: message5003 },
        { url: `${BASE}/recordings/5003/comments.json`, json: comments5003 },
        documentsFirst(),
        { url: `${BASE}/documents/6001.json`, json: document6001 },
      ],
      { cursor },
    );

    expect(calls[0]?.url).toBe(MESSAGES_PAGE2);
    expect(idsOf(pages)).toEqual(['message:5003', 'document:6001']);
  });

  it('ne refait rien quand rien n’a changé depuis la fin du dernier passage', async () => {
    const first = await runSync(firstPassRoutes());
    const cursor = first.pages.at(-1)?.cursor ?? null;

    const { pages, calls } = await runSync(
      [messagesFirst({ headers: undefined }), documentsFirst()],
      {
        cursor,
      },
    );

    // Une page de chaque liste, et plus rien : les éléments déjà vus ne sont ni relus ni redemandés.
    expect(pages).toEqual([]);
    expect(calls.map((call) => paramOf(call.url, 'type'))).toEqual(['Message', 'Document']);
  });

  it('ne lit que ce qui a changé depuis le dernier passage', async () => {
    const first = await runSync(firstPassRoutes());
    const cursor = first.pages.at(-1)?.cursor ?? null;
    const edited = { ...recordingsMessagesPage1[1], updated_at: '2026-10-15T07:00:00.000Z' };

    const { pages, calls } = await runSync(
      [
        messagesFirst({
          json: [edited, ...recordingsMessagesPage1.slice(0, 1)],
          headers: undefined,
        }),
        { url: `${BASE}/messages/5002.json`, json: message5002 },
        documentsFirst(),
      ],
      { cursor },
    );

    expect(idsOf(pages)).toEqual(['message:5002']);
    expect(calls.map((call) => call.url)).not.toContain(`${BASE}/messages/5001.json`);
    expect(cursorOf(pages[0]).message.from).toBe('2026-10-15T07:00:00.000Z');
  });

  it('ne recule jamais `from` quand la première page n’a rien de plus récent', async () => {
    const cursor = JSON.stringify({
      message: { from: '2026-10-20T00:00:00.000Z', top: null, next: null },
      document: { from: '2026-10-20T00:00:00.000Z', top: null, next: null },
    });

    const { pages } = await runSync([messagesFirst({ headers: undefined }), documentsFirst()], {
      cursor,
    });

    expect(pages).toEqual([]);
  });

  it('repart de `since` quand le curseur est illisible', async () => {
    const { pages } = await runSync(firstPassRoutes(), { cursor: 'pas du json' });

    expect(idsOf(pages)).toHaveLength(4);
  });

  it('abandonne la page suivante d’un curseur venu d’un autre compte', async () => {
    const foreign = `https://3.basecampapi.com/11111111/projects/recordings.json?type=Message&page=3`;
    const cursor = JSON.stringify({
      message: { from: SINCE.toISOString(), top: '2026-10-14T09:30:00.000Z', next: foreign },
      document: { from: SINCE.toISOString(), top: null, next: null },
    });

    const { calls } = await runSync(firstPassRoutes(), { cursor });

    expect(calls.map((call) => call.url)).not.toContain(foreign);
    expect(calls[0]?.url).toMatch(/^https:\/\/3\.basecampapi\.com\/99999999\/projects\/recordings/);
    expect(paramOf(calls[0]?.url, 'page')).toBeNull();
  });
});

describe('basecamp : ressources secondaires', () => {
  it('rend le message sans commentaires quand Basecamp refuse de les donner (403)', async () => {
    const routes = firstPassRoutes().filter((route) => route.url !== COMMENTS_5001_PAGE2);
    const withoutComments = routes.map((route) =>
      route.url === `${BASE}/recordings/5001/comments.json`
        ? { ...route, status: 403, json: { error: 'non' }, headers: undefined }
        : route,
    );

    const { pages } = await runSync(withoutComments);

    expect(itemNamed(pages, 'message:5001')?.turns.map((turn) => turn.externalId)).toEqual([
      'body',
    ]);
    expect(idsOf(pages)).toHaveLength(4);
  });

  it('écarte un élément devenu introuvable entre la liste et sa lecture (404), et avance le curseur', async () => {
    const routes = firstPassRoutes().map((route) =>
      route.url === `${BASE}/messages/5002.json`
        ? { ...route, status: 404, json: { error: 'absent' } }
        : route,
    );

    const { pages } = await runSync(routes);

    expect(idsOf(pages)).not.toContain('message:5002');
    expect(idsOf(pages)).toContain('message:5001');
    expect(cursorOf(pages[0]).message.top).toBe('2026-10-14T09:30:00.000Z');
  });

  it('laisse remonter une clé refusée (401) sur la liste', async () => {
    await expect(
      runSync([messagesFirst({ status: 401, json: { error: 'non' }, headers: undefined })]),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('laisse remonter une clé refusée (401) sur la lecture d’un élément', async () => {
    const routes = firstPassRoutes().map((route) =>
      route.url === `${BASE}/messages/5001.json`
        ? { ...route, status: 401, json: { error: 'non' } }
        : route,
    );

    await expect(runSync(routes)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('ne rend pas un message sans texte ni commentaire, mais avance le curseur', async () => {
    const empty = { ...message5002, content: '<div> </div>' };
    const routes = firstPassRoutes().map((route) =>
      route.url === `${BASE}/messages/5002.json` ? { ...route, json: empty } : route,
    );

    const { pages } = await runSync(routes);

    expect(idsOf(pages)).not.toContain('message:5002');
    expect(pages).toHaveLength(3);
  });

  it('rend un message sans contenu (champ absent) avec ses commentaires', async () => {
    const { content: _content, ...bare } = message5003;
    const routes = firstPassRoutes().map((route) =>
      route.url === `${BASE}/messages/5003.json` ? { ...route, json: bare } : route,
    );

    const { pages } = await runSync(routes);

    expect(itemNamed(pages, 'message:5003')?.turns.map((turn) => turn.externalId)).toEqual([
      'comment:7003',
    ]);
  });
});

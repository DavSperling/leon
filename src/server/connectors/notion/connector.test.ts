import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { collect, type FakeCall, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError } from '../http';
import { normalizeItem } from '../normalize';
import type { ConnectorItem, SyncState } from '../types';
import { notionConnector } from './connector';
import blocksDb from './fixtures/blocks-db.json';
import blocksRoad from './fixtures/blocks-road.json';
import blocksRoadBullet from './fixtures/blocks-road-bullet.json';
import blocksRoadDetail from './fixtures/blocks-road-detail.json';
import blocksRoadRisks from './fixtures/blocks-road-risks.json';
import blocksRoadTable from './fixtures/blocks-road-table.json';
import commentsDb from './fixtures/comments-db.json';
import commentsEmpty from './fixtures/comments-empty.json';
import me from './fixtures/me.json';
import mePerson from './fixtures/me-person.json';
import search1 from './fixtures/search-1.json';
import search2 from './fixtures/search-2.json';
import userMarie from './fixtures/user-marie.json';
import userPaul from './fixtures/user-paul.json';

// Un jeton fabriqué à chaque lancement : aucun secret dans le dépôt.
const TOKEN = `ntn_${randomBytes(16).toString('hex')}`;
const CONFIG = { authMode: 'key' as const, token: TOKEN };
const SINCE = new Date('2026-09-15T00:00:00Z');
const API = 'https://api.notion.com/v1';

const ID = {
  road: 'a7c41e92-0d3b-4f68-8b2a-91e5d7c30b02',
  db: '5d3f2a10-7b1e-4c55-9a0d-3c1f8e2b6a01',
  empty: 'c2e90b44-6a17-4d3e-b5f0-27d8a1e94c03',
  old: 'e1b75d38-92c4-4a0f-8d6e-5f3a0c71b804',
  marie: '3f8e2c71-5a04-4b9d-8c16-72d0a9e45b11',
  paul: '9b0d6e24-1c73-4f58-a2e9-480c5d17f622',
};

const search = (json: unknown): FakeRoute => ({ method: 'POST', url: `${API}/search`, json });
const children = (id: string, json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${API}/blocks/${id}/children`,
  json,
  ...extra,
});
const comments = (id: string, json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: new RegExp(`/v1/comments\\?block_id=${id}(&|$)`),
  json,
  ...extra,
});
const user = (id: string, json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${API}/users/${id}`,
  json,
  ...extra,
});
const refused = (status: number, code: string): Partial<FakeRoute> => ({
  status,
  json: { object: 'error', status, code, message: 'Message de l’outil, jamais repris.' },
});

// Les trois pages de la fixture, avec tout ce qu'il faut pour les lire (la page ancienne n'est jamais lue).
function wholeWorkspace(): FakeRoute[] {
  return [
    search(search1),
    search(search2),
    children(ID.road, blocksRoad),
    children('1a2b3c4d-0003-4000-8000-000000000003', blocksRoadBullet),
    children('1a2b3c4d-0008-4000-8000-000000000008', blocksRoadTable),
    children('1a2b3c4d-0009-4000-8000-000000000009', blocksRoadRisks),
    children('1a2b3c4d-0021-4000-8000-000000000021', blocksRoadDetail),
    comments(ID.road, commentsEmpty),
    children(ID.db, blocksDb),
    comments(ID.db, commentsDb),
    children(ID.empty, { object: 'list', results: [], next_cursor: null, has_more: false }),
    comments(ID.empty, commentsEmpty),
    user(ID.marie, userMarie),
    user(ID.paul, userPaul),
  ];
}

async function run(routes: FakeRoute[], state: Partial<SyncState> = {}) {
  const { http, calls } = testHttp(notionConnector, CONFIG, routes);
  const pages = await collect(
    notionConnector.sync(CONFIG, { cursor: null, since: SINCE, ...state }, http),
  );
  return { pages, items: pages.flatMap((page) => page.items), calls };
}

const pathsOf = (calls: FakeCall[]) => calls.map((call) => new URL(call.url).pathname);
const itemOf = (items: ConnectorItem[], id: string) => {
  const item = items.find((candidate) => candidate.externalId === `page:${id}`);
  if (!item) throw new Error(`élément absent : ${id}`);
  return item;
};

// Des pages fabriquées pour les cas de volume, du plus récent au plus ancien comme la recherche.
function stubPage(index: number, editedAt: string) {
  return {
    object: 'page',
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    last_edited_time: editedAt,
    created_by: { object: 'user', id: ID.marie },
    parent: { type: 'workspace', workspace: true },
    url: `https://www.notion.so/page-${index}`,
    properties: { title: { id: 'title', type: 'title', title: [{ plain_text: `Page ${index}` }] } },
  };
}
const paragraph = (text: string) => ({
  object: 'list',
  results: [
    {
      id: `b-${text}`,
      type: 'paragraph',
      has_children: false,
      paragraph: { rich_text: [{ plain_text: text }] },
    },
  ],
  next_cursor: null,
  has_more: false,
});
function bulk(count: number, minuteOf: (index: number) => string) {
  const pages = Array.from({ length: count }, (_, i) => stubPage(i + 1, minuteOf(i + 1)));
  const results = [...pages].reverse();
  const routes = [
    search({ results, next_cursor: null, has_more: false }),
    user(ID.marie, userMarie),
    ...pages.flatMap((page) => [
      children(page.id, paragraph(`Texte ${page.id}`)),
      comments(page.id, commentsEmpty),
    ]),
  ];
  return { pages, routes };
}

describe('configuration', () => {
  it('exige un secret, rogne les espaces collés avec lui, et ne chiffre que lui', () => {
    const schema = notionConnector.configSchema;

    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ token: '' }).success).toBe(false);
    expect(schema.safeParse({ token: '   ' }).success).toBe(false);
    expect(schema.parse({ token: `  ${TOKEN} ` })).toEqual({ authMode: 'key', token: TOKEN });
    expect(notionConnector.secretFields).toEqual(['token']);
  });

  it('n’appelle que api.notion.com, au rythme de trois requêtes par seconde', () => {
    expect(notionConnector.hosts(CONFIG)).toEqual(['api.notion.com']);
    expect(notionConnector.minIntervalMs).toBe(350);
  });
});

describe('verify', () => {
  it('rend le nom du robot et celui de l’espace, avec la clé et la version de l’API', async () => {
    const { http, calls } = testHttp(notionConnector, CONFIG, [
      { url: `${API}/users/me`, json: me },
    ]);

    await expect(notionConnector.verify(CONFIG, http)).resolves.toEqual({
      account: 'Leon (Acme)',
      accountKey: '1f2e3d4c-5b6a-4980-9234-56789abcdef0:espace',
    });

    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers['notion-version']).toBe('2026-03-11');
  });

  it('rend le seul nom pour un jeton qui agit au nom d’une personne', async () => {
    const { http } = testHttp(notionConnector, CONFIG, [
      { url: `${API}/users/me`, json: mePerson },
    ]);

    await expect(notionConnector.verify(CONFIG, http)).resolves.toEqual({
      account: 'Marie Durand',
      accountKey: '3f8e2c71-5a04-4b9d-8c16-72d0a9e45b11',
    });
  });

  it('lève ConnectorAuthError sur un 401', async () => {
    const { http } = testHttp(notionConnector, CONFIG, [
      { url: `${API}/users/me`, ...refused(401, 'unauthorized') },
    ]);

    await expect(notionConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('sync : premier passage', () => {
  it('cherche les pages par date de modification décroissante, avec la clé et la version', async () => {
    const { calls } = await run(wholeWorkspace());

    const [first, second] = calls.filter((call) => call.url === `${API}/search`);
    expect(first?.method).toBe('POST');
    expect(first?.url).toBe(`${API}/search`);
    expect(first?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(first?.headers['notion-version']).toBe('2026-03-11');
    expect(first?.body).toEqual({
      filter: { property: 'object', value: 'page' },
      sort: { timestamp: 'last_edited_time', direction: 'descending' },
      page_size: 100,
    });
    expect(second?.body).toMatchObject({ start_cursor: search1.next_cursor });
  });

  it('rend les pages modifiées depuis since, de la plus récente à la plus ancienne', async () => {
    const { items, calls } = await run(wholeWorkspace());

    // La page sans texte ni commentaire n'est pas rendue ; la page antérieure à since non plus.
    expect(items.map((item) => item.externalId)).toEqual([`page:${ID.db}`, `page:${ID.road}`]);
    expect(pathsOf(calls).filter((path) => path.endsWith('/search'))).toHaveLength(2);
    expect(pathsOf(calls).some((path) => path.includes(ID.old))).toBe(false);
  });

  it('range la page de la feuille de route : titre, lien, parent, corps daté de la modification', async () => {
    const { items } = await run(wholeWorkspace());

    const item = itemOf(items, ID.road);
    expect(item).toMatchObject({
      nature: 'page',
      title: 'Feuille de route T4',
      url: 'https://www.notion.so/Feuille-de-route-T4-a7c41e920d3b4f688b2a91e5d7c30b02',
      updatedAt: '2026-10-03T09:15:00.000Z',
      origin: { parent: 'page_id:f60b9a38-4c15-4e72-b0d3-83a7e1c95d06' },
    });
    expect(item.turns).toHaveLength(1);
    expect(item.turns[0]).toMatchObject({
      externalId: 'body',
      role: 'document',
      author: { name: 'Marie Durand', email: 'marie@acme.test' },
      ts: '2026-10-03T09:15:00.000Z',
    });
  });

  it('convertit les blocs en texte : titres, listes, tâches, tableau, sans le code', async () => {
    const { items } = await run(wholeWorkspace());

    expect(itemOf(items, ID.road).turns[0]?.text).toBe(
      [
        '## Objectifs du trimestre',
        'Livrer la version 2 de l’application mobile.',
        '- Refonte de l’accueil',
        '  - Maquettes validées par Marie',
        '- [x] Choisir le prestataire de paiement',
        '- [ ] Écrire les tests de charge',
        'Jalon | Date',
        'Bêta fermée | 15 novembre',
        'Risques',
        '  Dépendance au calendrier du prestataire',
        '    Détail de niveau trois',
      ].join('\n'),
    );
  });

  it('ne descend ni dans une sous-page (la recherche la rend à part) ni sous le troisième niveau', async () => {
    const { calls } = await run(wholeWorkspace());

    const childrenPaths = pathsOf(calls).filter((path) => path.includes('/blocks/'));
    expect(childrenPaths.some((path) => path.includes('0007'))).toBe(false);
    expect(childrenPaths.some((path) => path.includes('0031'))).toBe(false);
    expect(childrenPaths).toHaveLength(7);
  });

  it('range une ligne de base de données avec ses commentaires, chacun à sa date', async () => {
    const { items } = await run(wholeWorkspace());

    const item = itemOf(items, ID.db);
    expect(item.title).toBe('Compte rendu client Acme');
    expect(item.origin).toEqual({ parent: 'data_source_id:7e45a1c2-90b3-4d68-8f2e-1a6c3d5b9e04' });
    expect(item.turns.map((turn) => [turn.externalId, turn.role, turn.ts])).toEqual([
      ['body', 'document', '2026-10-07T16:42:00.000Z'],
      ['comment:4e8b2d96-1a50-4c73-9f08-6b3a7d1c5e23', 'participant', '2026-10-07T16:50:00.000Z'],
      ['comment:7c1e0a52-9d34-4b86-a1f7-5e2d8c403b21', 'participant', '2026-10-07T17:05:00.000Z'],
    ]);
    expect(item.turns[0]?.author).toEqual({ name: 'Paul Martin', email: 'paul@acme.test' });
    expect(item.turns[1]).toMatchObject({
      author: { name: 'Paul Martin', email: 'paul@acme.test' },
      text: 'Je prépare l’environnement de démonstration.',
    });
    expect(item.turns[2]).toMatchObject({
      author: { name: 'Marie Durand', email: 'marie@acme.test' },
      text: 'On valide la démonstration pour le 28.',
    });
  });

  it('ne demande chaque personne qu’une fois pour tout le passage', async () => {
    const { calls } = await run(wholeWorkspace());

    const lookups = pathsOf(calls).filter((path) => path.includes('/users/'));
    expect(lookups.toSorted()).toEqual(
      [`/v1/users/${ID.paul}`, `/v1/users/${ID.marie}`].toSorted(),
    );
  });

  it('s’arrête à la première page plus ancienne que since, sans lire la suite de la recherche', async () => {
    const { calls } = await run(wholeWorkspace());

    // search2 rend encore has_more : sans l'arrêt, une troisième requête partirait sans route.
    expect(pathsOf(calls).filter((path) => path.endsWith('/search'))).toHaveLength(2);
  });

  it('rend des éléments que la normalisation du socle accepte', async () => {
    const { items } = await run(wholeWorkspace());

    expect(items).toHaveLength(2);
    for (const item of items) expect(normalizeItem(item, 'notion')).not.toBeNull();
  });
});

describe('sync : curseur', () => {
  it('rend un curseur qui nomme la dernière page lue, et ne refait rien quand on le rejoue', async () => {
    const first = await run(wholeWorkspace());
    const cursor = first.pages.at(-1)?.cursor ?? null;

    expect(JSON.parse(cursor ?? 'null')).toEqual({
      at: '2026-10-09T08:00:00.000Z',
      ids: [ID.empty],
    });

    const replay = await run([search(search1), search(search2)], { cursor });
    expect(replay.pages).toEqual([]);
    // La recherche s'arrête dès la première page plus ancienne que le curseur.
    expect(replay.calls).toHaveLength(1);
  });

  it('reprend depuis since quand le curseur est illisible', async () => {
    const { items } = await run(wholeWorkspace(), { cursor: 'ceci n’est pas du JSON' });

    expect(items.map((item) => item.externalId)).toEqual([`page:${ID.db}`, `page:${ID.road}`]);
  });

  it('rend des lots d’au plus cent éléments et reprend au bon endroit avec le curseur du premier', async () => {
    const minuteOf = (i: number) => `2026-10-10T08:${String(i).padStart(2, '0')}:00.000Z`;
    const { pages, items } = await run(bulk(23, minuteOf).routes);

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page.items.length).toBeLessThanOrEqual(100);
    expect(items.map((item) => item.title)).toEqual(
      Array.from({ length: 23 }, (_, i) => `Page ${23 - i}`),
    );

    const firstCursor = pages[0]?.cursor ?? null;
    const rest = await run(bulk(23, minuteOf).routes, { cursor: firstCursor });
    const done = pages[0]?.items.length ?? 0;
    expect(rest.items.map((item) => item.title)).toEqual(
      Array.from({ length: 23 - done }, (_, i) => `Page ${23 - done - i}`),
    );
  });

  it('n’oublie aucune page quand plusieurs ont la même minute de modification', async () => {
    const sameMinute = () => '2026-10-10T08:00:00.000Z';
    const { pages, items } = await run(bulk(12, sameMinute).routes);
    expect(items).toHaveLength(12);
    expect(pages.length).toBeGreaterThan(1);

    const rest = await run(bulk(12, sameMinute).routes, { cursor: pages[0]?.cursor ?? null });
    const done = pages[0]?.items.length ?? 0;
    expect(rest.items).toHaveLength(12 - done);
    // Les pages déjà lues à cette minute ne reviennent pas, même si leur date n'a pas changé.
    expect(rest.items.map((item) => item.title)).not.toContain(pages[0]?.items[0]?.title);

    const last = pages.at(-1);
    expect(JSON.parse(last?.cursor ?? 'null').ids).toHaveLength(12);
  });
});

// Audit (petit) : sans position gardée, chaque passage du premier remplissage relisait toute la
// recherche (N² requêtes pour un gros espace).
describe('sync : premier remplissage', () => {
  const minuteOf = (i: number) => `2026-10-10T08:${String(i).padStart(2, '0')}:00.000Z`;
  // 25 pages, du plus récent au plus ancien, rendues par la recherche dix par dix.
  const newestFirst = Array.from({ length: 25 }, (_, i) =>
    stubPage(i + 1, minuteOf(i + 1)),
  ).reverse();
  const searchPage = (k: number) =>
    search({
      results: newestFirst.slice(10 * k, 10 * k + 10),
      next_cursor: k < 2 ? `suite-${k + 1}` : null,
      has_more: k < 2,
    });
  const reads = (list: typeof newestFirst) => [
    user(ID.marie, userMarie),
    ...list.flatMap((page) => [
      children(page.id, paragraph(`Texte ${page.id}`)),
      comments(page.id, commentsEmpty),
    ]),
  ];
  const searches = (calls: FakeCall[]) =>
    calls
      .filter((call) => call.url === `${API}/search`)
      .map((call) => (call.body as { start_cursor?: string }).start_cursor ?? null);

  it('reprend à sa position dans la recherche, sans la relire depuis le début', async () => {
    const first = await run([searchPage(0), searchPage(1), searchPage(2), ...reads(newestFirst)]);
    // La relève s'est arrêtée après le deuxième lot.
    const cursor = first.pages[1]?.cursor ?? null;

    const rest = await run([searchPage(1), searchPage(2), ...reads(newestFirst.slice(20))], {
      cursor,
    });

    expect(searches(rest.calls)).toEqual(['suite-1', 'suite-2']);
    expect(rest.items.map((item) => item.title)).toEqual([
      'Page 5',
      'Page 4',
      'Page 3',
      'Page 2',
      'Page 1',
    ]);
  });

  it('reprend au milieu d’une page de recherche sans refaire les pages déjà rendues', async () => {
    const all = search({ results: newestFirst, next_cursor: null, has_more: false });
    const first = await run([all, ...reads(newestFirst)]);
    const cursor = first.pages[0]?.cursor ?? null;
    const done = first.pages[0]?.items.length ?? 0;

    const rest = await run([all, ...reads(newestFirst.slice(done))], { cursor });

    expect(rest.items).toHaveLength(25 - done);
    expect(rest.items[0]?.title).toBe(`Page ${25 - done}`);
  });

  it('finit sur le repère de la page la plus récente, d’où repartent les passages suivants', async () => {
    const first = await run([searchPage(0), searchPage(1), searchPage(2), ...reads(newestFirst)]);

    expect(JSON.parse(first.pages.at(-1)?.cursor ?? 'null')).toEqual({
      at: minuteOf(25),
      ids: [newestFirst[0]?.id],
    });
  });
});

describe('sync : lectures qui répondent mal', () => {
  it('lit toutes les listes de blocs et de commentaires, une page après l’autre', async () => {
    const block = (id: string, text: string) => ({
      id,
      type: 'paragraph',
      has_children: false,
      paragraph: { rich_text: [{ plain_text: text }] },
    });
    const comment = (id: string, text: string) => ({
      id,
      created_time: '2026-10-03T10:00:00.000Z',
      created_by: { id: ID.marie },
      rich_text: [{ plain_text: text }],
    });
    const list = (results: unknown[], next: string | null) => ({
      object: 'list',
      results,
      next_cursor: next,
      has_more: next !== null,
    });
    const page = stubPage(1, '2026-10-03T09:15:00.000Z');
    const { items, calls } = await run([
      search({ results: [page], next_cursor: null, has_more: false }),
      children(page.id, list([block('b1', 'Premier')], 'suite-blocs')),
      children(page.id, list([block('b2', 'Second')], null)),
      comments(page.id, list([comment('c1', 'Un')], 'suite-commentaires')),
      comments(page.id, list([comment('c2', 'Deux')], null)),
      user(ID.marie, userMarie),
    ]);

    expect(items[0]?.turns.map((turn) => turn.text)).toEqual(['Premier\nSecond', 'Un', 'Deux']);
    expect(calls.filter((call) => call.url.includes('start_cursor=suite-blocs'))).toHaveLength(1);
    expect(
      calls.filter((call) => call.url.includes('start_cursor=suite-commentaires')),
    ).toHaveLength(1);
  });

  it('sans le droit de lire les commentaires (403), la page sort avec son seul corps', async () => {
    const routes = wholeWorkspace().map((route) =>
      route.url instanceof RegExp && route.url.test(`/v1/comments?block_id=${ID.db}`)
        ? comments(ID.db, undefined, refused(403, 'restricted_resource'))
        : route,
    );
    const { items } = await run(routes);

    expect(itemOf(items, ID.db).turns.map((turn) => turn.externalId)).toEqual(['body']);
  });

  it('sans le droit de lire les personnes (403), l’auteur est inconnu, le commentaire garde le nom affiché', async () => {
    const routes = wholeWorkspace().map((route) =>
      typeof route.url === 'string' && route.url.includes('/users/')
        ? user(route.url.split('/').pop() ?? '', undefined, refused(403, 'restricted_resource'))
        : route,
    );
    const { items } = await run(routes);

    const turns = itemOf(items, ID.db).turns;
    expect(turns[0]?.author).toEqual({ name: null, email: null });
    expect(turns[1]?.author).toEqual({ name: 'Paul Martin', email: null });
    expect(turns[2]?.author).toEqual({ name: 'Marie Durand', email: null });
  });

  it('saute une page retirée entre la recherche et sa lecture (404) et garde la suivante', async () => {
    const routes = wholeWorkspace().map((route) =>
      route.url === `${API}/blocks/${ID.db}/children`
        ? children(ID.db, undefined, refused(404, 'object_not_found'))
        : route,
    );

    const { pages, items } = await run(routes);

    expect(items.map((item) => item.externalId)).toEqual([`page:${ID.road}`]);
    // Les pages sautées comptent comme lues : le curseur les dépasse.
    expect(JSON.parse(pages.at(-1)?.cursor ?? 'null').at).toBe('2026-10-09T08:00:00.000Z');
  });

  it('remonte une clé refusée sur la recherche ou sur la lecture d’une page', async () => {
    const onSearch = testHttp(notionConnector, CONFIG, [
      { method: 'POST', url: `${API}/search`, ...refused(401, 'unauthorized') },
    ]);
    await expect(
      collect(notionConnector.sync(CONFIG, { cursor: null, since: SINCE }, onSearch.http)),
    ).rejects.toBeInstanceOf(ConnectorAuthError);

    const page = stubPage(1, '2026-10-03T09:15:00.000Z');
    const onBlocks = testHttp(notionConnector, CONFIG, [
      search({ results: [page], next_cursor: null, has_more: false }),
      children(page.id, undefined, refused(403, 'restricted_resource')),
    ]);
    await expect(
      collect(notionConnector.sync(CONFIG, { cursor: null, since: SINCE }, onBlocks.http)),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

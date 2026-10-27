import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { trelloConnector } from './connector';
import actionsBoardA from './fixtures/actions-board-a.json';
import actionsBoardB from './fixtures/actions-board-b.json';
import boards from './fixtures/boards.json';
import cardC1 from './fixtures/card-c1.json';
import cardC2 from './fixtures/card-c2.json';
import cardC3 from './fixtures/card-c3.json';
import cardC5 from './fixtures/card-c5.json';
import listsBoardA from './fixtures/lists-board-a.json';
import listsBoardB from './fixtures/lists-board-b.json';
import member from './fixtures/member.json';

// Clé et jeton générés à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const KEY = `cle-${randomBytes(12).toString('hex')}`;
const TOKEN = `jeton-${randomBytes(24).toString('hex')}`;
const config = { apiKey: KEY, token: TOKEN };
const SINCE = new Date('2026-09-15T00:00:00Z');

const API = 'https://api.trello.com/1';
const BOARD_A = '5f2b3c4d5e6f7a8b9c0d00a1';
const BOARD_B = '5f2b3c4d5e6f7a8b9c0d00b2';
const C1 = '6710c0000000000000000001';
const C2 = '6710c0000000000000000002';
const C3 = '6710c0000000000000000003';
const C4 = '6710c0000000000000000004'; // supprimée depuis : Trello répond 404
const C5 = '6710c0000000000000000005';

// Dernière action de chaque carte du tableau A, et de la carte du tableau B.
const C1_AT = '2026-10-12T09:30:15.250Z';
const C5_AT = '2026-10-12T10:15:00.000Z';

const boardActions = (board: string, json: unknown): FakeRoute => ({
  url: `${API}/boards/${board}/actions`,
  json,
});
const cardRoute = (id: string, json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${API}/cards/${id}`,
  json,
  ...extra,
});

// Toutes les requêtes d'un premier passage sur les deux tableaux.
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: `${API}/members/me/boards`, json: boards },
    boardActions(BOARD_A, actionsBoardA),
    { url: `${API}/boards/${BOARD_A}/lists`, json: listsBoardA },
    cardRoute(C4, null, { status: 404, text: 'The requested resource was not found.' }),
    cardRoute(C2, cardC2),
    cardRoute(C3, cardC3),
    cardRoute(C1, cardC1),
    boardActions(BOARD_B, actionsBoardB),
    { url: `${API}/boards/${BOARD_B}/lists`, json: listsBoardB },
    cardRoute(C5, cardC5),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(trelloConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(trelloConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) => Object.fromEntries(new URL(url ?? '').searchParams);
const pathOf = (url: string) => new URL(url).pathname;
const hex = (prefix: string, number: number) =>
  prefix + String(number).padStart(24 - prefix.length, '0');

describe('trello : configuration', () => {
  const schema = trelloConnector.configSchema;

  it('accepte une clé et un jeton, sans les espaces autour', () => {
    expect(schema.parse({ apiKey: `  ${KEY} `, token: ` ${TOKEN}  ` })).toEqual(config);
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({ token: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ apiKey: KEY }).success).toBe(false);
    expect(schema.safeParse({ apiKey: '   ', token: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ apiKey: KEY, token: '' }).success).toBe(false);
  });

  it('refuse une valeur qui fausserait l’en-tête d’authentification', () => {
    for (const bad of ['a"b', 'a b', 'a,b', 'a\nb', 'a\u0000b', 'clé', 'a=b']) {
      expect(schema.safeParse({ apiKey: bad, token: TOKEN }).success, bad).toBe(false);
      expect(schema.safeParse({ apiKey: KEY, token: bad }).success, bad).toBe(false);
    }
  });

  it('fixe l’hôte et le champ à chiffrer', () => {
    expect(trelloConnector.hosts(config)).toEqual(['api.trello.com']);
    expect(trelloConnector.secretFields).toEqual(['token']);
  });

  it('respecte la limite de 100 requêtes par 10 secondes de chaque jeton', () => {
    expect(trelloConnector.minIntervalMs).toBeGreaterThanOrEqual(100);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('trello')).toBe(trelloConnector);
    expect(listCatalog('fr').find((item) => item.id === 'trello')?.available).toBe(true);
  });
});

describe('trello : verify', () => {
  it('lit le compte et compte les tableaux, avec l’en-tête d’authentification de Trello', async () => {
    const { http, calls } = testHttp(trelloConnector, config, [
      { url: `${API}/members/me`, json: member },
      { url: `${API}/members/me/boards`, json: boards },
    ]);

    const result = await trelloConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (@mariedurand), 2 boards' });
    expect(calls.map((call) => pathOf(call.url))).toEqual([
      '/1/members/me',
      '/1/members/me/boards',
    ]);
    expect(paramsOf(calls[1]?.url)).toEqual({ filter: 'open', fields: 'name' });
    for (const call of calls) {
      expect(call.headers.authorization).toBe(
        `OAuth oauth_consumer_key="${KEY}", oauth_token="${TOKEN}"`,
      );
      expect(call.url).not.toContain(KEY);
      expect(call.url).not.toContain(TOKEN);
    }
  });

  it('accorde « tableau » au singulier et se rabat sur le nom d’utilisateur', async () => {
    const { http } = testHttp(trelloConnector, config, [
      { url: `${API}/members/me`, json: { id: member.id, username: 'mariedurand' } },
      { url: `${API}/members/me/boards`, json: [boards[0]] },
    ]);

    const result = await trelloConnector.verify(config, http);

    expect(result).toEqual({ account: 'mariedurand (@mariedurand), 1 board' });
  });

  it('refuse un jeton rejeté, sans reprendre la clé ni le jeton dans le message', async () => {
    const { http } = testHttp(trelloConnector, config, [
      { url: `${API}/members/me`, status: 401, text: 'invalid token' },
    ]);

    const failure = await trelloConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
    expect((failure as Error).message).toBe('Trello rejected the key');
  });
});

describe('trello : sync, premier passage', () => {
  it('demande les actions de chaque tableau ouvert, depuis since, sans les membres', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(pathOf(calls[0]?.url ?? '')).toBe('/1/members/me/boards');
    const actions = calls.find((call) => pathOf(call.url) === `/1/boards/${BOARD_A}/actions`);
    expect(paramsOf(actions?.url)).toEqual({
      filter: 'commentCard,createCard,updateCard',
      since: '2026-09-15T00:00:00Z',
      limit: '500',
      memberCreator: 'false',
    });
  });

  it('écrit la date de since sans les millisecondes', async () => {
    const { calls } = await runSync(firstPassRoutes(), {
      since: new Date('2026-09-15T10:20:30.456Z'),
    });

    const actions = calls.find((call) => pathOf(call.url) === `/1/boards/${BOARD_A}/actions`);
    expect(paramsOf(actions?.url).since).toBe('2026-09-15T10:20:30Z');
  });

  it('authentifie chaque requête par l’en-tête, jamais par l’adresse', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.length).toBeGreaterThan(8);
    for (const call of calls) {
      expect(call.headers.authorization).toBe(
        `OAuth oauth_consumer_key="${KEY}", oauth_token="${TOKEN}"`,
      );
      expect(call.url).not.toContain(KEY);
      expect(call.url).not.toContain(TOKEN);
    }
  });

  it('demande chaque carte avec sa description, ses commentaires et sa création', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const card = calls.find((call) => pathOf(call.url) === `/1/cards/${C1}`);
    expect(paramsOf(card?.url)).toEqual({
      fields: 'name,desc,url,shortUrl,idList',
      actions: 'commentCard,createCard',
      actions_limit: '1000',
    });
  });

  it('rend une carte avec sa description puis ses commentaires, du plus ancien au plus récent', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages).find((item) => item.externalId === `card:${C1}`)).toEqual({
      externalId: `card:${C1}`,
      nature: 'ticket',
      title: "Refaire la page d'accueil",
      url: 'https://trello.com/c/AbCd1234/12-refaire-la-page-daccueil',
      updatedAt: C1_AT,
      origin: { board: 'Site Acme', list: 'En cours' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: null },
          text: "Objectif : une page d'accueil plus claire.\n\n- Nouveau texte de présentation\n- Photos de l'équipe\n\nÉchéance : fin octobre.",
          ts: C1_AT,
        },
        {
          externalId: 'comment:6710f0000000000000000004',
          role: 'participant',
          author: { name: 'Paul Martin', email: null },
          text: "On garde l'ancien logo ?",
          ts: '2026-10-11T14:05:12.345Z',
        },
        {
          externalId: 'comment:6710f0000000000000000007',
          role: 'participant',
          author: { name: 'Marie Durand', email: null },
          text: "Oui, on garde le logo actuel jusqu'à la refonte de décembre.",
          ts: C1_AT,
        },
      ],
    });
  });

  it('rend une carte sans description avec ses seuls commentaires', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((candidate) => candidate.externalId === `card:${C2}`);
    expect(item?.origin).toEqual({ board: 'Site Acme', list: 'À faire' });
    expect(item?.updatedAt).toBe('2026-10-11T16:20:00.500Z');
    expect(item?.turns.map((turn) => [turn.externalId, turn.role, turn.author.name])).toEqual([
      ['comment:6710f0000000000000000005', 'participant', 'Paul Martin'],
    ]);
  });

  it('rend une carte sans texte sans tours, pour que le curseur avance', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((candidate) => candidate.externalId === `card:${C3}`);
    expect(item).toMatchObject({ title: 'Carte à trier', updatedAt: '2026-10-12T08:00:00.000Z' });
    expect(item?.turns).toEqual([]);
  });

  it('rend les cartes de la plus anciennement à la plus récemment modifiée, une page par tableau', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(2);
    expect(pages[0]?.items.map((item) => item.externalId)).toEqual([
      `card:${C2}`,
      `card:${C3}`,
      `card:${C1}`,
    ]);
    expect(idsOf(pages.slice(1))).toEqual([`card:${C5}`]);
    expect(cursorOf(pages[0])).toEqual({ [BOARD_A]: { at: C1_AT, id: C1 } });
    expect(cursorOf(pages[1])).toEqual({
      [BOARD_A]: { at: C1_AT, id: C1 },
      [BOARD_B]: { at: C5_AT, id: C5 },
    });
  });

  it('ignore une carte supprimée ou devenue inaccessible, et rend les autres', async () => {
    for (const status of [404, 401, 403]) {
      const routes = firstPassRoutes().map((route) =>
        route.url === `${API}/cards/${C1}`
          ? { ...route, json: undefined, status, text: 'non' }
          : route,
      );

      const { pages } = await runSync(routes);

      expect(idsOf(pages), String(status)).toEqual([`card:${C2}`, `card:${C3}`, `card:${C5}`]);
      expect(cursorOf(pages[0]), String(status)).toEqual({ [BOARD_A]: { at: C1_AT, id: C1 } });
    }
  });

  it('laisse remonter une panne de Trello sur une carte, sans en citer le texte', async () => {
    const down = Array.from({ length: 4 }, () =>
      cardRoute(C1, null, { status: 503, text: 'secret-xyz' }),
    );
    const routes = [
      ...firstPassRoutes().filter((route) => route.url !== `${API}/cards/${C1}`),
      ...down,
    ];

    const failure = await runSync(routes).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as ConnectorHttpError).status).toBe(503);
    expect((failure as Error).message).toBe('Trello responded with 503');
  });

  it('ne demande ni les listes ni les cartes d’un tableau sans action', async () => {
    const { pages, calls } = await runSync([
      { url: `${API}/members/me/boards`, json: boards },
      boardActions(BOARD_A, []),
      boardActions(BOARD_B, actionsBoardB),
      { url: `${API}/boards/${BOARD_B}/lists`, json: listsBoardB },
      cardRoute(C5, cardC5),
    ]);

    expect(idsOf(pages)).toEqual([`card:${C5}`]);
    expect(calls.map((call) => pathOf(call.url))).not.toContain(`/1/boards/${BOARD_A}/lists`);
  });

  it('rend la carte sans nom de liste quand les listes sont refusées', async () => {
    const routes = firstPassRoutes().map((route) =>
      route.url === `${API}/boards/${BOARD_A}/lists`
        ? { ...route, json: undefined, status: 403 }
        : route,
    );

    const { pages } = await runSync(routes);

    expect(pages[0]?.items.map((item) => item.origin)).toEqual([
      { board: 'Site Acme' },
      { board: 'Site Acme' },
      { board: 'Site Acme' },
    ]);
  });

  it('rend un auteur sans nom quand le membre est inconnu, et le nom d’utilisateur à défaut', async () => {
    const [comment, creation] = cardC2.actions;
    const anonymous = {
      ...cardC2,
      actions: [
        { ...comment, memberCreator: { id: 'x', username: 'paulmartin' } },
        { ...creation, memberCreator: null },
      ],
    };
    const withDesc = { ...anonymous, desc: 'Trois offres à comparer.' };

    const { pages } = await runSync(
      firstPassRoutes().map((route) =>
        route.url === `${API}/cards/${C2}` ? { ...route, json: withDesc } : route,
      ),
    );

    const item = itemsOf(pages).find((candidate) => candidate.externalId === `card:${C2}`);
    expect(item?.turns.map((turn) => turn.author.name)).toEqual([null, 'paulmartin']);
  });

  it('lit les pages d’actions suivantes, à partir de la plus ancienne action reçue', async () => {
    const C6 = '6710c0000000000000000006';
    const fillers = Array.from({ length: 493 }, (_, index) => ({
      id: hex('6710a', 1000 - index),
      type: 'updateCard',
      date: '2026-10-07T00:00:00.000Z',
      data: { card: { id: C1 } },
    }));
    const pageOne = [...actionsBoardA, ...fillers];
    const pageTwo = [
      {
        id: hex('67109', 1),
        type: 'updateCard',
        date: '2026-10-02T00:00:00.000Z',
        data: { card: { id: C6 } },
      },
    ];
    const routes = [
      { url: `${API}/members/me/boards`, json: [boards[1]] },
      boardActions(BOARD_A, pageOne),
      boardActions(BOARD_A, pageTwo),
      { url: `${API}/boards/${BOARD_A}/lists`, json: listsBoardA },
      cardRoute(C6, { ...cardC2, id: C6 }),
      cardRoute(C4, null, { status: 404 }),
      cardRoute(C2, cardC2),
      cardRoute(C3, cardC3),
      cardRoute(C1, cardC1),
    ];

    const { pages, calls } = await runSync(routes);

    const requests = calls.filter((call) => pathOf(call.url) === `/1/boards/${BOARD_A}/actions`);
    expect(requests).toHaveLength(2);
    expect(paramsOf(requests[0]?.url).before).toBeUndefined();
    expect(paramsOf(requests[1]?.url)).toMatchObject({
      before: hex('6710a', 1000 - 492),
      since: '2026-09-15T00:00:00Z',
    });
    expect(idsOf(pages)).toEqual([`card:${C6}`, `card:${C2}`, `card:${C3}`, `card:${C1}`]);
  });

  it('coupe un tableau en pages de 50 cartes au plus', async () => {
    const numbers = Array.from({ length: 120 }, (_, index) => index + 1);
    const cardId = (number: number) => hex('6710c1', number);
    const actions = numbers
      .map((number) => ({
        id: hex('6710f1', number),
        type: 'updateCard',
        date: new Date(Date.UTC(2026, 9, 1) + number * 60_000).toISOString(),
        data: { card: { id: cardId(number) } },
      }))
      .reverse();
    const routes: FakeRoute[] = [
      { url: `${API}/members/me/boards`, json: [boards[1]] },
      boardActions(BOARD_A, actions),
      { url: `${API}/boards/${BOARD_A}/lists`, json: listsBoardA },
      ...numbers.map((number) =>
        cardRoute(cardId(number), {
          id: cardId(number),
          name: `Carte ${number}`,
          desc: `Texte ${number}`,
          actions: [],
        }),
      ),
    ];

    const { pages, calls } = await runSync(routes);

    expect(pages.map((page) => page.items.length)).toEqual([50, 50, 20]);
    expect(idsOf(pages)).toEqual(numbers.map((number) => `card:${cardId(number)}`));
    expect(cursorOf(pages[0])[BOARD_A]).toEqual({
      at: new Date(Date.UTC(2026, 9, 1) + 50 * 60_000).toISOString(),
      id: cardId(50),
    });
    expect(calls.filter((call) => pathOf(call.url).endsWith('/lists'))).toHaveLength(1);
  });

  it('rend des éléments que le socle accepte, avec des dates ISO canoniques', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(4);
    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'trello');
      if (item.turns.length === 0) {
        expect(normalized, item.externalId).toBeNull();
      } else {
        expect(normalized, item.externalId).not.toBeNull();
        expect(normalized?.updatedAt).toBe(item.updatedAt);
      }
    }
  });

  it('laisse remonter un jeton rejeté sur le point d’accès principal', async () => {
    const { http } = testHttp(trelloConnector, config, [
      { url: `${API}/members/me/boards`, json: boards },
      { url: `${API}/boards/${BOARD_A}/actions`, status: 401, text: 'invalid token' },
    ]);

    const failure = collect(
      trelloConnector.sync(config, { cursor: null, since: SINCE }, http),
    ).catch((error: unknown) => error);

    expect(await failure).toBeInstanceOf(ConnectorAuthError);
  });
});

describe('trello : sync, reprise', () => {
  it('reprend juste après le curseur de la première page, sans relire ses cartes', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync(
      [
        { url: `${API}/members/me/boards`, json: boards },
        boardActions(BOARD_A, actionsBoardA),
        boardActions(BOARD_B, actionsBoardB),
        { url: `${API}/boards/${BOARD_B}/lists`, json: listsBoardB },
        cardRoute(C5, cardC5),
      ],
      { cursor: first.pages[0]?.cursor },
    );

    const actions = calls.filter((call) => pathOf(call.url).endsWith('/actions'));
    expect(paramsOf(actions[0]?.url).since).toBe('2026-10-12T09:30:14Z');
    expect(paramsOf(actions[1]?.url).since).toBe('2026-09-15T00:00:00Z');
    expect(idsOf(pages)).toEqual([`card:${C5}`]);
  });

  it('ne refait rien avec le dernier curseur', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync(
      [
        { url: `${API}/members/me/boards`, json: boards },
        boardActions(BOARD_A, actionsBoardA),
        boardActions(BOARD_B, actionsBoardB),
      ],
      { cursor: first.pages.at(-1)?.cursor },
    );

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(3);
  });

  it('départage par l’identifiant deux cartes modifiées au même instant', async () => {
    const at = '2026-10-12T09:00:00.000Z';
    const actions = [C2, C1].map((id, index) => ({
      id: hex('6710f2', index + 1),
      type: 'updateCard',
      date: at,
      data: { card: { id } },
    }));
    const cursor = JSON.stringify({ [BOARD_A]: { at, id: C1 } });

    const { pages } = await runSync(
      [
        { url: `${API}/members/me/boards`, json: [boards[1]] },
        boardActions(BOARD_A, actions),
        { url: `${API}/boards/${BOARD_A}/lists`, json: listsBoardA },
        cardRoute(C2, cardC2),
      ],
      { cursor },
    );

    expect(idsOf(pages)).toEqual([`card:${C2}`]);
    expect(cursorOf(pages[0])).toEqual({ [BOARD_A]: { at, id: C2 } });
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { pages, calls } = await runSync(firstPassRoutes(), { cursor: 'pas du JSON' });

    const actions = calls.find((call) => pathOf(call.url) === `/1/boards/${BOARD_A}/actions`);
    expect(paramsOf(actions?.url).since).toBe('2026-09-15T00:00:00Z');
    expect(idsOf(pages)).toHaveLength(4);
  });

  it('oublie dans le curseur les tableaux qui ont disparu', async () => {
    const gone = '5f2b3c4d5e6f7a8b9c0d00ff';
    const cursor = JSON.stringify({ [gone]: { at: C1_AT, id: C1 } });

    const { pages } = await runSync(
      [
        { url: `${API}/members/me/boards`, json: [boards[0]] },
        boardActions(BOARD_B, actionsBoardB),
        { url: `${API}/boards/${BOARD_B}/lists`, json: listsBoardB },
        cardRoute(C5, cardC5),
      ],
      { cursor },
    );

    expect(Object.keys(cursorOf(pages[0]))).toEqual([BOARD_B]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, type FakeCall, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { crispConnector } from './connector';
import conversationsWindow1 from './fixtures/conversations-window1.json';
import conversationsWindow2 from './fixtures/conversations-window2.json';
import messagesC1 from './fixtures/messages-c1.json';
import messagesC2 from './fixtures/messages-c2.json';
import messagesC3Latest from './fixtures/messages-c3-latest.json';
import messagesC3Older from './fixtures/messages-c3-older.json';
import messagesC4 from './fixtures/messages-c4.json';
import messagesEmpty from './fixtures/messages-empty.json';
import website from './fixtures/website.json';

const WEBSITE = '5d3f2a10-7b44-4c1e-9a30-0b1e6c2d4f01';
const API = `https://api.crisp.chat/v1/website/${WEBSITE}`;
const IDENTIFIER = 'identifiant-de-test';
const KEY = 'cle-de-test-0123456789';
const config = { websiteId: WEBSITE, identifier: IDENTIFIER, key: KEY };
const BASIC = `Basic ${Buffer.from(`${IDENTIFIER}:${KEY}`).toString('base64')}`;
const NOW = '2026-10-15T12:00:00Z';
// Dix jours avant NOW : deux fenêtres de sept jours.
const SINCE = new Date('2026-10-05T00:00:00Z');
const S = (n: number) => `session_6c1d3a7e-5b0f-4c2e-9d11-0a000000000${n}`;
const envelope = (data: unknown) => ({ error: false, reason: 'resolved', data });

const listRoute = (json: unknown, page = 1): FakeRoute => ({
  url: `${API}/conversations/${page}`,
  json,
});
const messagesRoute = (session: string, json: unknown): FakeRoute => ({
  url: `${API}/conversation/${session}/messages`,
  json,
});

// Toutes les routes d'un premier passage : une première fenêtre de trois conversations, puis la
// dernière fenêtre, qui rend aussi la conversation 3 déjà lue.
function firstPassRoutes(): FakeRoute[] {
  return [
    listRoute(conversationsWindow1),
    messagesRoute(S(1), messagesC1),
    messagesRoute(S(1), messagesEmpty),
    messagesRoute(S(2), messagesC2),
    messagesRoute(S(2), messagesEmpty),
    messagesRoute(S(3), messagesC3Latest),
    messagesRoute(S(3), messagesC3Older),
    messagesRoute(S(3), messagesEmpty),
    listRoute(conversationsWindow2),
    messagesRoute(S(4), messagesC4),
    messagesRoute(S(4), messagesEmpty),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(crispConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(crispConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const queryOf = (call: FakeCall | undefined) =>
  Object.fromEntries(new URL(call?.url ?? 'https://x.test').searchParams);
const lists = (calls: FakeCall[]) => calls.filter((call) => /\/conversations\/\d+/.test(call.url));
const messageCalls = (calls: FakeCall[], session: string) =>
  calls.filter((call) => call.url.startsWith(`${API}/conversation/${session}/messages`));

// Une conversation réduite à ce que Leon lit, avec un seul message, pour les cas où le détail ne compte pas.
const minute = (index: number) => new Date(Date.UTC(2026, 9, 14, 8, index)).toISOString();
const bareId = (index: number) => `session_bare-${String(index).padStart(3, '0')}`;
const bare = (index: number) => ({
  session_id: bareId(index),
  created_at: Date.parse('2026-10-14T07:00:00Z'),
  updated_at: Date.parse(minute(index)),
  meta: { nickname: `Visiteur ${index}` },
});
const bareMessage = (index: number) => ({
  type: 'text',
  from: 'user',
  content: `Question ${index}.`,
  fingerprint: 1000 + index,
  timestamp: Date.parse(minute(index)),
  user: { nickname: `Visiteur ${index}` },
});
const bareRoutes = (indexes: number[]): FakeRoute[] =>
  indexes.flatMap((index) => [
    messagesRoute(bareId(index), envelope([bareMessage(index)])),
    messagesRoute(bareId(index), messagesEmpty),
  ]);
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('crisp : configuration', () => {
  const schema = crispConnector.configSchema;

  it('accepte les trois champs, sans les espaces autour, et met l’identifiant du site en minuscules', () => {
    expect(
      schema.parse({
        websiteId: ` ${WEBSITE.toUpperCase()} `,
        identifier: ` ${IDENTIFIER} `,
        key: ` ${KEY} `,
      }),
    ).toEqual(config);
  });

  it('refuse une configuration incomplète ou mal formée', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ ...config, websiteId: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...config, identifier: '   ' }).success).toBe(false);
    expect(schema.safeParse({ ...config, key: '' }).success).toBe(false);
    expect(schema.safeParse({ ...config, key: 'a'.repeat(501) }).success).toBe(false);
    for (const websiteId of ['', 'acme', `${WEBSITE}/x`, `${WEBSITE}.evil.com`, 'a'.repeat(36)]) {
      expect(schema.safeParse({ ...config, websiteId }).success, websiteId).toBe(false);
    }
  });

  it('fixe l’hôte, les champs à chiffrer et l’écart entre deux requêtes', () => {
    expect(crispConnector.hosts(config)).toEqual(['api.crisp.chat']);
    expect([...crispConnector.secretFields].sort()).toEqual(['identifier', 'key']);
    expect(crispConnector.minIntervalMs).toBe(250);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('crisp')).toBe(crispConnector);
    expect(listCatalog().find((item) => item.id === 'crisp')?.available).toBe(true);
  });
});

describe('crisp : verify', () => {
  it('lit le site avec l’authentification Basic et le niveau « website »', async () => {
    const { http, calls } = testHttp(crispConnector, config, [{ url: API, json: website }]);

    const result = await crispConnector.verify(config, http);

    expect(result).toEqual({ account: 'Acme (acme.test)' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe(API);
    expect(calls[0]?.headers).toMatchObject({ authorization: BASIC, 'x-crisp-tier': 'website' });
  });

  it('rend le nom seul quand le site n’a pas de domaine', async () => {
    const { http } = testHttp(crispConnector, config, [
      { url: API, json: envelope({ ...website.data, domain: '' }) },
    ]);

    expect(await crispConnector.verify(config, http)).toEqual({ account: 'Acme' });
  });

  it('refuse une clé rejetée (401 ou 403)', async () => {
    for (const status of [401, 403]) {
      const { http } = testHttp(crispConnector, config, [{ url: API, status }]);

      await expect(crispConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
    }
  });

  it('dit que le site est introuvable (404), sans citer la réponse', async () => {
    const { http } = testHttp(crispConnector, config, [
      {
        url: API,
        status: 404,
        json: { error: true, reason: 'not_found', data: { secret: 'ne-pas-citer' } },
      },
    ]);

    const error = await crispConnector.verify(config, http).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect((error as ConnectorHttpError).status).toBe(404);
    expect((error as Error).message).toBe('Site Crisp introuvable : vérifiez son identifiant');
  });
});

describe('crisp : sync, premier passage', () => {
  it('demande les conversations modifiées depuis since (moins une seconde), 50 par page', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const [first] = lists(calls);
    expect(first?.method).toBe('GET');
    expect(first?.url.startsWith(`${API}/conversations/1?`)).toBe(true);
    expect(queryOf(first)).toEqual({
      per_page: '50',
      filter_date_start: '2026-10-04T23:59:59.000Z',
      filter_date_end: '2026-10-11T23:59:59.000Z',
    });
  });

  it('envoie l’authentification de Crisp à chaque requête', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(11);
    for (const call of calls) {
      expect(call.headers).toMatchObject({ authorization: BASIC, 'x-crisp-tier': 'website' });
    }
  });

  it('rend une conversation avec ses messages par date, sans les événements', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[0]?.items[0]).toEqual({
      externalId: `conversation:${S(1)}`,
      nature: 'fil',
      title: 'Question sur la facturation',
      url: `https://app.crisp.chat/website/${WEBSITE}/inbox/${S(1)}/`,
      updatedAt: '2026-10-06T09:30:00.000Z',
      origin: { site: WEBSITE },
      turns: [
        {
          externalId: 'message:163239614854320',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Bonjour, ma facture d’octobre indique deux fois l’abonnement.\n\nPouvez-vous la corriger ?',
          ts: '2026-10-06T08:00:30.000Z',
        },
        {
          externalId: 'message:163239614854321',
          role: 'participant',
          author: { name: 'Paul Martin', email: null },
          text: 'Bonjour Marie, je regarde ça tout de suite.',
          ts: '2026-10-06T08:05:00.000Z',
        },
        {
          externalId: 'message:163239614854323',
          role: 'participant',
          author: { name: 'Paul Martin', email: null },
          text: 'C’est corrigé : un avoir de 49 € a été émis.',
          ts: '2026-10-06T09:20:00.000Z',
        },
        {
          externalId: 'message:163239614854324',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Merci, c’est bien reçu.',
          ts: '2026-10-06T09:30:00.000Z',
        },
      ],
    });
  });

  it('classe les conversations de la plus anciennement à la plus récemment modifiée', async () => {
    const routes = firstPassRoutes();
    routes[0] = listRoute(envelope([...conversationsWindow1.data].reverse()));

    const { pages } = await runSync(routes);

    expect(idsOf(pages)).toEqual([1, 2, 3, 4].map((n) => `conversation:${S(n)}`));
  });

  it('classe les messages par date, quel que soit l’ordre rendu par Crisp', async () => {
    const routes = firstPassRoutes();
    routes[1] = messagesRoute(S(1), envelope([...messagesC1.data].reverse()));

    const { pages } = await runSync(routes);

    const ids = pages[0]?.items[0]?.turns.map((turn) => turn.externalId);
    expect(ids).toEqual([
      'message:163239614854320',
      'message:163239614854321',
      'message:163239614854323',
      'message:163239614854324',
    ]);
  });

  it('lit les messages plus anciens par lots, avec timestamp_before, jusqu’au lot vide', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find(
      (candidate) => candidate.externalId === `conversation:${S(3)}`,
    );
    expect(item?.turns.map((turn) => turn.externalId)).toEqual([
      'message:163239614854340',
      'message:163239614854341',
      'message:163239614854342',
      'message:163239614854343',
    ]);
    const sent = messageCalls(calls, S(3)).map((call) => queryOf(call).timestamp_before);
    expect(sent).toEqual([
      undefined,
      String(Date.parse('2026-10-10T16:30:00Z')),
      String(Date.parse('2026-10-10T16:00:30Z')),
    ]);
  });

  it('s’arrête quand Crisp rend deux fois le même lot, sans doublon', async () => {
    const { pages, calls } = await runSync(
      [
        listRoute(envelope([bare(0)])),
        messagesRoute(bareId(0), envelope([bareMessage(0)])),
        messagesRoute(bareId(0), envelope([bareMessage(0)])),
      ],
      { since: new Date('2026-10-14T00:00:00Z') },
    );

    expect(pages[0]?.items[0]?.turns).toHaveLength(1);
    expect(messageCalls(calls, bareId(0))).toHaveLength(2);
  });

  it('rend une conversation sans message de texte sans tours, pour avancer le curseur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const empty = itemsOf(pages).find((item) => item.externalId === `conversation:${S(2)}`);
    expect(empty?.title).toBe('Conversation avec visitor607');
    expect(empty?.turns).toEqual([]);
    expect(cursorOf(pages[0]).seen).toContain(S(3));
  });

  it('nomme le visiteur par son pseudonyme, puis par l’adresse de la conversation', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const lea = itemsOf(pages).find((item) => item.externalId === `conversation:${S(3)}`);
    expect(lea?.title).toBe('Conversation avec Léa Bernard');
    expect(lea?.turns[0]?.author).toEqual({ name: 'Léa Bernard', email: 'lea@acme.test' });
    const client = itemsOf(pages).find((item) => item.externalId === `conversation:${S(4)}`);
    expect(client?.title).toBe('Conversation avec client@exemple.test');
    expect(client?.turns[0]?.author).toEqual({ name: 'client', email: 'client@exemple.test' });
  });

  it('signale une note interne, sans la confondre avec un message envoyé au client', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const client = itemsOf(pages).find((item) => item.externalId === `conversation:${S(4)}`);
    expect(client?.turns.map((turn) => [turn.externalId, turn.author.name, turn.text])).toEqual([
      ['message:163239614854350', 'client', 'Votre export CSV est coupé après 1 000 lignes.'],
      [
        'message:163239614854351',
        'Paul Martin',
        '[Note interne] Bug connu, voir le ticket #482. Ne pas promettre de date.',
      ],
      [
        'message:163239614854352',
        'Paul Martin',
        'Merci du signalement, nous corrigeons cela cette semaine.',
      ],
    ]);
  });

  it('lit les dates de Crisp comme des millisecondes depuis 1970', async () => {
    // 1632396148646 : l'horodatage d'un message dans les exemples de la doc de Crisp.
    const old = { ...bareMessage(0), timestamp: 1632396148646 };
    const { pages } = await runSync(
      [
        listRoute(envelope([bare(0)])),
        messagesRoute(bareId(0), envelope([old])),
        messagesRoute(bareId(0), messagesEmpty),
      ],
      { since: new Date('2026-10-14T00:00:00Z') },
    );

    expect(pages[0]?.items[0]?.updatedAt).toBe('2026-10-14T08:00:00.000Z');
    expect(pages[0]?.items[0]?.turns[0]?.ts).toBe('2021-09-23T11:22:28.646Z');
  });

  it('rend des éléments que le socle accepte, avec des dates ISO canoniques', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(4);
    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'crisp');
      if (item.turns.length === 0) {
        expect(normalized, item.externalId).toBeNull();
      } else {
        expect(normalized, item.externalId).not.toBeNull();
        expect(normalized?.updatedAt).toBe(item.updatedAt);
      }
    }
  });
});

describe('crisp : sync, fenêtres, pages et curseur', () => {
  it('lit la fenêtre suivante depuis la dernière conversation rendue, la dernière sans borne de fin', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    const [first, last] = lists(calls).map(queryOf);
    expect(first?.filter_date_end).toBe('2026-10-11T23:59:59.000Z');
    expect(last).toEqual({ per_page: '50', filter_date_start: '2026-10-10T16:44:59.000Z' });
    expect(idsOf(pages.slice(0, 1))).toEqual([1, 2, 3].map((n) => `conversation:${S(n)}`));
    expect(idsOf(pages.slice(1))).toEqual([`conversation:${S(4)}`]);
  });

  it('garde l’instant de la dernière conversation rendue et celles lues à cet instant', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(2);
    expect(cursorOf(pages[0])).toEqual({ at: '2026-10-10T16:45:00.000Z', seen: [S(3)] });
    expect(cursorOf(pages[1])).toEqual({ at: '2026-10-14T10:00:00.000Z', seen: [S(4)] });
  });

  it('passe les fenêtres vides sans rien rendre, chacune reprenant là où la précédente s’arrête', async () => {
    const { pages, calls } = await runSync(
      Array.from({ length: 12 }, () => listRoute(envelope([]))),
      { since: new Date('2026-08-01T00:00:00Z') },
    );

    const queries = lists(calls).map(queryOf);
    expect(pages).toEqual([]);
    expect(queries[0]?.filter_date_start).toBe('2026-07-31T23:59:59.000Z');
    // Soixante-quinze jours et demi à couvrir, un peu moins de sept jours par fenêtre.
    expect(queries).toHaveLength(11);
    expect(queries.at(-1)).not.toHaveProperty('filter_date_end');
    for (const [index, query] of queries.slice(0, -1).entries()) {
      const next = queries[index + 1];
      const start = Date.parse(query.filter_date_start as string);
      const end = Date.parse(query.filter_date_end as string);
      expect(end - start, `fenêtre ${index}`).toBe(7 * 24 * 3600 * 1000);
      expect(Date.parse(next?.filter_date_start as string), `fenêtre ${index}`).toBeLessThan(end);
      expect(Date.parse(next?.filter_date_start as string), `fenêtre ${index}`).toBeGreaterThan(
        start,
      );
    }
  });

  it('lit la page suivante tant que la page est pleine, et rend les conversations par pages de cinquante', async () => {
    const since = new Date('2026-10-14T00:00:00Z');
    const { pages, calls } = await runSync(
      [
        listRoute(envelope(range(0, 50).map(bare)), 1),
        listRoute(envelope(range(50, 51).map(bare)), 2),
        ...bareRoutes(range(0, 51)),
      ],
      { since },
    );

    expect(lists(calls).map((call) => call.url.split('?')[0])).toEqual([
      `${API}/conversations/1`,
      `${API}/conversations/2`,
    ]);
    expect(pages.map((page) => page.items.length)).toEqual([50, 1]);
    expect(cursorOf(pages[0])).toEqual({ at: minute(49), seen: [bareId(49)] });
    expect(cursorOf(pages[1])).toEqual({ at: minute(50), seen: [bareId(50)] });
  });

  it('s’arrête si Crisp rend la même page pour la page suivante', async () => {
    const full = envelope(range(0, 50).map(bare));
    const { pages, calls } = await runSync(
      [listRoute(full, 1), listRoute(full, 2), ...bareRoutes(range(0, 50))],
      { since: new Date('2026-10-14T00:00:00Z') },
    );

    expect(lists(calls)).toHaveLength(2);
    expect(itemsOf(pages)).toHaveLength(50);
  });

  it('prend un 404 ou un 416 sur la page suivante pour la fin de la liste, et rend les conversations déjà lues', async () => {
    for (const status of [404, 416]) {
      const { pages, calls } = await runSync(
        [
          listRoute(envelope(range(0, 50).map(bare)), 1),
          { url: `${API}/conversations/2`, status },
          ...bareRoutes(range(0, 50)),
        ],
        { since: new Date('2026-10-14T00:00:00Z') },
      );

      expect(lists(calls)).toHaveLength(2);
      expect(itemsOf(pages)).toHaveLength(50);
      expect(cursorOf(pages.at(-1))).toEqual({ at: minute(49), seen: [bareId(49)] });
    }
  });

  it('ne prend pas un 404 sur la première page pour une liste vide', async () => {
    const { http } = testHttp(crispConnector, config, [
      { url: `${API}/conversations/1`, status: 404 },
    ]);

    const run = collect(crispConnector.sync(config, { cursor: null, since: SINCE }, http));

    await expect(run).rejects.toMatchObject({ name: 'ConnectorHttpError', status: 404 });
  });

  it('reprend après la première page sans la relire', async () => {
    const since = new Date('2026-10-14T00:00:00Z');
    const rows = range(0, 120);
    const listing = (page: number, from: number, to: number) =>
      listRoute(envelope(range(from, to).map(bare)), page);
    const first = await runSync(
      [listing(1, 0, 50), listing(2, 50, 100), listing(3, 100, 120), ...bareRoutes(rows)],
      { since },
    );

    const { pages, calls } = await runSync(
      [listing(1, 0, 50), listing(2, 50, 100), listing(3, 100, 120), ...bareRoutes(rows)],
      { since, cursor: first.pages[0]?.cursor },
    );

    expect(first.pages.map((page) => page.items.length)).toEqual([50, 50, 20]);
    expect(queryOf(lists(calls)[0]).filter_date_start).toBe('2026-10-14T08:48:59.000Z');
    expect(pages.map((page) => page.items.length)).toEqual([50, 20]);
    expect(itemsOf(pages)[0]?.externalId).toBe(`conversation:${bareId(50)}`);
    expect(messageCalls(calls, bareId(49))).toHaveLength(0);
  });

  it('ne refait rien avec le dernier curseur, et lit seulement ce qui a changé ensuite', async () => {
    const first = await runSync(firstPassRoutes());
    const cursor = first.pages.at(-1)?.cursor;

    const idle = await runSync([listRoute(envelope([conversationsWindow2.data[0]]))], { cursor });
    const newer = { ...bare(60), updated_at: Date.parse('2026-10-15T09:00:00Z') };
    const later = await runSync(
      [listRoute(envelope([conversationsWindow2.data[0], newer])), ...bareRoutes([60])],
      { cursor },
    );

    expect(idle.pages).toEqual([]);
    expect(idle.calls).toHaveLength(1);
    expect(queryOf(idle.calls[0]).filter_date_start).toBe('2026-10-14T09:59:59.000Z');
    expect(idsOf(later.pages)).toEqual([`conversation:${bareId(60)}`]);
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync([listRoute(envelope([]))], {
      cursor: 'pas du json',
      since: new Date('2026-10-14T10:20:30.456Z'),
    });

    expect(queryOf(calls[0]).filter_date_start).toBe('2026-10-14T10:20:29.456Z');
  });
});

describe('crisp : erreurs', () => {
  it('laisse remonter un refus de la clé sur la liste des conversations', async () => {
    for (const status of [401, 403]) {
      const { http } = testHttp(crispConnector, config, [
        { url: `${API}/conversations/1`, status },
      ]);

      const run = collect(crispConnector.sync(config, { cursor: null, since: SINCE }, http));

      await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
    }
  });

  it('laisse remonter un 403 sur les messages : ils sont le contenu même de la conversation', async () => {
    const { http } = testHttp(crispConnector, config, [
      listRoute(conversationsWindow1),
      { url: `${API}/conversation/${S(1)}/messages`, status: 403 },
    ]);

    const run = collect(crispConnector.sync(config, { cursor: null, since: SINCE }, http));

    await expect(run).rejects.toMatchObject({ name: 'ConnectorAuthError', status: 403 });
  });

  it('ne cite ni la clé ni la réponse dans l’erreur d’une réponse inattendue', async () => {
    const { http } = testHttp(crispConnector, config, [
      listRoute({ error: false, reason: 'resolved', data: [{ session_id: 12 }], secret: KEY }),
    ]);

    const error = await collect(
      crispConnector.sync(config, { cursor: null, since: SINCE }, http),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect((error as Error).message).toBe('Réponse inattendue');
  });
});

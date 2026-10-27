import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collect,
  expectHostsWellFormed,
  type FakeCall,
  type FakeRoute,
  testHttp,
} from '@/test/fake-fetch';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import type { ConnectorItem, SyncPage } from '../types';
import { mondayConnector } from './connector';
import boards from './fixtures/boards.json';
import boardsNone from './fixtures/boards-none.json';
import errorComplexity from './fixtures/error-complexity.json';
import errorCursor from './fixtures/error-cursor.json';
import errorDailyLimit from './fixtures/error-daily-limit.json';
import errorForbidden from './fixtures/error-forbidden.json';
import errorInvalidBoard from './fixtures/error-invalid-board.json';
import errorUnauthorized from './fixtures/error-unauthorized.json';
import errorValidation from './fixtures/error-validation.json';
import itemsBoard1Page1 from './fixtures/items-board-1-page-1.json';
import itemsBoard1Page2 from './fixtures/items-board-1-page-2.json';
import itemsBoard3 from './fixtures/items-board-3.json';
import itemsEmpty from './fixtures/items-empty.json';
import me from './fixtures/me.json';

// Un jeton généré à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const TOKEN = `eyJ${randomBytes(18).toString('hex')}`;
const CONFIG = { authMode: 'key' as const, token: TOKEN };
// Le bouton : le jeton d'accès remplace la clé collée (le socle OAuth tient aussi le jeton de
// rafraîchissement et l'échéance).
const ACCESS = `eyJ${randomBytes(18).toString('hex')}`;
const OAUTH_CONFIG = {
  authMode: 'oauth' as const,
  accessToken: ACCESS,
  refreshToken: `eyJ${randomBytes(18).toString('hex')}`,
  expiresAt: null,
};
const SINCE = new Date('2026-10-01T00:00:00.000Z');
const NOW = '2026-10-15T10:00:00.000Z';
const END_FROM = '2026-10-15T09:55:00.000Z'; // le début du passage, moins 5 minutes de marge

const api = (extra: Partial<FakeRoute> = {}): FakeRoute => ({
  method: 'POST',
  url: 'https://api.monday.com/v2',
  ...extra,
});

type GraphqlBody = { query: string; variables: Record<string, unknown> };
const bodyOf = (call: FakeCall | undefined) => call?.body as GraphqlBody;

function sync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(mondayConnector, CONFIG, routes);
  return { pages: collect(mondayConnector.sync(CONFIG, { cursor, since: SINCE }, http)), calls };
}

// Lit la première page seulement : pour les tests qui ne regardent que les requêtes du début.
async function firstPage(routes: FakeRoute[]) {
  const { http, calls } = testHttp(mondayConnector, CONFIG, routes);
  const iterator = mondayConnector
    .sync(CONFIG, { cursor: null, since: SINCE }, http)
    [Symbol.asyncIterator]();
  const first = await iterator.next();
  await iterator.return?.();
  return { calls, page: first.value as SyncPage };
}

type Round = {
  from: string;
  started: string | null;
  boards: string[] | null;
  after: string | null;
};
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null') as Round;
const roundCursor = (round: Partial<Round>) =>
  JSON.stringify({ from: SINCE.toISOString(), started: NOW, boards: [], after: null, ...round });

// Deux tableaux : le premier sur deux pages (la seconde s'arrête sur un élément trop ancien), le
// second sur une page.
const twoBoards = (): FakeRoute[] => [
  api({ json: boards }),
  api({ json: itemsBoard1Page1 }),
  api({ json: itemsBoard1Page2 }),
  api({ json: itemsBoard3 }),
];

beforeEach(() => {
  // Seule l'horloge est simulée : les délais d'attente restent ceux de Node.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('mondayConnector : configuration', () => {
  it('refuse une configuration sans jeton', () => {
    expect(mondayConnector.configSchema.safeParse({}).success).toBe(false);
    expect(mondayConnector.configSchema.safeParse({ token: '' }).success).toBe(false);
    expect(mondayConnector.configSchema.safeParse({ token: '  ' }).success).toBe(false);
  });

  it('nettoie les espaces autour du jeton', () => {
    expect(mondayConnector.configSchema.parse({ token: ` ${TOKEN}\n` })).toEqual({
      authMode: 'key',
      token: TOKEN,
    });
  });

  it('accepte la forme du bouton, et l’ancienne forme à clé qui n’a pas de mode', () => {
    expect(mondayConnector.configSchema.parse(OAUTH_CONFIG)).toEqual(OAUTH_CONFIG);
    expect(mondayConnector.configSchema.parse({ authMode: 'key', token: TOKEN })).toEqual({
      authMode: 'key',
      token: TOKEN,
    });
    expect(mondayConnector.configSchema.parse({ token: TOKEN }).authMode).toBe('key');
  });

  it('refuse une forme incomplète, en nommant le champ manquant', () => {
    const missing = (input: unknown) => {
      const result = mondayConnector.configSchema.safeParse(input);
      if (result.success) return null;
      return [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    };

    expect(missing({ authMode: 'oauth' })).toEqual(['accessToken']);
    expect(missing({ authMode: 'oauth', accessToken: '' })).toEqual(['accessToken']);
    // Une clé collée ne suffit pas à une connexion par bouton, ni l'inverse.
    expect(missing({ authMode: 'oauth', token: TOKEN })).toEqual(['accessToken']);
    expect(missing({ authMode: 'key', accessToken: ACCESS })).toEqual(['token']);
    expect(missing({ authMode: 'inconnu', token: TOKEN })).not.toBeNull();
  });

  it('reste un z.object que le catalogue peut lire (.shape)', () => {
    const shape = (mondayConnector.configSchema as unknown as { shape: Record<string, unknown> })
      .shape;
    expect(Object.keys(shape)).toEqual(
      expect.arrayContaining(['authMode', 'token', 'accessToken', 'refreshToken', 'expiresAt']),
    );
  });

  it('déclare un hôte exact et le jeton comme secret', () => {
    expect(mondayConnector.hosts(CONFIG)).toEqual(['api.monday.com']);
    expectHostsWellFormed(mondayConnector.hosts(CONFIG));
    expect(mondayConnector.secretFields).toEqual(['token']);
  });
});

describe('mondayConnector : verify', () => {
  it('rend le compte et envoie le jeton tel quel, avec la version de l’API', async () => {
    const { http, calls } = testHttp(mondayConnector, CONFIG, [api({ json: me })]);

    await expect(mondayConnector.verify(CONFIG, http)).resolves.toEqual({
      account: 'Marie Durand (Acme)',
      accountKey: '12345678:1234567',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://api.monday.com/v2');
    expect(calls[0]?.headers.authorization).toBe(TOKEN); // sans « Bearer »
    expect(calls[0]?.headers['api-version']).toBe('2026-07');
    expect(bodyOf(calls[0]).query).toMatch(/\bme\b/);
  });

  it('envoie le jeton d’accès du bouton tel quel, comme la clé : sans « Bearer »', async () => {
    const { http, calls } = testHttp(mondayConnector, OAUTH_CONFIG, [api({ json: me })]);

    await expect(mondayConnector.verify(OAUTH_CONFIG, http)).resolves.toEqual({
      account: 'Marie Durand (Acme)',
      accountKey: '12345678:1234567',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBe(ACCESS);
    expect(calls[0]?.headers['api-version']).toBe('2026-07');
  });

  it('lève ConnectorAuthError sur un 401', async () => {
    const { http } = testHttp(mondayConnector, CONFIG, [api({ status: 401, json: {} })]);

    await expect(mondayConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lève ConnectorAuthError sur une erreur « Unauthorized » rendue avec un 200', async () => {
    const { http } = testHttp(mondayConnector, CONFIG, [api({ json: errorUnauthorized })]);

    await expect(mondayConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lève ConnectorAuthError sur un refus de droits', async () => {
    const { http } = testHttp(mondayConnector, CONFIG, [api({ json: errorForbidden })]);

    await expect(mondayConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('mondayConnector : premier passage', () => {
  it('liste les tableaux actifs, les plus utilisés d’abord, sans les tableaux de sous-éléments', async () => {
    const { pages, calls } = sync(twoBoards());
    await pages;

    const list = bodyOf(calls[0]);
    expect(list.query).toMatch(/boards\(limit: \$limit, page: \$page/);
    expect(list.query).toMatch(/order_by: used_at/);
    expect(list.variables).toEqual({ limit: 50, page: 1 });
    expect(calls[0]?.headers.authorization).toBe(TOKEN);
    expect(calls[0]?.headers['api-version']).toBe('2026-07');
    // Les tableaux 2222222222 (sous-éléments) et 4444444444 (document) ne sont jamais lus.
    expect(calls.map((call) => bodyOf(call).variables.ids)).toEqual([
      undefined,
      ['1111111111'],
      undefined,
      ['3333333333'],
    ]);
  });

  it('lit les tableaux avec le jeton d’accès du bouton, sans « Bearer »', async () => {
    const { http, calls } = testHttp(mondayConnector, OAUTH_CONFIG, twoBoards());

    await collect(mondayConnector.sync(OAUTH_CONFIG, { cursor: null, since: SINCE }, http));

    expect(calls.length).toBeGreaterThan(1);
    expect(calls.map((call) => call.headers.authorization)).toEqual(calls.map(() => ACCESS));
  });

  it('un jeton d’accès refusé au milieu du passage remonte comme une clé refusée (le socle renouvelle)', async () => {
    const { http } = testHttp(mondayConnector, OAUTH_CONFIG, [
      api({ json: boards }),
      api({ status: 401, json: {} }),
    ]);

    const run = collect(mondayConnector.sync(OAUTH_CONFIG, { cursor: null, since: SINCE }, http));

    const error = await run.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectorAuthError);
    expect((error as ConnectorAuthError).status).toBe(401);
  });

  it('trie les éléments du plus récemment modifié au plus ancien, 25 par page', async () => {
    const { pages, calls } = sync(twoBoards());
    await pages;

    const first = bodyOf(calls[1]);
    expect(first.query).toMatch(/items_page\(limit: \$limit/);
    expect(first.query).toMatch(/column_id: "__last_updated__", direction: desc/);
    expect(first.variables.limit).toBe(25);
    expect(first.query).toMatch(/updates\(limit: 25\)/);
  });

  it('convertit un élément : corps = nom et colonnes, puis mises à jour et réponses dans l’ordre', async () => {
    const [first] = await sync(twoBoards()).pages;

    expect(first?.items[0]).toEqual({
      externalId: 'item:5550000001',
      nature: 'ticket',
      title: 'Refonte du site vitrine',
      url: 'https://acme.monday.com/boards/1111111111/pulses/5550000001',
      updatedAt: '2026-10-14T16:20:00.000Z',
      origin: { workspace: 'Marketing', board: 'Site vitrine', group: 'En cours' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: [
            'Refonte du site vitrine',
            'Statut : En cours',
            'Responsables : Marie Durand, David Martin',
            'Échéance : 2026-11-30',
          ].join('\n'),
          ts: '2026-10-14T16:20:00.000Z', // le corps vaut à la date de la dernière modification
        },
        {
          externalId: 'update:9002',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Les maquettes sont livrées.',
          ts: '2026-10-10T14:00:00.000Z',
        },
        {
          externalId: 'update:9001',
          role: 'participant',
          author: { name: 'David Martin', email: 'david@acme.test' },
          text: 'Le budget est validé : 12 000 €.\n\nOn lance la production lundi.',
          ts: '2026-10-13T09:00:00.000Z',
        },
        {
          externalId: 'reply:9101',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Merci, on part sur le plan Business.',
          ts: '2026-10-13T10:30:00.000Z',
        },
      ],
    } satisfies ConnectorItem);
  });

  it('ne reprend ni les colonnes de dates automatiques, ni le nom, ni les colonnes vides', async () => {
    const [first] = await sync(twoBoards()).pages;
    const body = first?.items[0]?.turns[0]?.text ?? '';

    expect(body).not.toMatch(/Dernière mise à jour/);
    expect(body).not.toMatch(/Nom :/);
    expect(body).not.toMatch(/Priorité/);
    expect(body).not.toMatch(/Notes/);
  });

  it('rend un élément qui n’a que des colonnes, et ignore celui qui n’a rien à lire', async () => {
    const [first] = await sync(twoBoards()).pages;

    // 5550000003 n'a ni colonne remplie ni mise à jour : son nom seul n'apprend rien.
    expect(first?.items.map((item) => item.externalId)).toEqual([
      'item:5550000001',
      'item:5550000002',
    ]);
    expect(first?.items[1]?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'David Martin', email: 'david@acme.test' },
        text: 'Rédiger les mentions légales\nStatut : À faire',
        ts: '2026-10-14T09:00:00.000Z',
      },
    ]);
  });

  it('rend un auteur nul pour une mise à jour sans compte, et omet l’espace de travail du compte principal', async () => {
    const pages = await sync(twoBoards()).pages;

    expect(pages[1]?.items[0]?.turns.at(-1)?.author).toEqual({ name: null, email: null });
    expect(pages[2]?.items[0]?.origin).toEqual({ board: 'Événements' });
  });

  it('ramène une date avec décalage à l’heure universelle', async () => {
    const pages = await sync(twoBoards()).pages;

    expect(pages[2]?.items[0]?.updatedAt).toBe('2026-10-11T10:00:00.000Z');
  });

  it('rend des éléments que le socle accepte (dates ISO avec fuseau)', async () => {
    const pages = await sync(twoBoards()).pages;
    const items = pages.flatMap((page) => page.items);

    expect(items).toHaveLength(4);
    for (const item of items) expect(normalizeItem(item, 'monday')).not.toBeNull();
  });
});

describe('mondayConnector : dates', () => {
  const withUpdateDate = (created_at: string) => {
    const page = structuredClone(itemsBoard1Page1);
    const update = page.data.boards[0]?.items_page.items[0]?.updates[1];
    if (!update) throw new Error('fixture vide');
    update.created_at = created_at;
    return page;
  };

  it('convertit une date en heure universelle écrite « … UTC »', async () => {
    const { page } = await firstPage([
      api({ json: boards }),
      api({ json: withUpdateDate('2026-10-10 14:00:00 UTC') }),
    ]);

    const turn = page.items[0]?.turns.find((t) => t.externalId === 'update:9002');
    expect(turn?.ts).toBe('2026-10-10T14:00:00.000Z');
  });

  it('écarte un commentaire dont la date n’a pas de fuseau, au lieu de la lire dans le fuseau du serveur', async () => {
    const { page } = await firstPage([
      api({ json: boards }),
      api({ json: withUpdateDate('2026-10-10 14:00:00') }),
    ]);

    const ids = page.items[0]?.turns.map((turn) => turn.externalId);
    expect(ids).not.toContain('update:9002');
    expect(ids).toContain('update:9001');
  });
});

describe('mondayConnector : pagination et curseur', () => {
  it('suit la page suivante avec le curseur de l’outil, sur le même tableau', async () => {
    const { pages, calls } = sync(twoBoards());
    await pages;

    const second = bodyOf(calls[2]);
    expect(second.query).toMatch(/next_items_page\(cursor: \$cursor, limit: \$limit\)/);
    expect(second.variables).toEqual({ cursor: 'cursor-1', limit: 25 });
  });

  it('rend une page par page de l’outil, avec le curseur de reprise', async () => {
    const pages = await sync(twoBoards()).pages;

    expect(pages.map((page) => page.items.map((item) => item.externalId))).toEqual([
      ['item:5550000001', 'item:5550000002'],
      ['item:5550000004'],
      ['item:5550000006'],
    ]);
    expect(cursorOf(pages[0])).toEqual({
      from: SINCE.toISOString(),
      started: NOW,
      boards: ['1111111111', '3333333333'],
      after: 'cursor-1',
    });
    expect(cursorOf(pages[1])).toEqual({
      from: SINCE.toISOString(),
      started: NOW,
      boards: ['3333333333'],
      after: null,
    });
  });

  it('s’arrête au premier élément qui n’a pas changé depuis since, malgré un curseur de l’outil', async () => {
    const { pages, calls } = sync(twoBoards());
    const all = await pages;

    // 5550000005 (modifié le 20 septembre) est écarté ; cursor-2 n'est jamais suivi.
    expect(all.flatMap((page) => page.items.map((item) => item.externalId))).not.toContain(
      'item:5550000005',
    );
    expect(calls).toHaveLength(4);
  });

  it('termine le passage avec une nouvelle date de départ, cinq minutes avant son début', async () => {
    const pages = await sync(twoBoards()).pages;

    expect(cursorOf(pages.at(-1))).toEqual({
      from: END_FROM,
      started: null,
      boards: null,
      after: null,
    });
  });

  it('repasse le dernier curseur : nouveau passage, sans refaire ce qui est déjà lu', async () => {
    const last = (await sync(twoBoards()).pages).at(-1) as SyncPage;
    vi.setSystemTime(new Date('2026-10-15T10:15:00.000Z'));

    const { pages, calls } = sync(
      [api({ json: boards }), api({ json: itemsBoard1Page1 }), api({ json: itemsBoard3 })],
      last.cursor,
    );
    const next = await pages;

    // Tous les éléments sont plus anciens que la date de départ : rien n'est rendu, et on ne
    // demande pas de page suivante (cursor-1).
    expect(next.flatMap((page) => page.items)).toEqual([]);
    expect(calls).toHaveLength(3);
    expect(cursorOf(next.at(-1))).toEqual({
      from: '2026-10-15T10:10:00.000Z',
      started: null,
      boards: null,
      after: null,
    });
  });

  it('reprend au milieu d’un passage, sans relister les tableaux ni changer la date de départ', async () => {
    const [first] = await sync(twoBoards()).pages;
    vi.setSystemTime(new Date('2026-10-15T10:20:00.000Z'));

    const { pages, calls } = sync(
      [api({ json: itemsBoard1Page2 }), api({ json: itemsBoard3 })],
      first?.cursor ?? null,
    );
    const resumed = await pages;

    expect(bodyOf(calls[0]).variables).toEqual({ cursor: 'cursor-1', limit: 25 });
    expect(resumed.map((page) => page.items.map((item) => item.externalId))).toEqual([
      ['item:5550000004'],
      ['item:5550000006'],
    ]);
    expect(cursorOf(resumed.at(-1))?.from).toBe(END_FROM);
  });

  it('repart du début du tableau quand l’outil dit que le curseur a expiré', async () => {
    const { pages, calls } = sync(
      [
        api({ json: errorCursor }),
        api({ json: itemsBoard1Page1 }),
        api({ json: itemsBoard1Page2 }),
      ],
      roundCursor({ boards: ['1111111111'], after: 'cursor-expiré' }),
    );
    const all = await pages;

    expect(all[0]?.items).toEqual([]);
    expect(cursorOf(all[0])).toMatchObject({ boards: ['1111111111'], after: null });
    expect(bodyOf(calls[1]).variables.ids).toEqual(['1111111111']);
    expect(all.flatMap((page) => page.items)).toHaveLength(3);
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { pages, calls } = sync(
      [api({ json: boards }), api({ json: itemsEmpty }), api({ json: itemsEmpty })],
      'pas du json',
    );
    const all = await pages;

    expect(bodyOf(calls[0]).query).toMatch(/boards\(limit/);
    expect(all).toHaveLength(2);
    expect(cursorOf(all.at(-1))?.from).toBe(END_FROM);
    // Premier tour : la date de départ des éléments est since.
    expect(cursorOf(all[0])?.from).toBe(SINCE.toISOString());
  });

  it('ne rend rien quand rien n’a changé, mais garde la nouvelle date de départ', async () => {
    const all = await sync([
      api({ json: boards }),
      api({ json: itemsEmpty }),
      api({ json: itemsEmpty }),
    ]).pages;

    expect(all.flatMap((page) => page.items)).toEqual([]);
    expect(cursorOf(all.at(-1))?.boards).toBeNull();
  });

  it('rend une page vide avec le curseur de fin quand il n’y a aucun tableau', async () => {
    const all = await sync([api({ json: boardsNone })]).pages;

    expect(all).toHaveLength(1);
    expect(all[0]?.items).toEqual([]);
    expect(cursorOf(all[0])).toEqual({ from: END_FROM, started: null, boards: null, after: null });
  });

  it('lit la liste des tableaux page par page tant que l’outil en rend 50', async () => {
    const fullPage = {
      data: {
        boards: Array.from({ length: 50 }, (_, i) => ({ id: String(100 + i), type: 'board' })),
      },
    };
    const { calls } = await firstPage([
      api({ json: fullPage }),
      api({ json: boardsNone }),
      api({ json: itemsEmpty }),
    ]);

    expect(calls.slice(0, 2).map((call) => bodyOf(call).variables)).toEqual([
      { limit: 50, page: 1 },
      { limit: 50, page: 2 },
    ]);
    expect(bodyOf(calls[2]).variables.ids).toEqual(['100']);
  });

  it('s’arrête si l’outil répète la même page de tableaux', async () => {
    const same = {
      data: {
        boards: Array.from({ length: 50 }, (_, i) => ({ id: String(100 + i), type: 'board' })),
      },
    };
    const { calls } = await firstPage([
      api({ json: same }),
      api({ json: same }),
      api({ json: itemsEmpty }),
    ]);

    expect(calls.slice(0, 2).map((call) => bodyOf(call).variables.page)).toEqual([1, 2]);
    expect(bodyOf(calls[2]).variables.ids).toEqual(['100']);
  });
});

describe('mondayConnector : ressources secondaires', () => {
  it('livre les autres tableaux quand l’outil refuse l’accès à l’un (403)', async () => {
    const all = await sync([
      api({ json: boards }),
      api({ status: 403, json: {} }),
      api({ json: itemsBoard3 }),
    ]).pages;

    expect(all.flatMap((page) => page.items.map((item) => item.externalId))).toEqual([
      'item:5550000006',
    ]);
  });

  it('livre les autres tableaux quand un tableau n’est plus accessible', async () => {
    const all = await sync([
      api({ json: boards }),
      api({ json: errorInvalidBoard }),
      api({ json: itemsBoard3 }),
    ]).pages;

    expect(all.flatMap((page) => page.items.map((item) => item.externalId))).toEqual([
      'item:5550000006',
    ]);
  });

  it('livre les autres tableaux quand un droit manque sur l’un d’eux', async () => {
    const all = await sync([
      api({ json: boards }),
      api({ json: errorForbidden }),
      api({ json: itemsBoard3 }),
    ]).pages;

    expect(all.flatMap((page) => page.items)).toHaveLength(1);
  });

  it('ne rend rien pour un tableau que l’outil ne renvoie pas', async () => {
    const all = await sync([
      api({ json: boards }),
      api({ json: { data: { boards: [] } } }),
      api({ json: itemsEmpty }),
    ]).pages;

    expect(all.flatMap((page) => page.items)).toEqual([]);
  });
});

describe('mondayConnector : erreurs', () => {
  it('remonte une clé refusée sur la liste des tableaux', async () => {
    const { pages } = sync([api({ status: 401, json: {} })]);

    await expect(pages).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un refus de droits sur la liste des tableaux', async () => {
    const { pages } = sync([api({ status: 403, json: {} })]);

    await expect(pages).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte une clé refusée au milieu du passage, après avoir livré la première page', async () => {
    const { http } = testHttp(mondayConnector, CONFIG, [
      api({ json: boards }),
      api({ json: itemsBoard1Page1 }),
      api({ status: 401, json: {} }),
    ]);
    const seen: SyncPage[] = [];

    const run = (async () => {
      for await (const page of mondayConnector.sync(CONFIG, { cursor: null, since: SINCE }, http)) {
        seen.push(page);
      }
    })();

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
    expect(seen).toHaveLength(1);
  });

  it.each([
    ['la complexité', errorComplexity],
    ['la limite du jour', errorDailyLimit],
  ])(
    'convertit %s en limite atteinte, sans reprendre le texte de l’outil',
    async (_name, fixture) => {
      const { pages } = sync([api({ json: fixture })]);

      const error = await pages.catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConnectorHttpError);
      expect((error as ConnectorHttpError).status).toBe(429);
      expect((error as Error).message).toBe('monday.com rate limit reached');
    },
  );

  it('reprend après un 429 puis réussit', async () => {
    const { pages } = sync([
      api({ status: 429, headers: { 'retry-after': '3' }, json: {} }),
      api({ json: boardsNone }),
    ]);

    await expect(pages).resolves.toHaveLength(1);
  });

  it('convertit toute autre erreur en message fixe, sans le texte de l’outil ni le jeton', async () => {
    const { pages } = sync([api({ json: errorValidation })]);

    const error = await pages.catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect((error as Error).message).toBe('monday.com rejected the request');
    expect((error as Error).message).not.toContain('texte-de-l-outil');
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('refuse une réponse sans données ni erreurs', async () => {
    const { pages } = sync([api({ json: {} })]);

    await expect(pages).rejects.toMatchObject({ message: 'Unexpected response' });
  });

  it('refuse une réponse dont les données n’ont pas la forme attendue', async () => {
    const { pages } = sync([api({ json: { data: { boards: 'non' } } })]);

    await expect(pages).rejects.toMatchObject({ message: 'Unexpected response' });
  });
});

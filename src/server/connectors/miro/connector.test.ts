import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError } from '../http';
import { normalizeItem } from '../normalize';
import { BOARDS_PER_PAGE, ITEM_PAGES_MAX } from './client';
import { miroConnector } from './connector';
import boardsPage1 from './fixtures/boards-page1.json';
import itemsPage1 from './fixtures/items-atelier-page1.json';
import itemsPage2 from './fixtures/items-atelier-page2.json';
import itemsEmpty from './fixtures/items-vide.json';
import tokenContext from './fixtures/token-context.json';

// Le connecteur Miro, avec le jeton du bouton : vérification, relève des tableaux, curseur.

const ACCESS = `acces-${randomBytes(12).toString('hex')}`;
const TEAM = '3074457362577833142';
const API = 'https://api.miro.com';
const SINCE = new Date('2026-09-15T00:00:00Z');
const CONFIG = {
  authMode: 'oauth',
  accessToken: ACCESS,
  refreshToken: 'rafraichir-exemple',
  expiresAt: null,
  teamId: TEAM,
};

const ATELIER = 'uXjVAcme2026Atelier=';
const VIDE = 'uXjVAcme2026Vide=';

const boardsUrl = `${API}/v2/boards`;
const itemsUrl = (boardId: string) => `${API}/v2/boards/${encodeURIComponent(boardId)}/items`;
const boardsRoute = (json: unknown): FakeRoute => ({ url: boardsUrl, json });
const itemsRoute = (boardId: string, json: unknown, status = 200): FakeRoute => ({
  url: itemsUrl(boardId),
  status,
  json,
});

const config = miroConnector.configSchema.parse(CONFIG);

type Cursor = { at: string; ids: string[] };
const cursorOf = (page: { cursor: string } | undefined): Cursor =>
  JSON.parse(page?.cursor ?? 'null') as Cursor;

function run(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(miroConnector, CONFIG, routes);
  return { pages: collect(miroConnector.sync(config, { cursor, since: SINCE }, http)), calls };
}

// Un tableau de la liste, modifié à la seconde `second` du 1er octobre 2026.
const boardAt = (id: string, modifiedAt: string | null, extra: Record<string, unknown> = {}) => ({
  type: 'board',
  id,
  name: `Tableau ${id}`,
  description: `Description ${id}`,
  ...(modifiedAt ? { modifiedAt } : {}),
  ...extra,
});
const second = (n: number) => `2026-10-01T10:00:${String(n).padStart(2, '0')}Z`;
const listOf = (...boards: unknown[]) => ({ data: boards, total: boards.length });

describe('verify', () => {
  it('lit le contexte du jeton avec le jeton en Bearer, et rend le compte et l’équipe', async () => {
    const { http, calls } = testHttp(miroConnector, CONFIG, [
      { url: `${API}/v1/oauth-token`, json: tokenContext },
    ]);

    await expect(miroConnector.verify(config, http)).resolves.toEqual({
      account: 'Marie Durand (Acme)',
      accountKey: '3074457362577955221:3074457362577833142',
    });

    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${ACCESS}`);
  });

  it('rend un compte lisible même sans nom d’équipe', async () => {
    const { http } = testHttp(miroConnector, CONFIG, [
      {
        url: `${API}/v1/oauth-token`,
        json: { type: 'oAuthToken', user: { name: 'Marie Durand' } },
      },
    ]);

    await expect(miroConnector.verify(config, http)).resolves.toEqual({ account: 'Marie Durand' });
  });

  it('remonte un jeton refusé (401) pour que le socle le renouvelle', async () => {
    const { http } = testHttp(miroConnector, CONFIG, [
      { url: `${API}/v1/oauth-token`, status: 401, json: { status: 401, code: 'tokenNotFound' } },
    ]);

    await expect(miroConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('sync : premier passage', () => {
  it('lit les tableaux de l’équipe modifiés depuis since, du plus ancien au plus récent', async () => {
    const { pages, calls } = run([
      boardsRoute(boardsPage1),
      itemsRoute(ATELIER, itemsPage1),
      itemsRoute(ATELIER, itemsPage2),
      itemsRoute(VIDE, itemsEmpty),
    ]);

    const result = await pages;

    const list = new URL(calls[0]?.url ?? '');
    expect(`${list.origin}${list.pathname}`).toBe(boardsUrl);
    expect(Object.fromEntries(list.searchParams)).toEqual({
      team_id: TEAM,
      sort: 'last_created',
      limit: String(BOARDS_PER_PAGE),
      offset: '0',
    });
    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${ACCESS}`);
    // Le tableau de 2025 est antérieur à since : ses éléments ne sont pas lus.
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/v2/boards',
      `/v2/boards/${encodeURIComponent(ATELIER)}/items`,
      `/v2/boards/${encodeURIComponent(ATELIER)}/items`,
      `/v2/boards/${encodeURIComponent(VIDE)}/items`,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.items).toHaveLength(1); // le tableau sans texte n'est pas rendu
  });

  it('rend le tableau comme une page, avec tous les textes lus, cadres compris', async () => {
    const { pages } = run([
      boardsRoute(boardsPage1),
      itemsRoute(ATELIER, itemsPage1),
      itemsRoute(ATELIER, itemsPage2),
      itemsRoute(VIDE, itemsEmpty),
    ]);

    const [item] = (await pages).flatMap((page) => page.items);

    expect(item).toEqual({
      externalId: `board:${ATELIER}`,
      nature: 'page',
      title: 'Atelier feuille de route',
      url: `https://miro.com/app/board/${ATELIER}/`,
      updatedAt: '2026-10-02T09:30:00.000Z',
      origin: { team: 'Acme', project: 'Produit' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: null },
          text: [
            'Priorités du quatrième trimestre.',
            '',
            '- Objectif : 10 clients & 2 partenaires',
            '',
            '## Idées',
            '- Refaire l’accueil',
            '  avant fin novembre',
            '- Brancher Miro : Lire les tableaux de l’équipe',
          ].join('\n'),
          ts: '2026-10-02T09:30:00.000Z',
        },
      ],
    });
    expect(item && normalizeItem(item, 'miro')).not.toBeNull();
  });

  it('lit les éléments page par page : le second appel porte le curseur de Miro', async () => {
    const { pages, calls } = run([
      boardsRoute(boardsPage1),
      itemsRoute(ATELIER, itemsPage1),
      itemsRoute(ATELIER, itemsPage2),
      itemsRoute(VIDE, itemsEmpty),
    ]);
    await pages;

    const [first, next] = calls.slice(1).map((call) => new URL(call.url).searchParams);
    expect(Object.fromEntries(first ?? [])).toEqual({ limit: '50' });
    expect(Object.fromEntries(next ?? [])).toEqual({
      limit: '50',
      cursor: itemsPage1.cursor,
    });
  });

  it('garde en curseur le dernier tableau passé, même sans texte, et ne refait pas le passage', async () => {
    const routes = [
      boardsRoute(boardsPage1),
      itemsRoute(ATELIER, itemsPage1),
      itemsRoute(ATELIER, itemsPage2),
      itemsRoute(VIDE, itemsEmpty),
    ];
    const [page] = await run(routes).pages;

    expect(cursorOf(page)).toEqual({ at: '2026-10-03T10:00:00.000Z', ids: [VIDE] });

    const again = run([boardsRoute(boardsPage1)], page?.cursor);
    expect(await again.pages).toEqual([]);
    expect(again.calls).toHaveLength(1); // la liste, et aucune lecture d'éléments
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { pages } = run(
      [
        boardsRoute(boardsPage1),
        itemsRoute(ATELIER, itemsPage1),
        itemsRoute(ATELIER, itemsPage2),
        itemsRoute(VIDE, itemsEmpty),
      ],
      'pas du json',
    );

    expect((await pages).flatMap((page) => page.items)).toHaveLength(1);
  });
});

describe('sync : plusieurs pages', () => {
  const board = (n: number) => boardAt(`b${n}=`, second(n));
  const note = (n: number) => ({
    data: [{ id: `n${n}`, type: 'sticky_note', data: { content: `<p>Note ${n}</p>` } }],
  });

  it('rend les tableaux par lots de cinq, avec un curseur après chaque lot', async () => {
    const numbers = Array.from({ length: 12 }, (_, i) => i + 1);
    const routes = [
      boardsRoute(listOf(...numbers.toReversed().map(board))),
      ...numbers.map((n) => itemsRoute(`b${n}=`, note(n))),
    ];

    const { pages } = run(routes);
    const result = await pages;

    expect(result.map((page) => page.items.length)).toEqual([5, 5, 2]);
    expect(result.map((page) => cursorOf(page).ids.at(-1))).toEqual(['b5=', 'b10=', 'b12=']);
    expect(result.flatMap((page) => page.items.map((item) => item.externalId))).toEqual(
      numbers.map((n) => `board:b${n}=`),
    );

    const again = run([boardsRoute(listOf(...numbers.map(board)))], result.at(-1)?.cursor);
    expect(await again.pages).toEqual([]);
  });

  it('reprend après un instant partagé : seuls les tableaux pas encore lus sont rendus', async () => {
    const same = second(30);
    const mark = JSON.stringify({ at: new Date(same).toISOString(), ids: ['a='] });
    const routes = [
      boardsRoute(listOf(boardAt('a=', same), boardAt('b=', same), boardAt('c=', second(29)))),
      itemsRoute('b=', note(2)),
    ];

    const { pages } = run(routes, mark);
    const result = await pages;

    expect(result.flatMap((page) => page.items.map((item) => item.externalId))).toEqual([
      'board:b=',
    ]);
    expect(cursorOf(result[0])).toEqual({
      at: new Date(same).toISOString(),
      ids: ['a=', 'b='],
    });
  });

  it('lit la liste des tableaux page par page, par décalage', async () => {
    const old = Array.from({ length: BOARDS_PER_PAGE }, (_, i) =>
      boardAt(`old${i}=`, '2025-01-01T00:00:00Z'),
    );
    const routes = [
      boardsRoute({ data: old, total: BOARDS_PER_PAGE + 1 }),
      boardsRoute({ data: [board(7)], total: BOARDS_PER_PAGE + 1 }),
      itemsRoute('b7=', note(7)),
    ];

    const { pages, calls } = run(routes);

    expect((await pages).flatMap((page) => page.items.map((item) => item.externalId))).toEqual([
      'board:b7=',
    ]);
    expect(new URL(calls[1]?.url ?? '').searchParams.get('offset')).toBe(String(BOARDS_PER_PAGE));
  });

  it('ne lit pas plus de pages d’éléments que le plafond', async () => {
    const pagesOfItems = Array.from({ length: ITEM_PAGES_MAX + 5 }, (_, i) =>
      itemsRoute('b1=', { ...note(i), cursor: `suite-${i + 1}` }),
    );

    const { pages, calls } = run([boardsRoute(listOf(board(1))), ...pagesOfItems]);
    const [item] = (await pages).flatMap((page) => page.items);

    expect(calls.filter((call) => call.url.includes('/items'))).toHaveLength(ITEM_PAGES_MAX);
    expect(item?.turns[0]?.text).toContain('Note 0');
  });

  it('s’arrête quand Miro rend deux fois le même curseur', async () => {
    const loop = { ...note(1), cursor: 'toujours-pareil' };
    const { pages, calls } = run([
      boardsRoute(listOf(board(1))),
      itemsRoute('b1=', loop),
      itemsRoute('b1=', loop),
      itemsRoute('b1=', loop),
    ]);
    await pages;

    expect(calls.filter((call) => call.url.includes('/items'))).toHaveLength(2);
  });
});

describe('sync : dates et accès', () => {
  const note = { data: [{ id: 'n1', type: 'sticky_note', data: { content: '<p>Texte</p>' } }] };

  it('lit la date de la doc (« 2026-10-04 08:15:00+00:00 ») et se rabat sur la création', async () => {
    const routes = [
      boardsRoute(
        listOf(
          boardAt('a=', '2026-10-04 08:15:00+00:00'),
          boardAt('b=', null, { createdAt: '2026-10-05T08:00:00Z' }),
          boardAt('c=', null), // aucune date : ni lu ni rendu
        ),
      ),
      itemsRoute('a=', note),
      itemsRoute('b=', note),
    ];

    const { pages, calls } = run(routes);
    const items = (await pages).flatMap((page) => page.items);

    expect(items.map((item) => [item.externalId, item.updatedAt])).toEqual([
      ['board:a=', '2026-10-04T08:15:00.000Z'],
      ['board:b=', '2026-10-05T08:00:00.000Z'],
    ]);
    expect(calls.some((call) => call.url.includes('c%3D'))).toBe(false);
  });

  it.each([403, 404])(
    'rend la description seule d’un tableau dont les éléments répondent %s',
    async (status) => {
      const routes = [
        boardsRoute(listOf(boardAt('a=', second(1)))),
        itemsRoute('a=', { status, message: 'refusé' }, status),
      ];

      const { pages } = run(routes);
      const [item] = (await pages).flatMap((page) => page.items);

      expect(item?.turns.map((turn) => turn.text)).toEqual(['Description a=']);
    },
  );

  it('remonte un 401 sur les éléments', async () => {
    const { pages } = run([
      boardsRoute(listOf(boardAt('a=', second(1)))),
      itemsRoute('a=', { status: 401 }, 401),
    ]);

    await expect(pages).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un 401 sur la liste des tableaux', async () => {
    const { pages } = run([{ url: boardsUrl, status: 401, json: { status: 401 } }]);

    await expect(pages).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lit la liste sans équipe quand la connexion n’en garde pas', async () => {
    const noTeam = { ...CONFIG, teamId: null };
    const { http, calls } = testHttp(miroConnector, noTeam, [boardsRoute(listOf())]);

    await collect(
      miroConnector.sync(
        miroConnector.configSchema.parse(noTeam),
        { cursor: null, since: SINCE },
        http,
      ),
    );

    expect(new URL(calls[0]?.url ?? '').searchParams.has('team_id')).toBe(false);
  });
});

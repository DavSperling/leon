import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { confluenceConnector } from './connector';
import comments10002Page1 from './fixtures/comments-10002-page1.json';
import comments10002Page2 from './fixtures/comments-10002-page2.json';
import childrenOf20001 from './fixtures/comments-children-20001.json';
import commentsEmpty from './fixtures/comments-empty.json';
import page10001 from './fixtures/page-10001.json';
import page10002 from './fixtures/page-10002.json';
import page10003 from './fixtures/page-10003.json';
import page10004 from './fixtures/page-10004.json';
import pagesPage1 from './fixtures/pages-page1.json';
import pagesPage2 from './fixtures/pages-page2.json';
import spaces from './fixtures/spaces.json';
import userCurrent from './fixtures/user-current.json';
import usersBulk from './fixtures/users-bulk.json';

const SITE = 'https://acme.atlassian.net';
const V2 = `${SITE}/wiki/api/v2`;
const TOKEN = 'jeton-de-test-0123456789';
const config = { site: 'acme', email: 'marie@acme.test', apiToken: TOKEN };
const BASIC = `Basic ${Buffer.from(`marie@acme.test:${TOKEN}`).toString('base64')}`;
const SINCE = new Date('2026-09-15T00:00:00Z');

const MARIE = '5b10ac8d82e05b22cc7d4ef5';
const PAUL = '712020:2c1b7a5e-3f4d-4a6b-9c8d-0123456789ab';
const DAVID = '712020:9d8c7b6a-5e4f-4d3c-8b2a-fedcba987654';

// Confluence donne l'adresse de la page suivante dans l'en-tête Link, en relatif.
const linkTo = (next: string) => ({
  link: `<${next}>; rel="next", <${SITE}/wiki>; rel="base"`,
});
const listRoute = (json: unknown, next?: string): FakeRoute => ({
  url: `${V2}/pages`,
  json,
  ...(next ? { headers: linkTo(next) } : {}),
});
const pageRoutes = (id: string, page: unknown, comments: unknown = commentsEmpty): FakeRoute[] => [
  { url: `${V2}/pages/${id}`, json: page },
  { url: `${V2}/pages/${id}/footer-comments`, json: comments },
];
const directoryRoutes = (): FakeRoute[] => [
  { method: 'POST', url: `${V2}/users-bulk`, json: usersBulk },
  { url: `${V2}/spaces`, json: spaces },
];

// Toutes les routes d'un premier passage sur les fixtures : quatre pages, dont une vide.
function firstPassRoutes(): FakeRoute[] {
  return [
    listRoute(pagesPage1, pagesPage1._links.next),
    listRoute(pagesPage2),
    ...pageRoutes('10004', page10004),
    ...pageRoutes('10003', page10003),
    { url: `${V2}/pages/10002`, json: page10002 },
    {
      url: `${V2}/pages/10002/footer-comments`,
      json: comments10002Page1,
      headers: linkTo(comments10002Page1._links.next),
    },
    { url: `${V2}/pages/10002/footer-comments`, json: comments10002Page2 },
    { url: `${V2}/footer-comments/20001/children`, json: childrenOf20001 },
    { url: `${V2}/footer-comments/20002/children`, json: commentsEmpty },
    { url: `${V2}/footer-comments/20003/children`, json: commentsEmpty },
    ...pageRoutes('10001', page10001),
    ...directoryRoutes(),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(confluenceConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(confluenceConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) => new URL(url ?? '').searchParams;
const callsTo = (calls: Array<{ url: string }>, path: string) =>
  calls.filter((call) => call.url.split('?')[0] === `${V2}${path}`);

describe('confluence : configuration', () => {
  const schema = confluenceConnector.configSchema;

  it('accepte un site, un e-mail et un jeton, sans les espaces autour', () => {
    const parsed = schema.parse({
      site: ' Acme ',
      email: ' marie@acme.test ',
      apiToken: ` ${TOKEN} `,
    });

    expect(parsed).toEqual({ site: 'acme', email: 'marie@acme.test', apiToken: TOKEN });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({ email: config.email, apiToken: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ site: 'acme', apiToken: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ site: 'acme', email: config.email }).success).toBe(false);
    expect(schema.safeParse({ ...config, apiToken: '   ' }).success).toBe(false);
  });

  it('refuse un e-mail invalide', () => {
    for (const email of ['', 'marie', 'marie@', '@acme.test', 'marie acme@test.fr']) {
      expect(schema.safeParse({ ...config, email }).success, email).toBe(false);
    }
  });

  it('refuse un sous-domaine qui n’en est pas un', () => {
    for (const site of [
      'evil.com/x',
      'a.b',
      'a_b',
      '-acme',
      '',
      'acme.atlassian.net',
      'a'.repeat(64),
    ]) {
      expect(schema.safeParse({ ...config, site }).success, site).toBe(false);
    }
    expect(schema.safeParse({ ...config, site: 'a'.repeat(63) }).success).toBe(true);
  });

  it('fixe l’hôte d’après le site et le champ à chiffrer', () => {
    expect(confluenceConnector.hosts(config)).toEqual(['acme.atlassian.net']);
    expect(confluenceConnector.secretFields).toEqual(['apiToken']);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('confluence')).toBe(confluenceConnector);
    expect(listCatalog().find((item) => item.id === 'confluence')?.available).toBe(true);
  });
});

describe('confluence : verify', () => {
  it('lit le compte courant avec l’authentification de base', async () => {
    const { http, calls } = testHttp(confluenceConnector, config, [
      { url: `${SITE}/wiki/rest/api/user/current`, json: userCurrent },
    ]);

    const result = await confluenceConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (acme)' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${SITE}/wiki/rest/api/user/current`);
    expect(calls[0]?.headers).toMatchObject({ authorization: BASIC, accept: 'application/json' });
  });

  it('se rabat sur le nom public quand le nom affiché manque', async () => {
    const { http } = testHttp(confluenceConnector, config, [
      { url: `${SITE}/wiki/rest/api/user/current`, json: { ...userCurrent, displayName: null } },
    ]);

    expect(await confluenceConnector.verify(config, http)).toEqual({ account: 'Marie (acme)' });
  });

  it('refuse une clé rejetée, par un 401 comme par une réponse anonyme', async () => {
    const refused = testHttp(confluenceConnector, config, [
      { url: `${SITE}/wiki/rest/api/user/current`, status: 401, json: { message: 'Unauthorized' } },
    ]);
    await expect(confluenceConnector.verify(config, refused.http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );

    const anonymous = testHttp(confluenceConnector, config, [
      {
        url: `${SITE}/wiki/rest/api/user/current`,
        json: { type: 'anonymous', displayName: 'Anonymous' },
      },
    ]);
    await expect(confluenceConnector.verify(config, anonymous.http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });
});

describe('confluence : premier passage', () => {
  it('liste du plus récent au plus ancien, jusqu’à since, puis rend les pages de la plus ancienne à la plus récente', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    // 10005 est antérieure à since : jamais lue. 10004 n’a pas de texte : pas d’élément.
    expect(idsOf(pages)).toEqual(['page:10003', 'page:10002', 'page:10001']);
    expect(pages).toHaveLength(1);
    const dates = itemsOf(pages).map((item) => item.updatedAt);
    expect(dates).toEqual([...dates].sort());
    expect(calls.some((call) => call.url.includes('10005'))).toBe(false);

    const list = calls[0];
    expect(list?.method).toBe('GET');
    expect(list?.url.split('?')[0]).toBe(`${V2}/pages`);
    expect(Object.fromEntries(paramsOf(list?.url))).toEqual({
      sort: '-modified-date',
      status: 'current',
      limit: '250',
    });
    expect(list?.headers).toMatchObject({ authorization: BASIC });
  });

  it('suit l’adresse de la page suivante sans répéter les paramètres', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const lists = callsTo(calls, '/pages');
    expect(lists).toHaveLength(2);
    const second = paramsOf(lists[1]?.url);
    expect(second.get('cursor')).toBe('eyJpZCI6IjEwMDAyIiwic29ydCI6Ii1tb2RpZmllZC1kYXRlIn0');
    for (const name of ['sort', 'status', 'limit'])
      expect(second.getAll(name), name).toHaveLength(1);
  });

  it('rend une page avec son corps en texte, son auteur, son lien et son origine', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const roadmap = itemsOf(pages).find((item) => item.externalId === 'page:10001');
    expect(roadmap).toEqual({
      externalId: 'page:10001',
      nature: 'page',
      title: 'Feuille de route T4',
      url: `${SITE}/wiki/spaces/PROD/pages/10001/Feuille+de+route+T4`,
      updatedAt: '2026-10-14T09:30:12.000Z',
      origin: { site: 'acme', space: 'PROD' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          // L’auteur est le créateur de la page (Marie), pas celui de la dernière version (Paul).
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: [
            'Objectifs du quatrième trimestre',
            '',
            'Nous livrons la version 2 de l’application avant le 2026-12-15.',
            '',
            '- Refonte de l’onboarding',
            '- Export CSV des rapports',
            '',
            'Décision',
            '',
            'Le périmètre est gelé le 31 octobre.',
            '',
            '- [ ] Valider le budget avec la direction',
            '- [x] Recruter un second développeur',
            '',
            'pnpm build && pnpm test',
            '',
            'Voir la procédure d’astreinte.',
            '',
            'Jalon Date',
            'Bêta 1er novembre',
          ].join('\n'),
          ts: '2026-10-14T09:30:12.000Z',
        },
      ],
    });
  });

  it('range le corps puis les commentaires et leurs réponses, chacun à sa date', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const committee = itemsOf(pages).find((item) => item.externalId === 'page:10002');
    expect(
      committee?.turns.map((turn) => [turn.externalId, turn.role, turn.author, turn.ts]),
    ).toEqual([
      [
        'body',
        'document',
        { name: 'Paul Martin', email: 'paul@acme.test' },
        '2026-10-12T16:05:00.000Z',
      ],
      [
        'comment:20001',
        'participant',
        { name: 'Paul Martin', email: 'paul@acme.test' },
        '2026-10-12T17:20:00.000Z',
      ],
      // David masque son adresse : le champ revient vide, donc pas d’e-mail.
      [
        'comment:20003',
        'participant',
        { name: 'David Roux', email: null },
        '2026-10-12T18:45:00.000Z',
      ],
      [
        'comment:20002',
        'participant',
        { name: 'Marie Durand', email: 'marie@acme.test' },
        '2026-10-13T09:00:00.000Z',
      ],
    ]);
    expect(committee?.turns[0]?.text).toBe(
      'Ordre du jour\n\n- Tarifs\n- Calendrier de la bêta\n\nPaul propose de reporter la bêta au 1er décembre.',
    );
    expect(committee?.turns[3]?.text).toBe('Décision : la bêta est reportée au 1er décembre.');
  });

  it('demande le corps au format de stockage, les commentaires en pages de 250 et suit leur Link', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(paramsOf(callsTo(calls, '/pages/10001')[0]?.url).get('body-format')).toBe('storage');
    const comments = callsTo(calls, '/pages/10002/footer-comments');
    expect(comments).toHaveLength(2);
    for (const call of comments) {
      expect(paramsOf(call.url).getAll('body-format')).toEqual(['storage']);
    }
    expect(paramsOf(comments[0]?.url).get('limit')).toBe('250');
    expect(paramsOf(comments[0]?.url).get('status')).toBe('current');
    expect(paramsOf(comments[1]?.url).get('cursor')).toBe('eyJpZCI6IjIwMDAxIn0');
    expect(
      paramsOf(callsTo(calls, '/footer-comments/20001/children')[0]?.url).get('body-format'),
    ).toBe('storage');
  });

  it('cherche les noms et les espaces en une fois pour tout le lot', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const users = calls.filter((call) => call.url === `${V2}/users-bulk`);
    expect(users).toHaveLength(1);
    expect(users[0]?.method).toBe('POST');
    expect(users[0]?.body).toEqual({ accountIds: [MARIE, PAUL, DAVID] });
    const lookups = callsTo(calls, '/spaces');
    expect(lookups).toHaveLength(1);
    expect(paramsOf(lookups[0]?.url).get('ids')).toBe('262146,262200');
  });

  it('enregistre le curseur de la dernière page lue, avec les pages de cette date', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({ at: '2026-10-14T09:30:12.000Z', ids: ['10001'] });
  });

  it('rend des éléments que le socle accepte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'confluence');
      expect(normalized, item.externalId).not.toBeNull();
      expect(normalized?.turns.length).toBe(item.turns.length);
    }
  });
});

// Une page de plus, à une minute d’écart de la précédente.
const minute = (index: number) => new Date(Date.UTC(2026, 9, 1, 10, index)).toISOString();
const generated = (index: number, id = String(30000 + index), at = minute(index)) => {
  const version = { ...page10002.version, createdAt: at, authorId: PAUL };
  const stub = { ...pagesPage1.results[0], id, title: `Page ${index}`, authorId: PAUL, version };
  const page = {
    ...page10002,
    id,
    title: `Page ${index}`,
    authorId: PAUL,
    version,
    body: { storage: { representation: 'storage', value: `<p>Texte de la page ${index}.</p>` } },
  };
  return { id, stub, page };
};

describe('confluence : passages suivants', () => {
  const all = Array.from({ length: 12 }, (_, index) => generated(index + 1));
  const newestFirst = { results: all.map((entry) => entry.stub).reverse(), _links: {} };

  it('rend dix pages à la fois, avec un curseur après chaque lot', async () => {
    const routes = [
      listRoute(newestFirst),
      ...all.flatMap((entry) => pageRoutes(entry.id, entry.page)),
      ...directoryRoutes(),
    ];
    const { pages, calls } = await runSync(routes);

    expect(pages.map((page) => page.items.length)).toEqual([10, 2]);
    expect(idsOf(pages)).toEqual(all.map((entry) => `page:${entry.id}`));
    expect(cursorOf(pages[0])).toEqual({ at: minute(10), ids: ['30010'] });
    expect(cursorOf(pages[1])).toEqual({ at: minute(12), ids: ['30012'] });
    // Les noms et les espaces déjà connus ne sont pas redemandés pour le second lot.
    expect(calls.filter((call) => call.url === `${V2}/users-bulk`)).toHaveLength(1);
    expect(callsTo(calls, '/spaces')).toHaveLength(1);
  });

  it('reprend juste après le curseur : la page du curseur n’est pas relue', async () => {
    const routes = [
      listRoute(newestFirst),
      ...all.slice(10).flatMap((entry) => pageRoutes(entry.id, entry.page)),
      ...directoryRoutes(),
    ];
    const cursor = JSON.stringify({ at: minute(10), ids: ['30010'] });
    const { pages, calls } = await runSync(routes, { cursor });

    expect(idsOf(pages)).toEqual(['page:30011', 'page:30012']);
    expect(calls.some((call) => call.url.includes('/pages/30010'))).toBe(false);
  });

  it('ne refait rien avec le dernier curseur rendu', async () => {
    const cursor = JSON.stringify({ at: minute(12), ids: ['30012'] });
    const { pages, calls } = await runSync([listRoute(newestFirst)], { cursor });

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('reprend les pages de la même date que le curseur qui n’ont pas encore été rendues', async () => {
    const twin = generated(5);
    const sibling = generated(5, '39999');
    const list = { results: [twin.stub, sibling.stub], _links: {} };
    const routes = [listRoute(list), ...pageRoutes('39999', sibling.page), ...directoryRoutes()];
    const cursor = JSON.stringify({ at: minute(5), ids: [twin.id] });
    const { pages } = await runSync(routes, { cursor });

    expect(idsOf(pages)).toEqual(['page:39999']);
    expect(cursorOf(pages[0])).toEqual({ at: minute(5), ids: [twin.id, '39999'] });
  });

  it('ne relit pas une page modifiée une milliseconde avant le curseur', async () => {
    const current = generated(5);
    const older = generated(5, '39998', '2026-10-01T10:04:59.999Z');
    const list = { results: [current.stub, older.stub], _links: {} };
    const routes = [listRoute(list), ...pageRoutes(current.id, current.page), ...directoryRoutes()];
    const { pages } = await runSync(routes, { cursor: JSON.stringify({ at: minute(5), ids: [] }) });

    expect(idsOf(pages)).toEqual(['page:30005']);
  });

  it('garde dans le curseur les pages de même date réparties sur deux lots', async () => {
    const entries = [
      ...all.slice(0, 10),
      generated(11, '30011', minute(10)), // même instant que la dixième
    ];
    const list = { results: entries.map((entry) => entry.stub).reverse(), _links: {} };
    const routes = [
      listRoute(list),
      ...entries.flatMap((entry) => pageRoutes(entry.id, entry.page)),
      ...directoryRoutes(),
    ];
    const { pages } = await runSync(routes);

    expect(pages.map((page) => page.items.length)).toEqual([10, 1]);
    expect(cursorOf(pages[1])).toEqual({ at: minute(10), ids: ['30010', '30011'] });
  });

  it('ne redemande pas les noms refusés pour le lot suivant', async () => {
    const routes = [
      listRoute(newestFirst),
      ...all.flatMap((entry) => pageRoutes(entry.id, entry.page)),
      {
        method: 'POST' as const,
        url: `${V2}/users-bulk`,
        status: 403,
        json: { message: 'refusé' },
      },
      { url: `${V2}/spaces`, json: spaces },
    ];
    const { pages, calls } = await runSync(routes);

    expect(pages.map((page) => page.items.length)).toEqual([10, 2]);
    expect(calls.filter((call) => call.url === `${V2}/users-bulk`)).toHaveLength(1);
  });

  it('repart de since quand le curseur est illisible', async () => {
    const first = generated(1);
    const routes = [
      listRoute({ results: [first.stub], _links: {} }),
      ...pageRoutes(first.id, first.page),
      ...directoryRoutes(),
    ];
    const { pages } = await runSync(routes, { cursor: 'pas du json', since: new Date(minute(0)) });

    expect(idsOf(pages)).toEqual(['page:30001']);
  });
});

describe('confluence : ressources manquantes ou refusées', () => {
  const denied = (status: number) => ({ status, json: { message: 'refusé' } });

  it('rend la page sans commentaires quand ils sont refusés (403)', async () => {
    const routes = [
      listRoute({ results: [pagesPage1.results[1]], _links: {} }),
      { url: `${V2}/pages/10002`, json: page10002 },
      { url: `${V2}/pages/10002/footer-comments`, ...denied(403) },
      ...directoryRoutes(),
    ];
    const { pages } = await runSync(routes);

    const committee = itemsOf(pages)[0];
    expect(committee?.turns.map((turn) => turn.externalId)).toEqual(['body']);
  });

  it('rend les textes sans nom d’auteur quand l’annuaire est refusé (403)', async () => {
    const routes = [
      listRoute({ results: [pagesPage1.results[1]], _links: {} }),
      ...pageRoutes('10002', page10002),
      { method: 'POST' as const, url: `${V2}/users-bulk`, ...denied(403) },
      { url: `${V2}/spaces`, ...denied(403) },
    ];
    const { pages } = await runSync(routes);

    const committee = itemsOf(pages)[0];
    expect(committee?.turns[0]?.author).toEqual({ name: null, email: null });
    // Sans la fiche de l’espace, l’origine garde son numéro.
    expect(committee?.origin).toEqual({ site: 'acme', space: '262146' });
  });

  it('saute une page retirée (404) ou non lisible (403) depuis la liste, et garde le curseur', async () => {
    const routes = [
      listRoute({
        results: [pagesPage1.results[0], pagesPage1.results[1], pagesPage2.results[0]],
        _links: {},
      }),
      { url: `${V2}/pages/10003`, ...denied(404) },
      { url: `${V2}/pages/10002`, ...denied(403) },
      ...pageRoutes('10001', page10001),
      ...directoryRoutes(),
    ];
    const { pages } = await runSync(routes);

    expect(idsOf(pages)).toEqual(['page:10001']);
    expect(cursorOf(pages[0]).at).toBe('2026-10-14T09:30:12.000Z');
  });

  it('rend une page sans corps mais avec des commentaires', async () => {
    const routes = [
      listRoute({ results: [pagesPage1.results[1]], _links: {} }),
      ...pageRoutes(
        '10002',
        { ...page10002, body: { storage: { value: '<p />' } } },
        comments10002Page2,
      ),
      { url: `${V2}/footer-comments/20002/children`, json: commentsEmpty },
      ...directoryRoutes(),
    ];
    const { pages } = await runSync(routes);

    expect(itemsOf(pages)[0]?.turns.map((turn) => turn.externalId)).toEqual(['comment:20002']);
  });

  it('remonte une clé refusée sur la liste, comme sur une page', async () => {
    const onList = runSync([{ ...listRoute({}), status: 401 }]);
    await expect(onList).rejects.toBeInstanceOf(ConnectorAuthError);

    const routes = [
      listRoute({ results: [pagesPage2.results[0]], _links: {} }),
      { url: `${V2}/pages/10003`, ...denied(401) },
    ];
    await expect(runSync(routes)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse une page suivante annoncée sur un autre hôte', async () => {
    const routes = [listRoute(pagesPage1, 'https://evil.test/wiki/api/v2/pages?cursor=x')];

    const error = await runSync(routes).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect((error as Error).message).toBe('Adresse non autorisée');
  });

  it('refuse une liste sans date de version : réponse inattendue', async () => {
    const broken = { results: [{ id: '1', title: 'x' }], _links: {} };

    await expect(runSync([listRoute(broken)])).rejects.toMatchObject({
      message: 'Réponse inattendue',
    });
  });
});

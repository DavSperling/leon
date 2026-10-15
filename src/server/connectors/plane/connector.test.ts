import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { planeConnector } from './connector';
import commentsEmpty from './fixtures/comments-empty.json';
import commentsWi12 from './fixtures/comments-wi12.json';
import commentsWi13 from './fixtures/comments-wi13.json';
import members from './fixtures/members.json';
import projects from './fixtures/projects.json';
import usersMe from './fixtures/users-me.json';
import workItemsApp from './fixtures/work-items-app.json';
import workItemsSitePage1 from './fixtures/work-items-site-page1.json';
import workItemsSitePage2 from './fixtures/work-items-site-page2.json';

const API = 'https://api.plane.so/api/v2';
const KEY = 'plane_api_cle-de-test-0123456789';
const config = { apiKey: KEY, workspace: 'acme' };
const SINCE = new Date('2026-09-15T00:00:00Z');
const WORKSPACE = `${API}/workspaces/acme`;

const SITE = 'b7e42a19-3c5d-4f80-9a26-8d1c0f4e7b53';
const APP = '5d1f9c2e-7a3b-4e68-8f40-2c9b6a1d7e35';
const MARIE = '2f9c4a71-0b3d-4e58-9a16-7c1e5d8b3f20';
const WI12 = 'c4e81a37-52d9-4b06-a3f1-9e7d2c5b8a14';
const WI13 = '91d6f0b2-3a8e-4c75-b4d9-6f2e1a7c3d58';
const WI14 = '6a2c9e18-7f4b-4d03-8e65-b1d9a3f7c240';
const WI3_APP = 'd3f8b5a6-1e92-4c70-9a4d-2b6e8c0f1a37';

const projectsRoute = (json: unknown = projects, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${WORKSPACE}/projects/`,
  json,
  ...extra,
});
const membersRoute = (json: unknown = members, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${WORKSPACE}/members/`,
  json,
  ...extra,
});
const itemsRoute = (project: string, json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${WORKSPACE}/projects/${project}/work-items/`,
  json,
  ...extra,
});
const commentsRoute = (
  project: string,
  item: string,
  json: unknown,
  extra: Partial<FakeRoute> = {},
): FakeRoute => ({
  url: `${WORKSPACE}/projects/${project}/work-items/${item}/comments/`,
  json,
  ...extra,
});

// Un premier passage sur les deux projets : trois éléments de « Site web » en deux pages, puis un
// élément vide de « Application mobile ».
function firstPassRoutes(): FakeRoute[] {
  return [
    projectsRoute(),
    membersRoute(),
    itemsRoute(SITE, workItemsSitePage1),
    commentsRoute(SITE, WI12, commentsWi12),
    commentsRoute(SITE, WI13, commentsWi13),
    itemsRoute(SITE, workItemsSitePage2),
    commentsRoute(SITE, WI14, commentsEmpty),
    itemsRoute(APP, workItemsApp),
    commentsRoute(APP, WI3_APP, commentsEmpty),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(planeConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(planeConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;
const pathOf = (url: string | undefined) => new URL(url ?? '').pathname;

const offsetPage = (rows: unknown[], next: number | null = null) => ({
  data: rows,
  next,
  previous: null,
  total_count: rows.length,
  pagination: { style: 'offset' },
});
const cursorPage = (rows: unknown[], next: string | null = null) => ({
  data: rows,
  next_cursor: next,
  has_more: next !== null,
  pagination: { style: 'cursor' },
});

function workItem(id: string, updatedAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Élément ${id}`,
    sequence_id: 1,
    description_html: `<p>Texte de ${id}</p>`,
    created_by_id: MARIE,
    updated_by_id: null,
    updated_at: updatedAt,
    ...extra,
  };
}

function comment(id: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    comment_html: `<p>Commentaire ${id}</p>`,
    comment_stripped: `Commentaire ${id}`,
    actor_id: MARIE,
    actor: null,
    hidden_at: null,
    created_at: createdAt,
    ...extra,
  };
}

describe('plane : configuration', () => {
  const schema = planeConnector.configSchema;

  it('accepte une clé et un espace, sans les espaces autour, majuscules et tirets bas compris', () => {
    expect(schema.parse({ apiKey: `  ${KEY} `, workspace: ' acme ' })).toEqual(config);
    expect(schema.parse({ apiKey: KEY, workspace: 'Acme_Equipe-2' }).workspace).toBe(
      'Acme_Equipe-2',
    );
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({ workspace: 'acme' }).success).toBe(false);
    expect(schema.safeParse({ apiKey: '   ', workspace: 'acme' }).success).toBe(false);
    expect(schema.safeParse({ apiKey: KEY }).success).toBe(false);
    expect(schema.safeParse({ apiKey: KEY, workspace: '' }).success).toBe(false);
  });

  it('refuse un espace qui changerait l’adresse appelée', () => {
    for (const workspace of ['acme/x', 'a.b', '..', 'a b', 'acme?x=1', 'acme#', 'a'.repeat(101)]) {
      expect(schema.safeParse({ apiKey: KEY, workspace }).success, workspace).toBe(false);
    }
  });

  it('fixe l’hôte, le champ à chiffrer et le rythme des requêtes (60 par minute)', () => {
    expect(planeConnector.hosts(config)).toEqual(['api.plane.so']);
    expect(planeConnector.secretFields).toEqual(['apiKey']);
    expect(planeConnector.minIntervalMs).toBeGreaterThanOrEqual(1000);
  });

  it('est disponible dans le registre et le catalogue, avec l’avertissement sur les installations hébergées', () => {
    expect(getConnector('plane')).toBe(planeConnector);
    const entry = listCatalog().find((item) => item.id === 'plane');
    expect(entry?.available).toBe(true);
    expect(entry?.warning).toMatch(/hébergée/);
    expect(entry?.fields.map((field) => [field.name, field.kind])).toEqual([
      ['apiKey', 'secret'],
      ['workspace', 'text'],
    ]);
  });
});

describe('plane : verify', () => {
  it('lit le compte puis les projets, avec la clé dans X-Api-Key', async () => {
    const { http, calls } = testHttp(planeConnector, config, [
      { url: `${API}/users/me/`, json: usersMe },
      projectsRoute(),
    ]);

    const result = await planeConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (acme)' });
    expect(calls.map((call) => pathOf(call.url))).toEqual([
      '/api/v2/users/me/',
      '/api/v2/workspaces/acme/projects/',
    ]);
    expect(calls[0]?.headers['x-api-key']).toBe(KEY);
    expect(calls[1]?.headers['x-api-key']).toBe(KEY);
    expect(calls[0]?.headers.authorization).toBeUndefined();
  });

  it('refuse une clé rejetée', async () => {
    const { http } = testHttp(planeConnector, config, [
      {
        url: `${API}/users/me/`,
        status: 401,
        json: { type: 'unauthorized', code: 'unauthorized' },
      },
    ]);

    await expect(planeConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it.each([403, 404])('refuse un espace inaccessible (%i)', async (status) => {
    const { http } = testHttp(planeConnector, config, [
      { url: `${API}/users/me/`, json: usersMe },
      projectsRoute({ type: 'not_found', code: 'not_found' }, { status }),
    ]);

    const failure = await planeConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Espace inaccessible : acme');
  });
});

describe('plane : sync, premier passage', () => {
  it('demande les projets, les membres, puis les éléments modifiés depuis since, du plus ancien au plus récent', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.map((call) => pathOf(call.url))).toEqual([
      '/api/v2/workspaces/acme/projects/',
      '/api/v2/workspaces/acme/members/',
      `/api/v2/workspaces/acme/projects/${SITE}/work-items/`,
      `/api/v2/workspaces/acme/projects/${SITE}/work-items/${WI12}/comments/`,
      `/api/v2/workspaces/acme/projects/${SITE}/work-items/${WI13}/comments/`,
      `/api/v2/workspaces/acme/projects/${SITE}/work-items/`,
      `/api/v2/workspaces/acme/projects/${SITE}/work-items/${WI14}/comments/`,
      `/api/v2/workspaces/acme/projects/${APP}/work-items/`,
      `/api/v2/workspaces/acme/projects/${APP}/work-items/${WI3_APP}/comments/`,
    ]);
    expect(paramsOf(calls[0]?.url)).toEqual({ per_page: '200' });
    expect(paramsOf(calls[1]?.url)).toEqual({ per_page: '200', expand: 'member' });
    expect(paramsOf(calls[2]?.url)).toEqual({
      paginate: 'cursor',
      order_by: 'updated_at',
      updated_at__gte: '2026-09-15T00:00:00.000Z',
      per_page: '50',
      fields: 'id,name,sequence_id,description_html,created_by_id,updated_by_id,updated_at',
    });
    expect(paramsOf(calls[3]?.url)).toEqual({
      order_by: '-created_at',
      per_page: '200',
      expand: 'actor',
    });
  });

  it('reprend les mêmes paramètres à la page suivante, avec le curseur de l’outil', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(paramsOf(calls[5]?.url)).toEqual({
      ...paramsOf(calls[2]?.url),
      cursor: 'b3A9MjAyNi0xMC0wOVQxNDowMjoxMC4xMTg0NTJa',
    });
  });

  it('commence chaque projet à since quand il n’a pas de curseur, et envoie la clé à chaque requête', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(paramsOf(calls[7]?.url).updated_at__gte).toBe('2026-09-15T00:00:00.000Z');
    for (const call of calls) expect(call.headers['x-api-key']).toBe(KEY);
  });

  it('rend les éléments dans l’ordre de lecture, sans celui qui n’a aucun texte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages.map((page) => page.items.length)).toEqual([2, 1, 0]);
    expect(idsOf(pages)).toEqual([`work-item:${WI12}`, `work-item:${WI13}`, `work-item:${WI14}`]);
  });

  it('range le corps puis les commentaires, chacun avec son auteur et sa date', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) => i.externalId === `work-item:${WI12}`);
    expect(item).toEqual({
      externalId: `work-item:${WI12}`,
      nature: 'ticket',
      title: "SITE-12 Refonte de la page d'accueil",
      url: 'https://app.plane.so/acme/browse/SITE-12',
      updatedAt: '2026-10-08T09:15:22.341907Z',
      origin: { workspace: 'acme', project: 'Site web' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: "Objectif : une page d'accueil plus claire.\n\n- Maquette\n- Texte & visuels",
          ts: '2026-10-08T09:15:22.341907Z',
        },
        {
          externalId: 'comment:3b7f1c85-6d02-4e94-a1b8-0c9e5f2a7d43',
          role: 'participant',
          author: { name: 'David Martin', email: 'david@acme.test' },
          text: 'Je propose de garder le bandeau actuel.\n\n- moins de travail\n- déjà validé',
          ts: '2026-10-07T12:15:41.902300Z',
        },
        {
          externalId: 'comment:e2d84b60-91a7-4c35-b8f0-7a5c3e1d9b26',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: "D'accord, je garde le bandeau actuel.",
          ts: '2026-10-08T09:10:03.482113Z',
        },
      ],
    });
  });

  it('écarte un commentaire masqué par la modération', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) => i.externalId === `work-item:${WI12}`);
    const texts = item?.turns.map((turn) => turn.text).join('\n');
    expect(texts).not.toMatch(/Gagnez de l'argent/);
  });

  it('garde les commentaires d’un élément sans description, et un auteur sans nom quand il est inconnu', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) => i.externalId === `work-item:${WI13}`);
    expect(item?.title).toBe('SITE-13 Mettre à jour les mentions légales');
    expect(item?.turns).toEqual([
      {
        externalId: 'comment:5c0a8d2e-7b41-4f96-8e13-d4a6b9f1c372',
        role: 'participant',
        author: { name: null, email: null },
        text: 'À valider avec le juriste avant la mise en ligne.',
        ts: '2026-10-09T14:00:00.000000Z',
      },
    ]);
  });

  it('laisse le nom de l’auteur vide quand le créateur a quitté l’espace', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) => i.externalId === `work-item:${WI14}`);
    expect(item?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: null, email: null },
        text: 'Constat\n\nLe menu ne se ferme pas & reste ouvert.',
        ts: '2026-10-12T16:40:05.902331Z',
      },
    ]);
  });

  it('ne rend pas un élément sans texte ni commentaire, mais le curseur le dépasse', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[2]?.items).toEqual([]);
    expect(cursorOf(pages[2])).toEqual({
      [SITE]: { at: '2026-10-12T16:40:05.902Z', seen: [WI14] },
      [APP]: { at: '2026-10-11T08:30:00.554Z', seen: [WI3_APP] },
    });
  });

  it('range le curseur après le dernier élément lu de chaque projet', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({
      [SITE]: { at: '2026-10-09T14:02:10.118Z', seen: [WI13] },
    });
    expect(cursorOf(pages[1])).toEqual({
      [SITE]: { at: '2026-10-12T16:40:05.902Z', seen: [WI14] },
    });
  });

  it('rend des dates que le socle accepte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of itemsOf(pages)) {
      expect(normalizeItem(item, 'plane'), item.externalId).not.toBeNull();
    }
  });
});

describe('plane : dates', () => {
  it('lit les microsecondes de la doc comme un instant UTC, au millième près', async () => {
    const doc = workItem(WI12, '2026-01-14T09:22:41.478363Z');

    const { pages } = await runSync([
      projectsRoute(offsetPage([projects.data[0]])),
      membersRoute(),
      itemsRoute(SITE, cursorPage([doc])),
      commentsRoute(SITE, WI12, commentsEmpty),
    ]);

    const [item] = itemsOf(pages);
    expect(normalizeItem(item as ConnectorItem, 'plane')?.updatedAt).toBe(
      '2026-01-14T09:22:41.478Z',
    );
    expect(cursorOf(pages[0])[SITE].at).toBe('2026-01-14T09:22:41.478Z');
  });

  it('refuse une date sans fuseau plutôt que de la lire dans le fuseau du serveur', async () => {
    const odd = workItem(WI12, '2026-01-14 09:22:41');

    const failure = await runSync([
      projectsRoute(offsetPage([projects.data[0]])),
      membersRoute(),
      itemsRoute(SITE, cursorPage([odd])),
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
  });
});

describe('plane : sync, reprise et curseur', () => {
  it('reprend à l’instant du curseur de chaque projet, sans refaire ce qui est lu', async () => {
    const first = await runSync(firstPassRoutes());
    const cursor = first.pages.at(-1)?.cursor ?? null;

    const resumed = await runSync(
      [
        projectsRoute(),
        membersRoute(),
        itemsRoute(SITE, workItemsSitePage2), // le dernier élément, au même instant
        itemsRoute(APP, workItemsApp),
      ],
      { cursor },
    );

    expect(resumed.pages).toEqual([]);
    expect(resumed.calls).toHaveLength(4); // ni commentaires, ni page suivante
    expect(paramsOf(resumed.calls[2]?.url).updated_at__gte).toBe('2026-10-12T16:40:05.902Z');
    expect(paramsOf(resumed.calls[3]?.url).updated_at__gte).toBe('2026-10-11T08:30:00.554Z');
  });

  it('distingue deux éléments modifiés à la même milliseconde', async () => {
    const at = '2026-10-12T10:00:00.123Z';
    const cursor = JSON.stringify({ [SITE]: { at, seen: ['aaa'] } });
    const rows = [
      workItem('aaa', '2026-10-12T10:00:00.123100Z'),
      workItem('bbb', '2026-10-12T10:00:00.123900Z'),
    ];

    const { pages, calls } = await runSync(
      [
        projectsRoute(offsetPage([projects.data[0]])),
        membersRoute(),
        itemsRoute(SITE, cursorPage(rows)),
        commentsRoute(SITE, 'bbb', commentsEmpty),
      ],
      { cursor },
    );

    expect(idsOf(pages)).toEqual(['work-item:bbb']);
    expect(calls.map((call) => pathOf(call.url))).not.toContain(
      `/api/v2/workspaces/acme/projects/${SITE}/work-items/aaa/comments/`,
    );
    expect(cursorOf(pages[0])).toEqual({ [SITE]: { at, seen: ['aaa', 'bbb'] } });
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync(
      [
        projectsRoute(offsetPage([projects.data[0]])),
        membersRoute(),
        itemsRoute(SITE, cursorPage([])),
      ],
      { cursor: 'pas du json' },
    );

    expect(paramsOf(calls[2]?.url).updated_at__gte).toBe('2026-09-15T00:00:00.000Z');
  });

  it('ne rend aucune page pour un projet sans élément modifié', async () => {
    const { pages } = await runSync([
      projectsRoute(),
      membersRoute(),
      itemsRoute(SITE, cursorPage([])),
      itemsRoute(APP, cursorPage([])),
    ]);

    expect(pages).toEqual([]);
  });

  it('ne boucle pas quand l’outil rend toujours le même curseur', async () => {
    const row = workItem(WI12, '2026-10-08T09:15:22.341907Z');

    const { pages, calls } = await runSync([
      projectsRoute(offsetPage([projects.data[0]])),
      membersRoute(),
      itemsRoute(SITE, cursorPage([row], 'curseur-1')),
      commentsRoute(SITE, WI12, commentsEmpty),
      itemsRoute(SITE, cursorPage([row], 'curseur-1')),
    ]);

    expect(calls.filter((call) => pathOf(call.url).endsWith('/work-items/'))).toHaveLength(2);
    expect(itemsOf(pages)).toHaveLength(1);
  });
});

describe('plane : listes à décalage (projets, membres, commentaires)', () => {
  it('lit les projets page après page', async () => {
    const { calls } = await runSync([
      projectsRoute(offsetPage([projects.data[0]], 1)),
      projectsRoute(offsetPage([projects.data[1]], null)),
      membersRoute(),
      itemsRoute(SITE, cursorPage([])),
      itemsRoute(APP, cursorPage([])),
    ]);

    expect(paramsOf(calls[1]?.url)).toEqual({ per_page: '200', offset: '1' });
    expect(calls.filter((call) => pathOf(call.url).endsWith('/work-items/'))).toHaveLength(2);
  });

  it('s’arrête quand le décalage annoncé n’avance pas', async () => {
    const { calls } = await runSync([
      projectsRoute(offsetPage([projects.data[0]], 0)),
      membersRoute(),
      itemsRoute(SITE, cursorPage([])),
    ]);

    expect(calls.filter((call) => pathOf(call.url).endsWith('/projects/'))).toHaveLength(1);
  });

  it('lit les membres page après page', async () => {
    const [marie, david] = members.data;
    const row = workItem(WI12, '2026-10-08T09:15:22.341907Z', {
      created_by_id: david?.member_id,
    });

    const { pages, calls } = await runSync([
      projectsRoute(offsetPage([projects.data[0]])),
      membersRoute(offsetPage([marie], 1)),
      membersRoute(offsetPage([david], null)),
      itemsRoute(SITE, cursorPage([row])),
      commentsRoute(SITE, WI12, commentsEmpty),
    ]);

    expect(paramsOf(calls[2]?.url).offset).toBe('1');
    expect(itemsOf(pages)[0]?.turns[0]?.author).toEqual({
      name: 'David Martin',
      email: 'david@acme.test',
    });
  });

  it('lit au plus les 400 commentaires les plus récents, rendus du plus ancien au plus récent', async () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 10) + minute * 60_000).toISOString();
    const newestFirst = Array.from({ length: 400 }, (_, i) =>
      comment(`c${String(399 - i).padStart(3, '0')}`, at(399 - i)),
    );
    const row = workItem(WI12, '2026-10-12T10:00:00.000000Z');

    const { pages, calls } = await runSync([
      projectsRoute(offsetPage([projects.data[0]])),
      membersRoute(),
      itemsRoute(SITE, cursorPage([row])),
      commentsRoute(SITE, WI12, offsetPage(newestFirst.slice(0, 200), 200)),
      commentsRoute(SITE, WI12, offsetPage(newestFirst.slice(200), 400)),
    ]);

    const commentCalls = calls.filter((call) => pathOf(call.url).endsWith('/comments/'));
    expect(commentCalls.map((call) => paramsOf(call.url).offset)).toEqual([undefined, '200']);
    const turns = itemsOf(pages)[0]?.turns ?? [];
    expect(turns).toHaveLength(401);
    expect(turns[1]?.externalId).toBe('comment:c000');
    expect(turns.at(-1)?.externalId).toBe('comment:c399');
  });
});

describe('plane : ressources secondaires et erreurs', () => {
  it.each([403, 404])(
    'rend l’élément avec son seul corps quand les commentaires répondent %i',
    async (status) => {
      const row = workItem(WI12, '2026-10-08T09:15:22.341907Z');

      const { pages } = await runSync([
        projectsRoute(offsetPage([projects.data[0]])),
        membersRoute(),
        itemsRoute(SITE, cursorPage([row])),
        commentsRoute(SITE, WI12, { type: 'forbidden', code: 'forbidden' }, { status }),
      ]);

      expect(itemsOf(pages)[0]?.turns.map((turn) => turn.externalId)).toEqual(['body']);
    },
  );

  it('laisse remonter une clé refusée (401) pendant la lecture des commentaires', async () => {
    const row = workItem(WI12, '2026-10-08T09:15:22.341907Z');

    const failure = runSync([
      projectsRoute(offsetPage([projects.data[0]])),
      membersRoute(),
      itemsRoute(SITE, cursorPage([row])),
      commentsRoute(SITE, WI12, { code: 'unauthorized' }, { status: 401 }),
    ]);

    await expect(failure).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('rend les éléments sans nom d’auteur quand la liste des membres est interdite (403)', async () => {
    const { pages } = await runSync([
      projectsRoute(offsetPage([projects.data[0]])),
      membersRoute({ code: 'forbidden' }, { status: 403 }),
      itemsRoute(SITE, workItemsSitePage1),
      commentsRoute(SITE, WI12, commentsWi12),
      commentsRoute(SITE, WI13, commentsWi13),
      itemsRoute(SITE, workItemsSitePage2),
      commentsRoute(SITE, WI14, commentsEmpty),
    ]);

    const item = itemsOf(pages).find((i) => i.externalId === `work-item:${WI12}`);
    expect(item?.turns[0]?.author).toEqual({ name: null, email: null });
    // Les commentaires portent leur auteur dans la réponse : ils le gardent.
    expect(item?.turns[1]?.author.name).toBe('David Martin');
  });

  it('laisse remonter une clé refusée (401) à la lecture des membres', async () => {
    const failure = runSync([
      projectsRoute(),
      membersRoute({ code: 'unauthorized' }, { status: 401 }),
    ]);

    await expect(failure).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it.each([401, 403])('laisse remonter un %i sur la liste des éléments', async (status) => {
    const failure = runSync([
      projectsRoute(offsetPage([projects.data[0]])),
      membersRoute(),
      itemsRoute(SITE, { code: 'forbidden' }, { status }),
    ]);

    await expect(failure).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('n’écrit ni la clé ni le corps de la réponse dans l’erreur d’un 500', async () => {
    const failure = await runSync([
      projectsRoute({ detail: `secret ${KEY}` }, { status: 500 }),
      projectsRoute({ detail: `secret ${KEY}` }, { status: 500 }),
      projectsRoute({ detail: `secret ${KEY}` }, { status: 500 }),
      projectsRoute({ detail: `secret ${KEY}` }, { status: 500 }),
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Plane a répondu 500');
  });
});

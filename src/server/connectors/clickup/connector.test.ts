import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { clickupConnector } from './connector';
import comments86b1abc from './fixtures/comments-86b1abc.json';
import comments86b1abd from './fixtures/comments-86b1abd.json';
import noComments from './fixtures/comments-none.json';
import tasksPage1 from './fixtures/tasks-page1.json';
import tasksPage2 from './fixtures/tasks-page2.json';
import teams from './fixtures/teams.json';
import user from './fixtures/user.json';

const API = 'https://api.clickup.com/api/v2';
const TOKEN = 'pk_1234567_JETONDETEST0123456789';
const config = { token: TOKEN };
const SINCE = new Date('2026-09-15T00:00:00Z'); // 1789430400000
const BASE = 1_790_000_000_000;

const tasksRoute = (json: unknown, teamId = '9001'): FakeRoute => ({
  url: `${API}/team/${teamId}/task`,
  json,
});
const commentsRoute = (
  taskId: string,
  json: unknown,
  extra: Partial<FakeRoute> = {},
): FakeRoute => ({
  url: `${API}/task/${taskId}/comment`,
  json,
  ...extra,
});

// Un premier passage sur les deux pages de tâches de la fixture. Dans l'ordre des mises à jour :
// 86b1abd (8/10), 86b1abe (9/10, sans texte), 86b1abf (12/10), 86b1abc (14/10).
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: `${API}/team`, json: teams },
    tasksRoute(tasksPage1),
    tasksRoute(tasksPage2),
    commentsRoute('86b1abd', comments86b1abd),
    commentsRoute('86b1abe', noComments),
    commentsRoute('86b1abf', noComments),
    commentsRoute('86b1abc', comments86b1abc),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(clickupConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(clickupConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;
const pathOf = (url: string | undefined) => new URL(url ?? '').pathname;

const author = { id: 101, username: 'Marie Durand', email: 'marie@acme.test' };

function task(id: string, updated: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    custom_id: null,
    name: `Tâche ${id}`,
    description: `Texte de ${id}`,
    date_created: String(updated),
    date_updated: String(updated),
    creator: author,
    list: { id: '1', name: 'Site web', access: true },
    folder: { id: '1', name: 'hidden', hidden: true, access: true },
    url: `https://app.clickup.com/t/${id}`,
    ...extra,
  };
}

// Du plus récent au plus ancien, comme l'outil : `count` commentaires dont le plus récent porte `newest`.
function commentRows(count: number, newest: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(7000 + newest - i),
    comment_text: `Commentaire ${newest - i}`,
    user: author,
    date: String(BASE + (newest - i) * 1000),
  }));
}

describe('clickup : configuration', () => {
  const schema = clickupConnector.configSchema;

  it('accepte un jeton personnel, sans les espaces autour', () => {
    expect(schema.parse({ token: `  ${TOKEN} ` })).toEqual({ token: TOKEN });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ token: '   ' }).success).toBe(false);
  });

  it('fixe l’hôte, le champ à chiffrer et le rythme des requêtes (100 par minute)', () => {
    expect(clickupConnector.hosts(config)).toEqual(['api.clickup.com']);
    expect(clickupConnector.secretFields).toEqual(['token']);
    expect(clickupConnector.minIntervalMs).toBeGreaterThanOrEqual(600);
  });

  it('est disponible dans le registre et le catalogue, avec l’avertissement sur les conditions', () => {
    expect(getConnector('clickup')).toBe(clickupConnector);
    const entry = listCatalog().find((item) => item.id === 'clickup');
    expect(entry?.available).toBe(true);
    expect(entry?.warning).toMatch(/entraîn/);
  });
});

describe('clickup : verify', () => {
  it('lit le compte puis les espaces, avec le jeton seul dans Authorization', async () => {
    const { http, calls } = testHttp(clickupConnector, config, [
      { url: `${API}/user`, json: user },
      { url: `${API}/team`, json: teams },
    ]);

    const result = await clickupConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (Acme)' });
    expect(calls.map((call) => call.url)).toEqual([`${API}/user`, `${API}/team`]);
    expect(calls[0]?.headers.authorization).toBe(TOKEN);
  });

  it('nomme tous les espaces visibles', async () => {
    const two = { teams: [...teams.teams, { ...teams.teams[0], id: '9002', name: 'Beta' }] };
    const { http } = testHttp(clickupConnector, config, [
      { url: `${API}/user`, json: user },
      { url: `${API}/team`, json: two },
    ]);

    expect(await clickupConnector.verify(config, http)).toEqual({
      account: 'Marie Durand (Acme, Beta)',
    });
  });

  it('refuse un jeton rejeté', async () => {
    const { http } = testHttp(clickupConnector, config, [{ url: `${API}/user`, status: 401 }]);

    await expect(clickupConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse un jeton qui ne voit aucun espace', async () => {
    const { http } = testHttp(clickupConnector, config, [
      { url: `${API}/user`, json: user },
      { url: `${API}/team`, json: { teams: [] } },
    ]);

    const failure = await clickupConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Aucun espace ClickUp accessible avec cette clé');
  });
});

describe('clickup : sync, premier passage', () => {
  it('demande les espaces puis les tâches modifiées depuis since, fermées et sous-tâches comprises', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls[0]?.url).toBe(`${API}/team`);
    expect(pathOf(calls[1]?.url)).toBe('/api/v2/team/9001/task');
    expect(paramsOf(calls[1]?.url)).toEqual({
      date_updated_gt: '1789430400000',
      include_closed: 'true',
      subtasks: 'true',
      include_markdown_description: 'true',
      order_by: 'created',
      page: '0',
    });
    expect(paramsOf(calls[2]?.url).page).toBe('1');
  });

  it('envoie le jeton sans « Bearer » à chaque requête', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(7);
    for (const call of calls) expect(call.headers.authorization).toBe(TOKEN);
  });

  it('rend les tâches dans l’ordre des mises à jour, quel que soit l’ordre de la liste', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(1);
    expect(idsOf(pages)).toEqual(['task:86b1abd', 'task:86b1abf', 'task:86b1abc']);
  });

  it('range le corps puis les commentaires, chacun avec son auteur et sa date', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) => i.externalId === 'task:86b1abc');
    expect(item).toEqual({
      externalId: 'task:86b1abc',
      nature: 'ticket',
      title: "Refonte de la page d'accueil",
      url: 'https://app.clickup.com/t/86b1abc',
      updatedAt: '2026-10-14T17:30:00.000Z',
      origin: { workspace: 'Acme', folder: 'Marketing', list: 'Site web' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: "**Objectif** : une page d'accueil plus claire.\n\n- Livrables : maquette, texte, mise en ligne.",
          ts: '2026-10-14T17:30:00.000Z',
        },
        {
          externalId: 'comment:90210001',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Maquette envoyée à David pour relecture.',
          ts: '2026-10-13T07:45:00.000Z',
        },
        {
          externalId: 'comment:90210002',
          role: 'participant',
          author: { name: 'David Martin', email: 'david@acme.test' },
          text: 'Je propose de garder le bandeau actuel.',
          ts: '2026-10-14T13:00:00.000Z',
        },
      ],
    });
  });

  it('reprend l’identifiant personnalisé dans le titre ; sans description, seuls les commentaires restent', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) => i.externalId === 'task:86b1abd');
    expect(item?.title).toBe('ACME-12 Corriger le bug de connexion');
    expect(item?.updatedAt).toBe('2026-10-08T11:10:00.000Z');
    // Le commentaire vide (une pièce jointe seule) est ignoré.
    expect(item?.turns.map((t) => [t.externalId, t.role, t.text])).toEqual([
      [
        'comment:90220001',
        'participant',
        'Le bug vient du cookie de session ; correctif prévu jeudi.',
      ],
    ]);
  });

  it('retombe sur la description simple et omet le dossier caché d’une liste sans dossier', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) => i.externalId === 'task:86b1abf');
    expect(item?.origin).toEqual({ workspace: 'Acme', list: 'Ventes' });
    expect(item?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'David Martin', email: 'david@acme.test' },
        text: 'Préparer la démo.\n- scénario\n- jeu de données',
        ts: '2026-10-12T11:05:00.000Z',
      },
    ]);
  });

  it('ne rend pas une tâche sans texte ni commentaire, mais le curseur la dépasse', async () => {
    const routes = [
      { url: `${API}/team`, json: teams },
      tasksRoute({ tasks: [tasksPage2.tasks[0]], last_page: true }),
      commentsRoute('86b1abe', noComments),
    ];

    const { pages } = await runSync(routes);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toEqual([]);
    expect(cursorOf(pages[0])).toEqual({ '9001': { at: 1791564000000, seen: ['86b1abe'] } });
  });

  it('range le curseur après la dernière tâche lue', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages.at(-1))).toEqual({ '9001': { at: 1791999000000, seen: ['86b1abc'] } });
  });

  it('rend des dates que le socle accepte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of itemsOf(pages))
      expect(normalizeItem(item, 'clickup'), item.externalId).not.toBeNull();
  });
});

describe('clickup : dates', () => {
  it('lit les millisecondes de la doc (« 1508369194377 ») comme un instant UTC', async () => {
    const doc = task('av1', 1_508_369_194_377);
    const routes = [
      { url: `${API}/team`, json: teams },
      tasksRoute({ tasks: [doc], last_page: true }),
      commentsRoute('av1', noComments),
    ];

    const { pages } = await runSync(routes);

    const [item] = itemsOf(pages);
    expect(item?.updatedAt).toBe('2017-10-18T23:26:34.377Z');
    expect(item?.turns[0]?.ts).toBe('2017-10-18T23:26:34.377Z');
  });

  it('refuse une date qui n’est pas en millisecondes', async () => {
    const odd = task('av1', 1, { date_updated: '2019-05-29 04:21:51' });
    const routes = [{ url: `${API}/team`, json: teams }, tasksRoute({ tasks: [odd] })];

    const failure = await runSync(routes).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
  });
});

describe('clickup : sync, pages et curseur', () => {
  // 101 tâches listées sur deux pages (100 puis 1), de la plus récente à la plus ancienne.
  function bigRoutes(): FakeRoute[] {
    const rows = Array.from({ length: 101 }, (_, i) =>
      task(`t${String(i).padStart(3, '0')}`, BASE + (100 - i) * 60_000),
    );
    return [
      { url: `${API}/team`, json: teams },
      tasksRoute({ tasks: rows.slice(0, 100) }),
      tasksRoute({ tasks: rows.slice(100) }),
      ...rows.map(() => commentsRoute('', noComments, { url: /\/task\/t\d+\/comment/ })),
    ];
  }

  it('lit toutes les pages de la liste, puis rend les tâches par pages de 100 au plus', async () => {
    const { pages, calls } = await runSync(bigRoutes());

    expect(pages.map((page) => page.items.length)).toEqual([100, 1]);
    expect(itemsOf(pages)[0]?.externalId).toBe('task:t100'); // la plus anciennement modifiée
    expect(itemsOf(pages)[100]?.externalId).toBe('task:t000');
    const listCalls = calls.filter((call) => pathOf(call.url).endsWith('/task'));
    expect(listCalls.map((call) => paramsOf(call.url).page)).toEqual(['0', '1']);
    expect(cursorOf(pages[0])).toEqual({ '9001': { at: BASE + 99 * 60_000, seen: ['t001'] } });
    expect(cursorOf(pages[1])).toEqual({ '9001': { at: BASE + 100 * 60_000, seen: ['t000'] } });
  });

  it('reprend juste après le dernier curseur : une milliseconde avant, sans refaire ce qui est lu', async () => {
    const last = firstPassRoutes();
    const { pages } = await runSync(last);
    const cursor = pages.at(-1)?.cursor ?? null;

    const resumed = await runSync(
      [
        { url: `${API}/team`, json: teams },
        tasksRoute({ tasks: [tasksPage1.tasks[0]], last_page: true }), // la dernière tâche, au même instant
      ],
      { cursor },
    );

    expect(resumed.pages).toEqual([]);
    expect(resumed.calls).toHaveLength(2); // ni commentaires, ni page suivante
    expect(paramsOf(resumed.calls[1]?.url).date_updated_gt).toBe('1791998999999');
  });

  it('distingue deux tâches modifiées à la même milliseconde', async () => {
    const same = 1_791_999_000_000;
    const cursor = JSON.stringify({ '9001': { at: same, seen: ['aaa'] } });
    const routes = [
      { url: `${API}/team`, json: teams },
      tasksRoute({ tasks: [task('aaa', same), task('bbb', same), task('old', same - 5)] }),
      commentsRoute('bbb', noComments),
    ];

    const { pages, calls } = await runSync(routes, { cursor });

    expect(idsOf(pages)).toEqual(['task:bbb']);
    expect(calls.map((call) => pathOf(call.url))).not.toContain('/api/v2/task/aaa/comment');
    expect(cursorOf(pages[0])).toEqual({ '9001': { at: same, seen: ['aaa', 'bbb'] } });
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync(
      [{ url: `${API}/team`, json: teams }, tasksRoute({ tasks: [] })],
      { cursor: 'pas du json' },
    );

    expect(paramsOf(calls[1]?.url).date_updated_gt).toBe('1789430400000');
  });

  it('s’arrête à la dernière page quand l’outil n’indique pas last_page et rend moins de 100 tâches', async () => {
    const { calls } = await runSync([
      { url: `${API}/team`, json: teams },
      tasksRoute({ tasks: [task('aaa', BASE)] }),
      commentsRoute('aaa', noComments),
    ]);

    expect(calls.filter((call) => pathOf(call.url).endsWith('/task'))).toHaveLength(1);
  });

  it('ne boucle pas quand l’outil ignore le numéro de page et rend toujours les mêmes tâches', async () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      task(`t${String(i).padStart(3, '0')}`, BASE + i),
    );
    const { pages, calls } = await runSync([
      { url: `${API}/team`, json: teams },
      tasksRoute({ tasks: rows }),
      tasksRoute({ tasks: rows }),
      ...rows.map(() => commentsRoute('', noComments, { url: /\/task\/t\d+\/comment/ })),
    ]);

    expect(calls.filter((call) => pathOf(call.url).endsWith('/task'))).toHaveLength(2);
    expect(itemsOf(pages)).toHaveLength(100);
  });

  it('suit chaque espace avec son propre curseur', async () => {
    const two = { teams: [...teams.teams, { ...teams.teams[0], id: '9002', name: 'Beta' }] };
    const { pages } = await runSync([
      { url: `${API}/team`, json: two },
      tasksRoute({ tasks: [task('aaa', BASE + 2000)], last_page: true }),
      tasksRoute({ tasks: [task('bbb', BASE + 1000)], last_page: true }, '9002'),
      commentsRoute('aaa', noComments),
      commentsRoute('bbb', noComments),
    ]);

    expect(itemsOf(pages).map((i) => [i.externalId, i.origin.workspace])).toEqual([
      ['task:aaa', 'Acme'],
      ['task:bbb', 'Beta'],
    ]);
    expect(cursorOf(pages.at(-1))).toEqual({
      '9001': { at: BASE + 2000, seen: ['aaa'] },
      '9002': { at: BASE + 1000, seen: ['bbb'] },
    });
  });

  it('laisse remonter une clé refusée sur la liste des tâches', async () => {
    const failure = runSync([
      { url: `${API}/team`, json: teams },
      { url: `${API}/team/9001/task`, status: 401 },
    ]);

    await expect(failure).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('clickup : commentaires', () => {
  const one = { tasks: [task('aaa', BASE)], last_page: true };
  const start = [{ url: `${API}/team`, json: teams }, tasksRoute(one)];

  it('lit les commentaires plus anciens avec start et start_id, puis les range du plus ancien au plus récent', async () => {
    const { pages, calls } = await runSync([
      ...start,
      commentsRoute('aaa', { comments: commentRows(25, 29) }),
      commentsRoute('aaa', { comments: commentRows(5, 4) }),
    ]);

    const commentCalls = calls.filter((call) => pathOf(call.url).endsWith('/comment'));
    expect(commentCalls).toHaveLength(2);
    expect(paramsOf(commentCalls[0]?.url)).toEqual({});
    expect(paramsOf(commentCalls[1]?.url)).toEqual({
      start: String(BASE + 5 * 1000),
      start_id: '7005',
    });
    const ids = itemsOf(pages)[0]?.turns.map((t) => t.externalId);
    expect(ids).toHaveLength(31);
    expect(ids?.slice(0, 3)).toEqual(['body', 'comment:7000', 'comment:7001']);
    expect(ids?.at(-1)).toBe('comment:7029');
  });

  it('s’arrête à 100 commentaires, les plus récents', async () => {
    const { pages, calls } = await runSync([
      ...start,
      commentsRoute('aaa', { comments: commentRows(25, 199) }),
      commentsRoute('aaa', { comments: commentRows(25, 174) }),
      commentsRoute('aaa', { comments: commentRows(25, 149) }),
      commentsRoute('aaa', { comments: commentRows(25, 124) }),
    ]);

    expect(calls.filter((call) => pathOf(call.url).endsWith('/comment'))).toHaveLength(4);
    const ids = itemsOf(pages)[0]?.turns.map((t) => t.externalId);
    expect(ids).toHaveLength(101);
    expect(ids?.at(1)).toBe('comment:7100');
    expect(ids?.at(-1)).toBe('comment:7199');
  });

  it('ne boucle pas quand l’outil ignore start et rend toujours les mêmes commentaires', async () => {
    const same = { comments: commentRows(25, 24) };
    const { pages, calls } = await runSync([
      ...start,
      commentsRoute('aaa', same),
      commentsRoute('aaa', same),
    ]);

    expect(calls.filter((call) => pathOf(call.url).endsWith('/comment'))).toHaveLength(2);
    expect(itemsOf(pages)[0]?.turns).toHaveLength(26);
  });

  it('sort la tâche avec son seul corps quand les commentaires sont refusés (403) ou introuvables (404)', async () => {
    for (const status of [403, 404]) {
      const { pages } = await runSync([...start, commentsRoute('aaa', undefined, { status })]);

      expect(
        itemsOf(pages)[0]?.turns.map((t) => t.externalId),
        String(status),
      ).toEqual(['body']);
    }
  });

  it('laisse remonter un 401 sur les commentaires', async () => {
    const failure = runSync([...start, commentsRoute('aaa', undefined, { status: 401 })]);

    await expect(failure).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('écrit l’identifiant de la tâche dans l’adresse sans pouvoir en sortir', async () => {
    const odd = task('a/../b?x=1', BASE);
    const { calls } = await runSync([
      { url: `${API}/team`, json: teams },
      tasksRoute({ tasks: [odd], last_page: true }),
      { url: /\/task\/.*\/comment/, json: noComments },
    ]);

    const url = new URL(calls[2]?.url ?? '');
    expect(url.pathname).toBe('/api/v2/task/a%2F..%2Fb%3Fx%3D1/comment');
    expect(url.search).toBe('');
  });
});

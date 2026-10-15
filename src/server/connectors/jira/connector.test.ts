import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { jiraConnector } from './connector';
import comments10003 from './fixtures/comments-10003.json';
import myself from './fixtures/myself.json';
import search1 from './fixtures/search-1.json';
import search2 from './fixtures/search-2.json';

const SITE_URL = 'https://acme.atlassian.net';
const MYSELF = `${SITE_URL}/rest/api/3/myself`;
const SEARCH = `${SITE_URL}/rest/api/3/search/jql`;
const COMMENTS_10003 = `${SITE_URL}/rest/api/3/issue/10003/comment`;
const TOKEN = 'jeton-de-test-0123456789';
const EMAIL = 'marie@acme.test';
const config = { site: 'acme', email: EMAIL, apiToken: TOKEN };
const BASIC = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`;
const SINCE = new Date('2026-09-15T00:00:00Z');
const FIELDS = 'summary,description,comment,creator,reporter,project,updated';

// Toutes les routes d'un premier passage : le compte, deux pages de recherche, et les commentaires
// du ticket dont la recherche n'a rendu qu'une partie.
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: MYSELF, json: myself },
    { url: SEARCH, json: search1 },
    { url: COMMENTS_10003, json: comments10003 },
    { url: SEARCH, json: search2 },
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date; site?: string } = {},
) {
  const cfg = { ...config, site: overrides.site ?? config.site };
  const { http, calls } = testHttp(jiraConnector, cfg, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(jiraConnector.sync(cfg, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) => new URL(url ?? '').searchParams;
const jqlOf = (url: string | undefined) => paramsOf(url).get('jql');

// Un ticket réduit à l'essentiel, avec l'instant de sa dernière modification.
function issueAt(id: string, updated: string) {
  const paragraph = {
    type: 'paragraph',
    content: [{ type: 'text', text: `Texte du ticket ${id}.` }],
  };
  return {
    id,
    key: `OPS-${id}`,
    fields: {
      summary: `Ticket ${id}`,
      description: { version: 1, type: 'doc', content: [paragraph] },
      comment: { comments: [], total: 0 },
      creator: null,
      reporter: null,
      project: { key: 'OPS' },
      updated,
    },
  };
}

describe('jira : configuration', () => {
  const schema = jiraConnector.configSchema;

  it('accepte un site, un e-mail et un jeton, sans les espaces autour, avec le site en minuscules', () => {
    const parsed = schema.parse({ site: ' Acme ', email: ` ${EMAIL} `, apiToken: ` ${TOKEN} ` });

    expect(parsed).toEqual(config);
  });

  it('refuse un site qui n’est pas un sous-domaine simple', () => {
    for (const site of ['evil.com/x', 'a.b', 'a_b', '-acme', '', 'acme.atlassian.net', 'a b']) {
      const result = schema.safeParse({ ...config, site });

      expect(result.success, site).toBe(false);
    }
  });

  it('refuse une configuration incomplète ou un e-mail invalide', () => {
    expect(schema.safeParse({ email: EMAIL, apiToken: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ site: 'acme', apiToken: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ site: 'acme', email: EMAIL }).success).toBe(false);
    expect(schema.safeParse({ ...config, apiToken: '   ' }).success).toBe(false);
    expect(schema.safeParse({ ...config, email: 'marie' }).success).toBe(false);
    expect(schema.safeParse({ ...config, email: 'marie@acme.test\nx' }).success).toBe(false);
  });

  it('fixe l’hôte d’après le site et le champ à chiffrer', () => {
    expect(jiraConnector.hosts(config)).toEqual(['acme.atlassian.net']);
    expect(jiraConnector.secretFields).toEqual(['apiToken']);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('jira')).toBe(jiraConnector);
    expect(listCatalog().find((item) => item.id === 'jira')?.available).toBe(true);
  });
});

describe('jira : verify', () => {
  it('lit le compte avec l’authentification de base et nomme le site', async () => {
    const { http, calls } = testHttp(jiraConnector, config, [{ url: MYSELF, json: myself }]);

    const result = await jiraConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (acme)' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(MYSELF);
    expect(calls[0]?.headers).toMatchObject({ authorization: BASIC, accept: 'application/json' });
  });

  it('refuse un jeton rejeté', async () => {
    const { http } = testHttp(jiraConnector, config, [{ url: MYSELF, status: 401 }]);

    await expect(jiraConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('dit que le site est introuvable quand Jira répond 404 ou redirige', async () => {
    for (const status of [404, 302]) {
      const { http } = testHttp(jiraConnector, config, [{ url: MYSELF, status }]);

      const failure = await jiraConnector.verify(config, http).catch((error: unknown) => error);

      expect(failure, String(status)).toBeInstanceOf(ConnectorHttpError);
      expect((failure as Error).message).toBe('Site Jira introuvable : vérifiez le nom du site');
    }
  });
});

describe('jira : sync, premier passage', () => {
  it('lit le fuseau du compte puis cherche les tickets modifiés depuis since, du plus ancien au plus récent', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls[0]?.url).toBe(MYSELF);
    const first = new URL(calls[1]?.url ?? '');
    expect(first.origin + first.pathname).toBe(SEARCH);
    expect(Object.fromEntries(first.searchParams)).toEqual({
      jql: 'updated >= "2026-09-15 02:00" ORDER BY updated ASC',
      fields: FIELDS,
      maxResults: '50',
    });
  });

  it('écrit la date de since dans le fuseau du compte', async () => {
    const { calls } = await runSync(
      [
        { url: MYSELF, json: { ...myself, timeZone: 'America/New_York' } },
        { url: SEARCH, json: { issues: [] } },
      ],
      { since: new Date('2026-09-15T00:00:00Z') },
    );

    expect(jqlOf(calls[1]?.url)).toBe('updated >= "2026-09-14 20:00" ORDER BY updated ASC');
  });

  it('recule de 12 heures quand le compte n’a pas de fuseau lisible', async () => {
    for (const timeZone of ['Mars/Phobos', undefined]) {
      const { calls } = await runSync([
        { url: MYSELF, json: { ...myself, timeZone } },
        { url: SEARCH, json: { issues: [] } },
      ]);

      expect(jqlOf(calls[1]?.url), String(timeZone)).toBe(
        'updated >= "2026-09-14 12:00" ORDER BY updated ASC',
      );
    }
  });

  it('envoie l’authentification de base à chaque requête, pages suivantes comprises', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(4);
    for (const call of calls) expect(call.headers).toMatchObject({ authorization: BASIC });
  });

  it('demande la page suivante avec le jeton de pagination et la même recherche', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const search = calls.filter((call) => call.url.startsWith(`${SEARCH}?`));
    expect(search).toHaveLength(2);
    expect(paramsOf(search[0]?.url).has('nextPageToken')).toBe(false);
    expect(paramsOf(search[1]?.url).get('nextPageToken')).toBe('page-2-token');
    expect(jqlOf(search[1]?.url)).toBe(jqlOf(search[0]?.url));
  });

  it('rend un ticket avec son corps puis ses commentaires, le texte des blocs passé en texte brut', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[0]?.items[0]).toEqual({
      externalId: 'issue:10001',
      nature: 'ticket',
      title: 'ACME-12 Choisir la durée de relève des outils',
      url: 'https://acme.atlassian.net/browse/ACME-12',
      updatedAt: '2026-10-10T09:00:00.000+0200',
      origin: { site: 'acme', project: 'ACME' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: EMAIL },
          text: '## Contexte\n\nDécision à prendre avec @Paul Martin avant vendredi.\n\n- 15 minutes\n- 30 minutes\n  - si la charge le permet\n\nFin.',
          ts: '2026-10-10T09:00:00.000+0200',
        },
        {
          externalId: 'comment:20001',
          role: 'participant',
          author: { name: 'Paul Martin', email: 'paul@acme.test' },
          text: 'Plutôt 30 minutes, non ?',
          ts: '2026-10-09T10:00:00.000+0200',
        },
        {
          externalId: 'comment:20002',
          role: 'participant',
          author: { name: 'Marie Durand', email: EMAIL },
          text: 'Non, 15 minutes : c’est décidé.\nMerci 👍',
          ts: '2026-10-10T08:50:00.000+0200',
        },
      ],
    });
  });

  it('rend un ticket sans texte sans tours, pour que le curseur avance', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(idsOf(pages.slice(0, 1))).toEqual(['issue:10001', 'issue:10002', 'issue:10003']);
    expect(pages[0]?.items[1]?.turns).toEqual([]);
    expect(pages[0]?.items[1]?.title).toBe('ACME-13 Ticket sans texte');
  });

  it('rend deux pages : celle de la recherche, puis la suivante', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(2);
    expect(idsOf(pages.slice(1))).toEqual(['issue:10004', 'issue:10005']);
  });

  it('prend le rapporteur quand le créateur a disparu, et rend un auteur sans nom si les deux manquent', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const [lost] = pages[1]?.items ?? [];
    expect(lost?.origin).toEqual({ site: 'acme', project: 'OPS' });
    expect(lost?.turns[0]?.author).toEqual({ name: 'Paul Martin', email: 'paul@acme.test' });

    const nobody = structuredClone(search2) as {
      issues: Array<{ fields: Record<string, unknown> }>;
    };
    for (const issue of nobody.issues)
      Object.assign(issue.fields, { creator: null, reporter: null });
    const again = await runSync([
      { url: MYSELF, json: myself },
      { url: SEARCH, json: nobody },
    ]);
    expect(again.pages[0]?.items[0]?.turns[0]?.author).toEqual({ name: null, email: null });
  });

  it('rend un auteur de commentaire sans adresse quand Jira la masque', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const long = itemsOf(pages).find((item) => item.externalId === 'issue:10003');
    expect(long?.turns[0]?.author).toEqual({ name: 'Paul Martin', email: null });
  });

  it('rend des éléments que le socle accepte, avec des dates ISO canoniques', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(5);
    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'jira');
      if (item.turns.length === 0) {
        expect(normalized, item.externalId).toBeNull();
      } else {
        expect(normalized, item.externalId).not.toBeNull();
        expect(normalized?.updatedAt).toBe(new Date(item.updatedAt).toISOString());
      }
    }
  });

  it('lit les dates de Jira, avec leur décalage sans deux-points, comme des instants précis', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const normalized = normalizeItem(pages[0]?.items[0] as ConnectorItem, 'jira');
    expect(normalized?.updatedAt).toBe('2026-10-10T07:00:00.000Z');
    expect(normalized?.turns.map((turn) => turn.ts.toISOString())).toEqual([
      '2026-10-10T07:00:00.000Z',
      '2026-10-09T08:00:00.000Z',
      '2026-10-10T06:50:00.000Z',
    ]);
  });
});

describe('jira : sync, commentaires que la recherche n’a pas tous rendus', () => {
  it('demande les commentaires du ticket quand il y en a plus que la recherche n’en a rendu', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    const long = itemsOf(pages).find((item) => item.externalId === 'issue:10003');
    expect(long?.turns.map((turn) => turn.externalId)).toEqual([
      'body',
      'comment:20003',
      'comment:20004',
      'comment:20005',
    ]);
    const request = calls.find((call) => call.url.startsWith(`${COMMENTS_10003}?`));
    expect(Object.fromEntries(paramsOf(request?.url))).toEqual({
      startAt: '0',
      maxResults: '100',
      orderBy: 'created',
    });
  });

  it('ne demande rien de plus quand la recherche a rendu tous les commentaires', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.filter((call) => call.url.includes('/issue/'))).toHaveLength(1);
  });

  it('lit les commentaires page par page jusqu’au total', async () => {
    const [first, second, third] = comments10003.comments;
    const { pages, calls } = await runSync([
      { url: MYSELF, json: myself },
      { url: SEARCH, json: { issues: [search1.issues[2]] } },
      { url: COMMENTS_10003, json: { ...comments10003, maxResults: 2, comments: [first, second] } },
      {
        url: COMMENTS_10003,
        json: { ...comments10003, maxResults: 2, startAt: 2, comments: [third] },
      },
    ]);

    expect(pages[0]?.items[0]?.turns.map((turn) => turn.externalId)).toEqual([
      'body',
      'comment:20003',
      'comment:20004',
      'comment:20005',
    ]);
    const asked = calls.filter((call) => call.url.startsWith(`${COMMENTS_10003}?`));
    expect(asked.map((call) => paramsOf(call.url).get('startAt'))).toEqual(['0', '2']);
  });

  it('s’arrête quand une page de commentaires est vide, sans tourner en boucle', async () => {
    const { pages, calls } = await runSync([
      { url: MYSELF, json: myself },
      { url: SEARCH, json: { issues: [search1.issues[2]] } },
      { url: COMMENTS_10003, json: { ...comments10003, comments: [] } },
    ]);

    expect(pages[0]?.items[0]?.turns.map((turn) => turn.externalId)).toEqual([
      'body',
      'comment:20003',
    ]);
    expect(calls.filter((call) => call.url.startsWith(`${COMMENTS_10003}?`))).toHaveLength(1);
  });

  it('rend le ticket avec les commentaires de la recherche quand Jira refuse les autres (403)', async () => {
    const { pages } = await runSync([
      { url: MYSELF, json: myself },
      { url: SEARCH, json: { issues: [search1.issues[2]] } },
      { url: COMMENTS_10003, status: 403 },
    ]);

    expect(pages[0]?.items[0]?.turns.map((turn) => turn.externalId)).toEqual([
      'body',
      'comment:20003',
    ]);
  });

  it('remonte un jeton rejeté (401) sur les commentaires', async () => {
    const run = runSync([
      { url: MYSELF, json: myself },
      { url: SEARCH, json: { issues: [search1.issues[2]] } },
      { url: COMMENTS_10003, status: 401 },
    ]);

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('jira : sync, reprise', () => {
  const cursorAfterFirstPage = JSON.stringify({
    at: '2026-10-11T08:45:00.000Z',
    seen: [{ id: '10003', at: '2026-10-11T08:45:00.000Z' }],
  });
  const cursorAfterLastPage = JSON.stringify({
    at: '2026-10-12T14:00:00.000Z',
    seen: [
      { id: '10004', at: '2026-10-12T14:00:00.000Z' },
      { id: '10005', at: '2026-10-12T14:00:00.000Z' },
    ],
  });

  it('écrit les curseurs : l’instant du dernier ticket et les tickets rendus juste avant', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({
      at: '2026-10-11T08:45:00.000Z',
      seen: [{ id: '10003', at: '2026-10-11T08:45:00.000Z' }],
    });
    expect(cursorOf(pages[1])).toEqual({
      at: '2026-10-12T14:00:00.000Z',
      seen: [
        { id: '10004', at: '2026-10-12T14:00:00.000Z' },
        { id: '10005', at: '2026-10-12T14:00:00.000Z' },
      ],
    });
  });

  it('reprend une minute avant le curseur et ne rend que les tickets pas encore lus', async () => {
    const { pages, calls } = await runSync(
      [
        { url: MYSELF, json: myself },
        { url: SEARCH, json: search2 },
      ],
      { cursor: cursorAfterFirstPage },
    );

    expect(jqlOf(calls[1]?.url)).toBe('updated >= "2026-10-11 10:44" ORDER BY updated ASC');
    expect(idsOf(pages)).toEqual(['issue:10004', 'issue:10005']);
  });

  it('ne refait pas la première page avec le dernier curseur', async () => {
    const { pages, calls } = await runSync(
      [
        { url: MYSELF, json: myself },
        { url: SEARCH, json: search2 },
      ],
      { cursor: cursorAfterLastPage },
    );

    expect(jqlOf(calls[1]?.url)).toBe('updated >= "2026-10-12 15:59" ORDER BY updated ASC');
    expect(calls).toHaveLength(2);
    expect(pages).toEqual([]);
  });

  it('ignore le ticket déjà rendu au même instant, et rend l’autre', async () => {
    const cursor = JSON.stringify({
      at: '2026-10-12T14:00:00.000Z',
      seen: [{ id: '10004', at: '2026-10-12T14:00:00.000Z' }],
    });

    const { pages } = await runSync(
      [
        { url: MYSELF, json: myself },
        { url: SEARCH, json: search2 },
      ],
      { cursor },
    );

    expect(idsOf(pages)).toEqual(['issue:10005']);
    expect(cursorOf(pages[0])).toEqual({
      at: '2026-10-12T14:00:00.000Z',
      seen: [
        { id: '10004', at: '2026-10-12T14:00:00.000Z' },
        { id: '10005', at: '2026-10-12T14:00:00.000Z' },
      ],
    });
  });

  it('rend un ticket apparu en retard dans la minute avant le curseur, et ignore celui déjà rendu', async () => {
    // Y (rendu) est à 09:00:30 ; X, modifié à 09:00:10, n'était pas encore dans l'index de recherche.
    const cursor = JSON.stringify({
      at: '2026-10-14T09:00:30.000Z',
      seen: [{ id: '20002', at: '2026-10-14T09:00:30.000Z' }],
    });
    const search = {
      isLast: true,
      issues: [
        issueAt('20001', '2026-10-14T09:00:10.000Z'),
        issueAt('20002', '2026-10-14T09:00:30.000Z'),
      ],
    };

    const { pages, calls } = await runSync(
      [
        { url: MYSELF, json: myself },
        { url: SEARCH, json: search },
      ],
      { cursor },
    );

    expect(jqlOf(calls[1]?.url)).toBe('updated >= "2026-10-14 10:59" ORDER BY updated ASC');
    expect(idsOf(pages)).toEqual(['issue:20001']);
    expect(cursorOf(pages[0])).toEqual({
      at: '2026-10-14T09:00:30.000Z',
      seen: [
        { id: '20002', at: '2026-10-14T09:00:30.000Z' },
        { id: '20001', at: '2026-10-14T09:00:10.000Z' },
      ],
    });
  });

  it('ignore au passage suivant le ticket apparu en retard, une fois rendu', async () => {
    const cursor = JSON.stringify({
      at: '2026-10-14T09:00:30.000Z',
      seen: [
        { id: '20002', at: '2026-10-14T09:00:30.000Z' },
        { id: '20001', at: '2026-10-14T09:00:10.000Z' },
      ],
    });
    const search = {
      isLast: true,
      issues: [
        issueAt('20001', '2026-10-14T09:00:10.000Z'),
        issueAt('20002', '2026-10-14T09:00:30.000Z'),
      ],
    };

    const { pages } = await runSync(
      [
        { url: MYSELF, json: myself },
        { url: SEARCH, json: search },
      ],
      { cursor },
    );

    expect(pages).toEqual([]);
  });

  it('rend de nouveau un ticket modifié après avoir été rendu', async () => {
    const cursor = JSON.stringify({
      at: '2026-10-14T09:00:30.000Z',
      seen: [{ id: '20002', at: '2026-10-14T09:00:30.000Z' }],
    });

    const { pages } = await runSync(
      [
        { url: MYSELF, json: myself },
        {
          url: SEARCH,
          json: { isLast: true, issues: [issueAt('20002', '2026-10-14T09:00:45.000Z')] },
        },
      ],
      { cursor },
    );

    expect(idsOf(pages)).toEqual(['issue:20002']);
    expect(cursorOf(pages[0])).toEqual({
      at: '2026-10-14T09:00:45.000Z',
      seen: [{ id: '20002', at: '2026-10-14T09:00:45.000Z' }],
    });
  });

  it('oublie dans le curseur les tickets rendus plus de deux minutes avant le dernier', async () => {
    const cursor = JSON.stringify({
      at: '2026-10-14T09:00:00.000Z',
      seen: [
        { id: '20001', at: '2026-10-14T08:58:30.000Z' },
        { id: '20002', at: '2026-10-14T09:00:00.000Z' },
      ],
    });

    const { pages } = await runSync(
      [
        { url: MYSELF, json: myself },
        {
          url: SEARCH,
          json: { isLast: true, issues: [issueAt('20003', '2026-10-14T09:01:00.000Z')] },
        },
      ],
      { cursor },
    );

    expect(cursorOf(pages[0])).toEqual({
      at: '2026-10-14T09:01:00.000Z',
      seen: [
        { id: '20002', at: '2026-10-14T09:00:00.000Z' },
        { id: '20003', at: '2026-10-14T09:01:00.000Z' },
      ],
    });
  });

  it('ignore un ticket bien plus ancien que le curseur, que rend la marge d’un compte sans fuseau', async () => {
    const cursor = JSON.stringify({
      at: '2026-10-14T09:00:30.000Z',
      seen: [{ id: '20002', at: '2026-10-14T09:00:30.000Z' }],
    });
    const search = {
      isLast: true,
      issues: [
        issueAt('20000', '2026-10-14T03:00:00.000Z'),
        issueAt('20001', '2026-10-14T09:00:10.000Z'),
        issueAt('20002', '2026-10-14T09:00:30.000Z'),
      ],
    };

    const { pages, calls } = await runSync(
      [
        { url: MYSELF, json: { ...myself, timeZone: undefined } },
        { url: SEARCH, json: search },
      ],
      { cursor },
    );

    expect(jqlOf(calls[1]?.url)).toBe('updated >= "2026-10-13 20:59" ORDER BY updated ASC');
    expect(idsOf(pages)).toEqual(['issue:20001']);
  });

  it('repart de since quand le curseur est illisible', async () => {
    for (const cursor of ['pas du JSON', '{"at":"hier","seen":[]}', '[]']) {
      const { calls } = await runSync(
        [
          { url: MYSELF, json: myself },
          { url: SEARCH, json: { issues: [] } },
        ],
        { cursor },
      );

      expect(jqlOf(calls[1]?.url), cursor).toBe(
        'updated >= "2026-09-15 02:00" ORDER BY updated ASC',
      );
    }
  });

  it('ne rend rien et s’arrête quand la recherche est vide', async () => {
    const { pages, calls } = await runSync([
      { url: MYSELF, json: myself },
      { url: SEARCH, json: { issues: [], isLast: true } },
    ]);

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it('s’arrête sur une page vide même si Jira donne encore un jeton de page', async () => {
    const { pages, calls } = await runSync([
      { url: MYSELF, json: myself },
      { url: SEARCH, json: { issues: [], nextPageToken: 'encore', isLast: false } },
    ]);

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(2);
  });
});

describe('jira : sync, erreurs', () => {
  it('remonte un 401 et un 403 sur la recherche', async () => {
    for (const status of [401, 403]) {
      const run = runSync([
        { url: MYSELF, json: myself },
        { url: SEARCH, status },
      ]);

      await expect(run, String(status)).rejects.toBeInstanceOf(ConnectorAuthError);
    }
  });

  it('remonte un jeton rejeté sur la lecture du compte', async () => {
    const run = runSync([{ url: MYSELF, status: 401 }]);

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte une requête refusée (400) sans reprendre le corps de la réponse', async () => {
    const run = runSync([
      { url: MYSELF, json: myself },
      { url: SEARCH, status: 400, json: { errorMessages: ['secret-xyz'], errors: {} } },
    ]);

    const failure = await run.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as ConnectorHttpError).status).toBe(400);
    expect((failure as Error).message).not.toContain('secret-xyz');
  });

  it('refuse une réponse dont un ticket n’a pas de date lisible', async () => {
    const broken = structuredClone(search2) as {
      issues: Array<{ fields: Record<string, unknown> }>;
    };
    for (const issue of broken.issues) issue.fields.updated = 'pas une date';

    const run = runSync([
      { url: MYSELF, json: myself },
      { url: SEARCH, json: broken },
    ]);

    const failure = await run.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
  });
});

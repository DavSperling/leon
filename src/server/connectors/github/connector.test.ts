import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { githubConnector } from './connector';
import issueComments12Page1 from './fixtures/issue-comments-12-page1.json';
import issueComments12Page2 from './fixtures/issue-comments-12-page2.json';
import issueComments13 from './fixtures/issue-comments-13.json';
import issuesPage1 from './fixtures/issues-page1.json';
import issuesPage2 from './fixtures/issues-page2.json';
import pullComments13 from './fixtures/pull-comments-13.json';
import pullReviews13 from './fixtures/pull-reviews-13.json';
import repo from './fixtures/repo.json';
import user from './fixtures/user.json';

const API = 'https://api.github.com';
const TOKEN = 'jeton-de-test-0123456789';
const config = { token: TOKEN, repos: ['acme/leon'] };
const SINCE = new Date('2026-09-15T00:00:00Z');

// GitHub écrit les pages suivantes avec l'identifiant numérique du dépôt.
const ISSUES_PAGE_2 = `${API}/repositories/1296269/issues`;
const COMMENTS_12_PAGE_2 = `${API}/repositories/1296269/issues/12/comments`;
const next = (url: string) => ({
  link: `<${url}?page=2>; rel="next", <${url}?page=9>; rel="last"`,
});

const issuesRoute = (json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${API}/repos/acme/leon/issues`,
  json,
  ...extra,
});

// Toutes les routes d'un premier passage sur issuesPage1 puis issuesPage2.
function firstPassRoutes(): FakeRoute[] {
  return [
    issuesRoute(issuesPage1, { headers: next(ISSUES_PAGE_2) }),
    {
      url: `${API}/repos/acme/leon/issues/12/comments`,
      json: issueComments12Page1,
      headers: next(COMMENTS_12_PAGE_2),
    },
    { url: COMMENTS_12_PAGE_2, json: issueComments12Page2 },
    { url: `${API}/repos/acme/leon/issues/13/comments`, json: issueComments13 },
    { url: `${API}/repos/acme/leon/pulls/13/reviews`, json: pullReviews13 },
    { url: `${API}/repos/acme/leon/pulls/13/comments`, json: pullComments13 },
    { url: ISSUES_PAGE_2, json: issuesPage2 },
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date; repos?: string[] } = {},
) {
  const cfg = { ...config, repos: overrides.repos ?? config.repos };
  const { http, calls } = testHttp(githubConnector, cfg, routes);
  const syncState = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(githubConnector.sync(cfg, syncState, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const sinceOf = (url: string | undefined) => new URL(url ?? '').searchParams.get('since');

describe('github : configuration', () => {
  const schema = githubConnector.configSchema;

  it('accepte un jeton et des dépôts propriétaire/nom, sans les espaces autour', () => {
    const parsed = schema.parse({ token: `  ${TOKEN} `, repos: [' acme/leon ', 'Acme/le.on_x-1'] });

    expect(parsed).toEqual({ token: TOKEN, repos: ['acme/leon', 'Acme/le.on_x-1'] });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({ repos: ['acme/leon'] }).success).toBe(false);
    expect(schema.safeParse({ token: '   ', repos: ['acme/leon'] }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN, repos: [] }).success).toBe(false);
  });

  it('refuse plus de 20 dépôts', () => {
    const repos = Array.from({ length: 21 }, (_, index) => `acme/depot-${index}`);

    expect(schema.safeParse({ token: TOKEN, repos: repos.slice(0, 20) }).success).toBe(true);
    expect(schema.safeParse({ token: TOKEN, repos }).success).toBe(false);
  });

  it('refuse un dépôt qui n’est pas propriétaire/nom', () => {
    for (const invalid of [
      'acme',
      'acme/',
      '/leon',
      'acme/leon/extra',
      'ac me/leon',
      'acme/le on',
      'https://github.com/acme/leon',
      'acme/leon?x=1',
      '../..',
      './leon',
      'acme/..',
      'acme/.',
    ]) {
      expect(schema.safeParse({ token: TOKEN, repos: [invalid] }).success, invalid).toBe(false);
    }
  });

  it('fixe l’hôte et le champ à chiffrer', () => {
    expect(githubConnector.hosts(config)).toEqual(['api.github.com']);
    expect(githubConnector.secretFields).toEqual(['token']);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('github')).toBe(githubConnector);
    expect(listCatalog().find((item) => item.id === 'github')?.available).toBe(true);
  });
});

describe('github : verify', () => {
  it('lit le compte puis chaque dépôt, avec l’authentification de GitHub', async () => {
    const { http, calls } = testHttp(githubConnector, config, [
      { url: `${API}/user`, json: user },
      { url: `${API}/repos/acme/leon`, json: repo },
    ]);

    const result = await githubConnector.verify(config, http);

    expect(result).toEqual({ account: 'marie-durand' });
    expect(calls.map((call) => call.url)).toEqual([`${API}/user`, `${API}/repos/acme/leon`]);
    expect(calls[0]?.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'Leon',
    });
  });

  it('refuse un jeton rejeté', async () => {
    const { http } = testHttp(githubConnector, config, [{ url: `${API}/user`, status: 401 }]);

    await expect(githubConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('nomme le dépôt inaccessible, qu’il réponde 404 ou 403', async () => {
    for (const status of [404, 403]) {
      const cfg = { ...config, repos: ['acme/leon', 'acme/site'] };
      const { http } = testHttp(githubConnector, cfg, [
        { url: `${API}/user`, json: user },
        { url: `${API}/repos/acme/leon`, json: repo },
        { url: `${API}/repos/acme/site`, status },
      ]);

      const failure = await githubConnector.verify(cfg, http).catch((error: unknown) => error);

      expect(failure, String(status)).toBeInstanceOf(ConnectorHttpError);
      expect((failure as Error).message).toBe('Dépôt inaccessible : acme/site');
    }
  });
});

describe('github : sync, premier passage', () => {
  it('demande les tickets et les PR modifiés depuis since, du plus ancien au plus récent', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const first = new URL(calls[0]?.url ?? '');
    expect(first.origin + first.pathname).toBe(`${API}/repos/acme/leon/issues`);
    expect(Object.fromEntries(first.searchParams)).toEqual({
      state: 'all',
      sort: 'updated',
      direction: 'asc',
      since: '2026-09-15T00:00:00Z',
      per_page: '50',
    });
  });

  it('envoie le jeton et les en-têtes de GitHub à chaque requête, pages suivantes comprises', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.length).toBeGreaterThan(6);
    for (const call of calls) {
      expect(call.headers).toMatchObject({
        authorization: `Bearer ${TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'Leon',
      });
    }
  });

  it('écrit la date de since sans les millisecondes', async () => {
    const { calls } = await runSync(firstPassRoutes(), {
      since: new Date('2026-09-15T10:20:30.456Z'),
    });

    expect(sinceOf(calls[0]?.url)).toBe('2026-09-15T10:20:30Z');
  });

  it('rend un ticket avec son corps puis ses commentaires, y compris ceux de la page suivante', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[0]?.items[0]).toEqual({
      externalId: 'issue:acme/leon#12',
      nature: 'ticket',
      title: '#12 Choisir la durée de relève',
      url: 'https://github.com/acme/leon/issues/12',
      updatedAt: '2026-10-10T09:00:00Z',
      origin: { repo: 'acme/leon' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'marie-durand', email: null },
          text: 'On relève les outils toutes les 15 minutes.\n\n## Pourquoi\n\nLes webhooks sont peu fiables.',
          ts: '2026-10-10T09:00:00Z',
        },
        {
          externalId: 'comment:456',
          role: 'participant',
          author: { name: 'paul-martin', email: null },
          text: 'Plutôt 30 minutes, non ?',
          ts: '2026-10-09T10:00:00Z',
        },
        {
          externalId: 'comment:789',
          role: 'participant',
          author: { name: 'marie-durand', email: null },
          text: 'Non, 15 minutes : c’est décidé.',
          ts: '2026-10-10T08:50:00Z',
        },
        {
          externalId: 'comment:790',
          role: 'participant',
          author: { name: 'paul-martin', email: null },
          text: 'Merci, je referme.',
          ts: '2026-10-10T09:00:00Z',
        },
      ],
    });
  });

  it('rend une PR avec ses commentaires, ses avis et ses commentaires de revue, par date', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    const pr = itemsOf(pages).find((item) => item.externalId === 'pr:acme/leon#13');
    expect(pr).toMatchObject({
      nature: 'ticket',
      title: '#13 Ajouter la relève périodique',
      url: 'https://github.com/acme/leon/pull/13',
      updatedAt: '2026-10-11T08:30:00Z',
      origin: { repo: 'acme/leon' },
    });
    expect(
      pr?.turns.map((turn) => [turn.externalId, turn.role, turn.author.name, turn.ts]),
    ).toEqual([
      ['body', 'document', 'paul-martin', '2026-10-11T08:30:00Z'],
      ['comment:410', 'participant', 'paul-martin', '2026-10-10T17:00:00Z'],
      ['review:301', 'participant', 'marie-durand', '2026-10-11T08:00:00Z'],
      ['review-comment:501', 'participant', 'paul-martin', '2026-10-11T08:10:00Z'],
    ]);
    expect(pr?.turns[2]?.text).toBe('Ça me va, on fusionne.');
    expect(pr?.turns[3]?.text).toBe(
      'Commentaire sur src/server/connectors/sync.ts :\nIci, plutôt 60 jours que 30.',
    );
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual(
      expect.arrayContaining([
        '/repos/acme/leon/pulls/13/reviews',
        '/repos/acme/leon/pulls/13/comments',
      ]),
    );
  });

  it('ignore l’avis en brouillon et l’avis sans texte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const pr = itemsOf(pages).find((item) => item.externalId === 'pr:acme/leon#13');
    const ids = pr?.turns.map((turn) => turn.externalId);
    expect(ids).not.toContain('review:302');
    expect(ids).not.toContain('review:303');
  });

  it('rend un ticket sans texte sans tours, pour avancer le curseur, sans demander ses commentaires', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(2);
    expect(idsOf(pages.slice(0, 1))).toEqual([
      'issue:acme/leon#12',
      'pr:acme/leon#13',
      'issue:acme/leon#14',
    ]);
    expect(pages[0]?.items[2]?.turns).toEqual([]);
    expect(cursorOf(pages[0])).toEqual({
      'acme/leon': { at: '2026-10-11T08:45:00Z', seen: [14] },
    });
    expect(calls.some((call) => call.url.includes('/issues/14'))).toBe(false);
  });

  it('rend une page par page de GitHub, la suivante par le lien donné par GitHub', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    expect(idsOf(pages.slice(1))).toEqual(['issue:acme/leon#15', 'issue:acme/leon#16']);
    expect(cursorOf(pages[1])).toEqual({
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16] },
    });
    const pageTwo = calls.find((call) => call.url.startsWith(`${ISSUES_PAGE_2}?`));
    expect(pageTwo?.url).toBe(`${ISSUES_PAGE_2}?page=2`);
  });

  it('ne demande pas les commentaires d’un ticket qui n’en a aucun', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.some((call) => /\/issues\/1[56]\//.test(call.url))).toBe(false);
  });

  it('rend un auteur sans nom quand le compte a été supprimé', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const deleted = itemsOf(pages).find((item) => item.externalId === 'issue:acme/leon#15');
    expect(deleted?.turns[0]?.author).toEqual({ name: null, email: null });
  });

  it('rend des éléments que le socle accepte, avec des dates ISO canoniques', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(5);
    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'github');
      if (item.turns.length === 0) {
        expect(normalized, item.externalId).toBeNull();
      } else {
        expect(normalized, item.externalId).not.toBeNull();
        expect(normalized?.updatedAt).toBe(new Date(item.updatedAt).toISOString());
      }
    }
  });
});

describe('github : sync, reprise', () => {
  it('reprend juste après le curseur de la première page', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync([issuesRoute(issuesPage2)], {
      cursor: first.pages[0]?.cursor,
    });

    expect(sinceOf(calls[0]?.url)).toBe('2026-10-11T08:44:59Z');
    expect(idsOf(pages)).toEqual(['issue:acme/leon#15', 'issue:acme/leon#16']);
  });

  it('ne refait pas la première page avec le dernier curseur', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync([issuesRoute(issuesPage2)], {
      cursor: first.pages.at(-1)?.cursor,
    });

    expect(sinceOf(calls[0]?.url)).toBe('2026-10-12T13:59:59Z');
    expect(calls).toHaveLength(1);
    expect(pages).toEqual([]);
  });

  it('ignore l’élément déjà rendu au même instant, et rend l’autre', async () => {
    const cursor = JSON.stringify({ 'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15] } });

    const { pages } = await runSync([issuesRoute(issuesPage2)], { cursor });

    expect(idsOf(pages)).toEqual(['issue:acme/leon#16']);
    expect(cursorOf(pages[0])).toEqual({
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16] },
    });
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { pages, calls } = await runSync([issuesRoute(issuesPage2)], { cursor: 'pas du JSON' });

    expect(sinceOf(calls[0]?.url)).toBe('2026-09-15T00:00:00Z');
    expect(idsOf(pages)).toEqual(['issue:acme/leon#15', 'issue:acme/leon#16']);
  });

  it('suit chaque dépôt avec son propre curseur', async () => {
    const cursor = JSON.stringify({ 'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16] } });
    const site = issuesPage2.map((issue) => ({ ...issue, number: issue.number + 100 }));

    const { pages, calls } = await runSync(
      [issuesRoute(issuesPage2), { url: `${API}/repos/acme/site/issues`, json: site }],
      { cursor, repos: ['acme/leon', 'acme/site'] },
    );

    expect(sinceOf(calls[0]?.url)).toBe('2026-10-12T13:59:59Z');
    expect(sinceOf(calls[1]?.url)).toBe('2026-09-15T00:00:00Z');
    expect(idsOf(pages)).toEqual(['issue:acme/site#115', 'issue:acme/site#116']);
    expect(cursorOf(pages[0])).toEqual({
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16] },
      'acme/site': { at: '2026-10-12T14:00:00Z', seen: [115, 116] },
    });
  });
});

describe('github : sync, erreurs', () => {
  const onlyIssues = (extra: FakeRoute[]) => [issuesRoute(issuesPage1), ...extra];

  it('rend l’élément sans les commentaires quand GitHub les refuse (403)', async () => {
    const { pages } = await runSync(
      onlyIssues([
        { url: `${API}/repos/acme/leon/issues/12/comments`, status: 403 },
        { url: `${API}/repos/acme/leon/issues/13/comments`, json: issueComments13 },
        { url: `${API}/repos/acme/leon/pulls/13/reviews`, status: 403 },
        { url: `${API}/repos/acme/leon/pulls/13/comments`, json: pullComments13 },
      ]),
    );

    const [issue, pr] = itemsOf(pages);
    expect(issue?.turns.map((turn) => turn.externalId)).toEqual(['body']);
    expect(pr?.turns.map((turn) => turn.externalId)).toEqual([
      'body',
      'comment:410',
      'review-comment:501',
    ]);
  });

  it('remonte un jeton rejeté (401) sur une ressource secondaire', async () => {
    const run = runSync(
      onlyIssues([{ url: `${API}/repos/acme/leon/issues/12/comments`, status: 401 }]),
    );

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un 401 et un 403 sur la liste des tickets', async () => {
    for (const status of [401, 403]) {
      const run = runSync([issuesRoute(null, { status })]);

      await expect(run, String(status)).rejects.toBeInstanceOf(ConnectorAuthError);
    }
  });

  it('remonte un dépôt introuvable sur la liste des tickets, sans reprendre le corps', async () => {
    const run = runSync([
      issuesRoute(null, { status: 404, json: { message: 'secret-xyz', status: '404' } }),
    ]);

    const failure = await run.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as ConnectorHttpError).status).toBe(404);
    expect((failure as Error).message).not.toContain('secret-xyz');
  });
});

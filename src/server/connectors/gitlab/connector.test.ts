import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { gitlabConnector } from './connector';
import issueNotes12Page1 from './fixtures/issue-notes-12-page1.json';
import issueNotes12Page2 from './fixtures/issue-notes-12-page2.json';
import issueNotes14 from './fixtures/issue-notes-14.json';
import issuesPage1 from './fixtures/issues-page1.json';
import issuesPage2 from './fixtures/issues-page2.json';
import mergeRequestNotes7 from './fixtures/merge-request-notes-7.json';
import mergeRequestsPage1 from './fixtures/merge-requests-page1.json';
import project from './fixtures/project.json';
import user from './fixtures/user.json';

const API = 'https://gitlab.com/api/v4';
const TOKEN = 'jeton-de-test-0123456789';
const config = { token: TOKEN, projects: ['acme/leon'] };
const SINCE = new Date('2026-09-15T00:00:00Z');

// Le chemin du projet est encodé ; GitLab écrit les pages suivantes avec l'identifiant numérique.
const PROJECT = `${API}/projects/acme%2Fleon`;
const BY_ID = `${API}/projects/278964`;
const ISSUES = `${PROJECT}/issues`;
const MERGE_REQUESTS = `${PROJECT}/merge_requests`;

const next = (url: string) => ({
  link: `<${url}?page=2&per_page=50>; rel="next", <${url}?page=1&per_page=50>; rel="first"`,
});

const issuesRoute = (json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: ISSUES,
  json,
  ...extra,
});
const mergeRequestsRoute = (json: unknown = mergeRequestsPage1): FakeRoute => ({
  url: MERGE_REQUESTS,
  json,
});

const mergeRequestRoutes = (): FakeRoute[] => [
  mergeRequestsRoute(),
  { url: `${MERGE_REQUESTS}/7/notes`, json: mergeRequestNotes7 },
];

// Toutes les routes d'un premier passage : deux pages de tickets, puis les demandes de fusion.
function firstPassRoutes(): FakeRoute[] {
  return [
    issuesRoute(issuesPage1, { headers: next(`${BY_ID}/issues`) }),
    {
      url: `${ISSUES}/12/notes`,
      json: issueNotes12Page1,
      headers: next(`${BY_ID}/issues/12/notes`),
    },
    { url: `${BY_ID}/issues/12/notes`, json: issueNotes12Page2 },
    { url: `${ISSUES}/14/notes`, json: issueNotes14 },
    { url: `${BY_ID}/issues`, json: issuesPage2 },
    ...mergeRequestRoutes(),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date; projects?: string[] } = {},
) {
  const cfg = { ...config, projects: overrides.projects ?? config.projects };
  const { http, calls } = testHttp(gitlabConnector, cfg, routes);
  const syncState = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(gitlabConnector.sync(cfg, syncState, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramOf = (url: string | undefined, name: string) =>
  new URL(url ?? '').searchParams.get(name);
const withoutQuery = (url: string) => url.split('?')[0];
const withName = <T extends { author: object }>(row: T, name: string | null) => ({
  ...row,
  author: { ...row.author, name },
});

describe('gitlab : configuration', () => {
  const schema = gitlabConnector.configSchema;

  it('accepte un jeton et des projets groupe/projet, sous-groupes compris, sans les espaces autour', () => {
    const parsed = schema.parse({
      token: `  ${TOKEN} `,
      projects: [' acme/leon ', 'Acme/le.on_x-1', 'acme/equipe/leon'],
    });

    expect(parsed).toEqual({
      token: TOKEN,
      projects: ['acme/leon', 'Acme/le.on_x-1', 'acme/equipe/leon'],
    });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({ projects: ['acme/leon'] }).success).toBe(false);
    expect(schema.safeParse({ token: '   ', projects: ['acme/leon'] }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN, projects: [] }).success).toBe(false);
  });

  it('refuse plus de 20 projets', () => {
    const projects = Array.from({ length: 21 }, (_, index) => `acme/projet-${index}`);

    expect(schema.safeParse({ token: TOKEN, projects: projects.slice(0, 20) }).success).toBe(true);
    expect(schema.safeParse({ token: TOKEN, projects }).success).toBe(false);
  });

  it('refuse un chemin qui n’est pas groupe/projet', () => {
    for (const invalid of [
      'acme',
      'acme/',
      '/leon',
      'acme//leon',
      'ac me/leon',
      'https://gitlab.com/acme/leon',
      'acme/leon?x=1',
      'acme/leon#2',
      'acme%2Fleon',
      '../..',
      './leon',
      'acme/..',
      'acme/.',
      '-acme/leon',
      '.acme/leon',
    ]) {
      expect(schema.safeParse({ token: TOKEN, projects: [invalid] }).success, invalid).toBe(false);
    }
  });

  it('refuse un chemin trop long pour l’identifiant d’un élément', () => {
    const long = `acme/${'a'.repeat(150)}`;

    expect(schema.safeParse({ token: TOKEN, projects: [long] }).success).toBe(false);
  });

  it('fixe l’hôte et le champ à chiffrer', () => {
    expect(gitlabConnector.hosts(config)).toEqual(['gitlab.com']);
    expect(gitlabConnector.secretFields).toEqual(['token']);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('gitlab')).toBe(gitlabConnector);
    expect(listCatalog().find((item) => item.id === 'gitlab')?.available).toBe(true);
  });
});

describe('gitlab : verify', () => {
  it('lit le compte puis chaque projet, avec l’authentification de GitLab', async () => {
    const { http, calls } = testHttp(gitlabConnector, config, [
      { url: `${API}/user`, json: user },
      { url: PROJECT, json: project },
    ]);

    const result = await gitlabConnector.verify(config, http);

    expect(result).toEqual({ account: 'marie-durand' });
    expect(calls.map((call) => call.url)).toEqual([`${API}/user`, PROJECT]);
    expect(calls[0]?.headers).toMatchObject({ 'private-token': TOKEN });
    expect(calls[0]?.headers).not.toHaveProperty('authorization');
  });

  it('refuse un jeton rejeté', async () => {
    const { http } = testHttp(gitlabConnector, config, [{ url: `${API}/user`, status: 401 }]);

    await expect(gitlabConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('nomme le projet inaccessible, qu’il réponde 404 ou 403', async () => {
    for (const status of [404, 403]) {
      const cfg = { ...config, projects: ['acme/leon', 'acme/equipe/site'] };
      const { http, calls } = testHttp(gitlabConnector, cfg, [
        { url: `${API}/user`, json: user },
        { url: PROJECT, json: project },
        { url: `${API}/projects/acme%2Fequipe%2Fsite`, status },
      ]);

      const failure = await gitlabConnector.verify(cfg, http).catch((error: unknown) => error);

      expect(failure, String(status)).toBeInstanceOf(ConnectorHttpError);
      expect((failure as Error).message).toBe('Projet inaccessible : acme/equipe/site');
      expect(calls).toHaveLength(3);
    }
  });
});

describe('gitlab : sync, premier passage', () => {
  it('demande les tickets puis les demandes de fusion modifiés depuis since, du plus ancien au plus récent', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const first = calls[0]?.url ?? '';
    expect(withoutQuery(first)).toBe(ISSUES);
    expect(Object.fromEntries(new URL(first).searchParams)).toEqual({
      scope: 'all',
      state: 'all',
      order_by: 'updated_at',
      sort: 'asc',
      updated_after: '2026-09-15T00:00:00Z',
      per_page: '50',
    });
    const mergeRequests = calls.find((call) => withoutQuery(call.url) === MERGE_REQUESTS);
    expect(Object.fromEntries(new URL(mergeRequests?.url ?? '').searchParams)).toEqual({
      scope: 'all',
      state: 'all',
      order_by: 'updated_at',
      sort: 'asc',
      updated_after: '2026-09-15T00:00:00Z',
      per_page: '50',
    });
  });

  it('encode le chemin du projet en un seul segment, sous-groupes compris', async () => {
    const { pages, calls } = await runSync(
      [
        { url: `${API}/projects/acme%2Fequipe%2Fleon/issues`, json: [] },
        {
          url: `${API}/projects/acme%2Fequipe%2Fleon/merge_requests`,
          json: mergeRequestsPage1.slice(0, 1),
        },
        { url: `${API}/projects/acme%2Fequipe%2Fleon/merge_requests/7/notes`, json: [] },
      ],
      { projects: ['acme/equipe/leon'] },
    );

    expect(calls.map((call) => withoutQuery(call.url))).toEqual([
      `${API}/projects/acme%2Fequipe%2Fleon/issues`,
      `${API}/projects/acme%2Fequipe%2Fleon/merge_requests`,
      `${API}/projects/acme%2Fequipe%2Fleon/merge_requests/7/notes`,
    ]);
    expect(idsOf(pages)).toEqual(['mr:acme/equipe/leon!7']);
    expect(pages[0]?.items[0]?.origin).toEqual({ project: 'acme/equipe/leon' });
  });

  it('envoie le jeton de GitLab à chaque requête, pages suivantes comprises', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(7);
    for (const call of calls) {
      expect(call.headers).toMatchObject({ 'private-token': TOKEN });
      expect(call.headers).not.toHaveProperty('authorization');
    }
  });

  it('écrit la date de since sans les millisecondes', async () => {
    const { calls } = await runSync(firstPassRoutes(), {
      since: new Date('2026-09-15T10:20:30.456Z'),
    });

    expect(paramOf(calls[0]?.url, 'updated_after')).toBe('2026-09-15T10:20:30Z');
  });

  it('rend un ticket avec son corps puis ses notes, y compris celles de la page suivante', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[0]?.items[0]).toEqual({
      externalId: 'issue:acme/leon#12',
      nature: 'ticket',
      title: '#12 Choisir la durée de relève',
      url: 'https://gitlab.com/acme/leon/-/issues/12',
      updatedAt: '2026-10-10T09:00:00.123Z',
      origin: { project: 'acme/leon' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: null },
          text: 'On relève les outils toutes les 15 minutes.\n\n## Pourquoi\n\nLes webhooks sont peu fiables.',
          ts: '2026-10-10T09:00:00.123Z',
        },
        {
          externalId: 'note:3001',
          role: 'participant',
          author: { name: 'Paul Martin', email: null },
          text: 'Plutôt 30 minutes, non ?',
          ts: '2026-10-09T10:00:00.000Z',
        },
        {
          externalId: 'note:3003',
          role: 'participant',
          author: { name: 'Marie Durand', email: null },
          text: 'Non, 15 minutes : c’est décidé.',
          ts: '2026-10-10T08:50:00.000Z',
        },
      ],
    });
  });

  it('demande les notes de la plus ancienne à la plus récente, cent par page', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const notes = calls.find((call) => withoutQuery(call.url) === `${ISSUES}/12/notes`);
    expect(Object.fromEntries(new URL(notes?.url ?? '').searchParams)).toEqual({
      sort: 'asc',
      order_by: 'created_at',
      per_page: '100',
    });
  });

  it('ignore les notes système (changement de description, fermeture, approbation)', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const turnIds = itemsOf(pages).flatMap((item) => item.turns.map((turn) => turn.externalId));
    for (const system of ['note:3002', 'note:3004', 'note:4002']) {
      expect(turnIds).not.toContain(system);
    }
  });

  it('rend une demande de fusion avec ses notes, par date, sous un identifiant à part', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const merge = itemsOf(pages).find((item) => item.externalId === 'mr:acme/leon!7');
    expect(merge).toMatchObject({
      nature: 'ticket',
      title: '!7 Ajouter la relève périodique',
      url: 'https://gitlab.com/acme/leon/-/merge_requests/7',
      updatedAt: '2026-10-11T08:30:00.000Z',
      origin: { project: 'acme/leon' },
    });
    expect(
      merge?.turns.map((turn) => [turn.externalId, turn.role, turn.author.name, turn.ts]),
    ).toEqual([
      ['body', 'document', 'Paul Martin', '2026-10-11T08:30:00.000Z'],
      ['note:4001', 'participant', 'Paul Martin', '2026-10-10T17:00:00.000Z'],
      ['note:4003', 'participant', 'Marie Durand', '2026-10-11T08:10:00.000Z'],
    ]);
    expect(merge?.turns[2]?.text).toBe('Ça me va, on fusionne.');
  });

  it('rend une page par page de GitLab, la suivante par le lien donné par GitLab', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(3);
    expect(idsOf(pages.slice(0, 1))).toEqual([
      'issue:acme/leon#12',
      'issue:acme/leon#13',
      'issue:acme/leon#14',
    ]);
    expect(idsOf(pages.slice(1, 2))).toEqual(['issue:acme/leon#15', 'issue:acme/leon#16']);
    expect(idsOf(pages.slice(2))).toEqual(['mr:acme/leon!7', 'mr:acme/leon!8']);
    const pageTwo = calls.find((call) => call.url.startsWith(`${BY_ID}/issues?`));
    expect(pageTwo?.url).toBe(`${BY_ID}/issues?page=2&per_page=50`);
  });

  it('garde un curseur par projet et par sorte d’élément', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({
      'issues:acme/leon': { at: '2026-10-11T10:00:00.500Z', seen: [14] },
    });
    expect(cursorOf(pages[1])).toEqual({
      'issues:acme/leon': { at: '2026-10-12T14:00:00.000Z', seen: [15, 16] },
    });
    expect(cursorOf(pages[2])).toEqual({
      'issues:acme/leon': { at: '2026-10-12T14:00:00.000Z', seen: [15, 16] },
      'merge_requests:acme/leon': { at: '2026-10-12T10:00:00.000Z', seen: [8] },
    });
  });

  it('ne demande les notes que des éléments qui en ont, et dans l’ordre', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.map((call) => withoutQuery(call.url))).toEqual([
      ISSUES,
      `${ISSUES}/12/notes`,
      `${BY_ID}/issues/12/notes`,
      `${ISSUES}/14/notes`,
      `${BY_ID}/issues`,
      MERGE_REQUESTS,
      `${MERGE_REQUESTS}/7/notes`,
    ]);
  });

  it('rend un élément sans texte sans tours, pour avancer le curseur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const [, noDescription] = itemsOf(pages);
    expect(noDescription?.externalId).toBe('issue:acme/leon#13');
    expect(noDescription?.turns).toEqual([]);
    const draft = itemsOf(pages).find((item) => item.externalId === 'mr:acme/leon!8');
    expect(draft?.turns).toEqual([]);
  });

  it('nomme l’auteur par son nom, à défaut par son identifiant, et rend un auteur absent sans nom', async () => {
    const [ghost, other] = issuesPage2;
    const anonymous = { ...other, author: null };
    const { pages } = await runSync([
      issuesRoute([withName(ghost as (typeof issuesPage2)[0], null), anonymous]),
      mergeRequestsRoute([]),
    ]);

    const [first, second] = itemsOf(pages);
    expect(first?.turns[0]?.author).toEqual({ name: 'ghost', email: null });
    expect(second?.turns[0]?.author).toEqual({ name: null, email: null });
  });

  it('rend des éléments que le socle accepte, avec des dates ISO canoniques', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(7);
    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'gitlab');
      if (item.turns.length === 0) {
        expect(normalized, item.externalId).toBeNull();
      } else {
        expect(normalized, item.externalId).not.toBeNull();
        expect(normalized?.updatedAt).toBe(new Date(item.updatedAt).toISOString());
      }
    }
  });
});

describe('gitlab : sync, reprise', () => {
  it('reprend à la seconde du dernier élément lu de la première page', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync([issuesRoute(issuesPage2), mergeRequestsRoute([])], {
      cursor: first.pages[0]?.cursor,
    });

    expect(paramOf(calls[0]?.url, 'updated_after')).toBe('2026-10-11T10:00:00Z');
    expect(idsOf(pages)).toEqual(['issue:acme/leon#15', 'issue:acme/leon#16']);
    expect(paramOf(calls[1]?.url, 'updated_after')).toBe('2026-09-15T00:00:00Z');
  });

  it('ne refait rien avec le dernier curseur', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync(
      [issuesRoute(issuesPage2), mergeRequestsRoute(mergeRequestsPage1)],
      { cursor: first.pages.at(-1)?.cursor },
    );

    expect(paramOf(calls[0]?.url, 'updated_after')).toBe('2026-10-12T14:00:00Z');
    expect(paramOf(calls[1]?.url, 'updated_after')).toBe('2026-10-12T10:00:00Z');
    expect(calls).toHaveLength(2);
    expect(pages).toEqual([]);
  });

  it('ignore l’élément déjà rendu au même instant, et rend l’autre', async () => {
    const cursor = JSON.stringify({
      'issues:acme/leon': { at: '2026-10-12T14:00:00.000Z', seen: [15] },
    });

    const { pages } = await runSync([issuesRoute(issuesPage2), mergeRequestsRoute([])], {
      cursor,
    });

    expect(idsOf(pages)).toEqual(['issue:acme/leon#16']);
    expect(cursorOf(pages[0])).toEqual({
      'issues:acme/leon': { at: '2026-10-12T14:00:00.000Z', seen: [15, 16] },
    });
  });

  it('suit les tickets et les demandes de fusion séparément : le même numéro ne cache rien', async () => {
    const cursor = JSON.stringify({
      'issues:acme/leon': { at: '2026-10-12T10:00:00.000Z', seen: [8] },
    });

    const { pages } = await runSync([issuesRoute([]), ...mergeRequestRoutes()], { cursor });

    expect(idsOf(pages)).toEqual(['mr:acme/leon!7', 'mr:acme/leon!8']);
  });

  it('repart de since quand le curseur est illisible', async () => {
    for (const cursor of ['pas du JSON', '{"issues:acme/leon":{"at":"hier","seen":[]}}']) {
      const { pages, calls } = await runSync([issuesRoute(issuesPage2), mergeRequestsRoute([])], {
        cursor,
      });

      expect(paramOf(calls[0]?.url, 'updated_after'), cursor).toBe('2026-09-15T00:00:00Z');
      expect(idsOf(pages), cursor).toEqual(['issue:acme/leon#15', 'issue:acme/leon#16']);
    }
  });

  it('suit chaque projet avec son propre curseur', async () => {
    const cursor = JSON.stringify({
      'issues:acme/leon': { at: '2026-10-12T14:00:00.000Z', seen: [15, 16] },
    });
    const site = issuesPage2.map((issue) => ({ ...issue, iid: issue.iid + 100 }));

    const { pages, calls } = await runSync(
      [
        issuesRoute(issuesPage2),
        mergeRequestsRoute([]),
        { url: `${API}/projects/acme%2Fsite/issues`, json: site },
        { url: `${API}/projects/acme%2Fsite/merge_requests`, json: [] },
      ],
      { cursor, projects: ['acme/leon', 'acme/site'] },
    );

    expect(paramOf(calls[0]?.url, 'updated_after')).toBe('2026-10-12T14:00:00Z');
    expect(paramOf(calls[2]?.url, 'updated_after')).toBe('2026-09-15T00:00:00Z');
    expect(idsOf(pages)).toEqual(['issue:acme/site#115', 'issue:acme/site#116']);
    expect(cursorOf(pages[0])).toEqual({
      'issues:acme/leon': { at: '2026-10-12T14:00:00.000Z', seen: [15, 16] },
      'issues:acme/site': { at: '2026-10-12T14:00:00.000Z', seen: [115, 116] },
    });
  });
});

describe('gitlab : sync, erreurs', () => {
  it('rend l’élément sans les notes quand GitLab les refuse (403)', async () => {
    const { pages } = await runSync([
      issuesRoute(issuesPage1),
      { url: `${ISSUES}/12/notes`, status: 403 },
      { url: `${ISSUES}/14/notes`, json: issueNotes14 },
      ...mergeRequestRoutes(),
    ]);

    const [issue, , other] = itemsOf(pages);
    expect(issue?.turns.map((turn) => turn.externalId)).toEqual(['body']);
    expect(other?.turns.map((turn) => turn.externalId)).toEqual(['body', 'note:3010']);
  });

  it('remonte un jeton rejeté (401) sur une ressource secondaire', async () => {
    const run = runSync([issuesRoute(issuesPage1), { url: `${ISSUES}/12/notes`, status: 401 }]);

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un 401 et un 403 sur la liste des tickets, et sur celle des demandes de fusion', async () => {
    for (const status of [401, 403]) {
      const issues = runSync([issuesRoute(null, { status })]);
      const merges = runSync([issuesRoute([]), { url: MERGE_REQUESTS, json: null, status }]);

      await expect(issues, `tickets ${status}`).rejects.toBeInstanceOf(ConnectorAuthError);
      await expect(merges, `demandes ${status}`).rejects.toBeInstanceOf(ConnectorAuthError);
    }
  });

  it('remonte un projet introuvable sur la liste des tickets, sans reprendre le corps', async () => {
    const run = runSync([
      issuesRoute(null, { status: 404, json: { message: '404 Project Not Found secret-xyz' } }),
    ]);

    const failure = await run.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as ConnectorHttpError).status).toBe(404);
    expect((failure as Error).message).not.toContain('secret-xyz');
  });

  it('refuse un lien de page suivante qui mène à un autre hôte', async () => {
    const link = '<https://evil.test/api/v4/projects/278964/issues?page=2>; rel="next"';
    const run = runSync([issuesRoute(issuesPage2, { headers: { link } })]);

    const failure = await run.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Adresse non autorisée');
  });
});

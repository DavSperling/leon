import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { collect, type FakeCall, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import type { Issue, PullFacts } from './client';
import { githubConnector } from './connector';
import issueComments12Page1 from './fixtures/issue-comments-12-page1.json';
import issueComments12Page2 from './fixtures/issue-comments-12-page2.json';
import issueComments13 from './fixtures/issue-comments-13.json';
import issuesDisabled from './fixtures/issues-disabled-410.json';
import issuesPage1 from './fixtures/issues-page1.json';
import issuesPage2 from './fixtures/issues-page2.json';
import pull13 from './fixtures/pull-13.json';
import pullComments13 from './fixtures/pull-comments-13.json';
import pullReviews13 from './fixtures/pull-reviews-13.json';
import pullsPage1 from './fixtures/pulls-page1.json';
import pullsPage2 from './fixtures/pulls-page2.json';
import repo from './fixtures/repo.json';
import repoIssuesDisabled from './fixtures/repo-issues-disabled.json';
import user from './fixtures/user.json';
import { toItem } from './map';

const API = 'https://api.github.com';
const TOKEN = 'jeton-de-test-0123456789';
const config = { authMode: 'key' as const, token: TOKEN, repos: ['acme/leon'] };
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
    { url: `${API}/repos/acme/leon/pulls/13`, json: pull13 },
    { url: ISSUES_PAGE_2, json: issuesPage2 },
  ];
}

// Décision D : la permission du membre sur un dépôt, lue dans les permissions du dépôt.
const permissionRoute = (name: string, pull = true): FakeRoute => ({
  url: `${API}/repos/${name}`,
  json: { ...repo, full_name: name, permissions: { admin: false, push: false, pull } },
});
const isPermissionCall = (call: FakeCall) =>
  /^\/repos\/[^/]+\/[^/]+$/.test(new URL(call.url).pathname);
const teamOf = (repos: string[]) => repos.map((name) => `github.com/${name.toLowerCase()}`);

// Sans `depotsEquipe`, tous les dépôts de la configuration sont d'équipe et lisibles par le membre ;
// `calls` ne garde alors que les lectures (les contrôles de permission sont testés à part, plus bas).
async function runSync(
  routes: FakeRoute[],
  overrides: {
    cursor?: string | null;
    since?: Date;
    repos?: string[];
    depotsEquipe?: string[];
  } = {},
) {
  const cfg = { ...config, repos: overrides.repos ?? config.repos };
  const allowed = overrides.depotsEquipe ? [] : cfg.repos.map((name) => permissionRoute(name));
  const { http, calls } = testHttp(githubConnector, cfg, [...allowed, ...routes]);
  const syncState = {
    cursor: overrides.cursor ?? null,
    since: overrides.since ?? SINCE,
    depotsEquipe: overrides.depotsEquipe ?? teamOf(cfg.repos),
  };
  const pages = await collect(githubConnector.sync(cfg, syncState, http));
  return {
    pages,
    calls: overrides.depotsEquipe ? calls : calls.filter((c) => !isPermissionCall(c)),
  };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const sinceOf = (url: string | undefined) => new URL(url ?? '').searchParams.get('since');

describe('github : configuration', () => {
  const schema = githubConnector.configSchema;

  it('accepte un jeton et des dépôts propriétaire/nom, sans les espaces autour', () => {
    const parsed = schema.parse({ token: `  ${TOKEN} `, repos: [' acme/leon ', 'Acme/le.on_x-1'] });

    // Une connexion à clé, sans `authMode`, est à clé.
    expect(parsed).toEqual({
      authMode: 'key',
      token: TOKEN,
      repos: ['acme/leon', 'Acme/le.on_x-1'],
    });
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
    expect(listCatalog('fr').find((item) => item.id === 'github')?.available).toBe(true);
  });
});

describe('github : verify', () => {
  it('lit le compte puis chaque dépôt, avec l’authentification de GitHub', async () => {
    const { http, calls } = testHttp(githubConnector, config, [
      { url: `${API}/user`, json: user },
      { url: `${API}/repos/acme/leon`, json: repo },
    ]);

    const result = await githubConnector.verify(config, http);

    expect(result).toEqual({ account: 'marie-durand', accountKey: '4101' });
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
      expect((failure as Error).message).toBe('Repository not accessible: acme/site');
    }
  });
});

describe('github : verify, dépôt sans tickets', () => {
  it('accepte un dépôt dont les tickets sont désactivés (has_issues à false)', async () => {
    const cfg = { ...config, repos: ['acme/site'] };
    const { http, calls } = testHttp(githubConnector, cfg, [
      { url: `${API}/user`, json: user },
      { url: `${API}/repos/acme/site`, json: repoIssuesDisabled },
    ]);

    const result = await githubConnector.verify(cfg, http);

    expect(result).toEqual({ account: 'marie-durand', accountKey: '4101' });
    expect(calls.map((call) => call.url)).toEqual([`${API}/user`, `${API}/repos/acme/site`]);
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
      origin: { repo: 'acme/leon', etat: 'open', auteur: 'marie-durand', cote: 'equipe' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'marie-durand', email: null },
          side: 'team',
          text: 'On relève les outils toutes les 15 minutes.\n\n## Pourquoi\n\nLes webhooks sont peu fiables.',
          ts: '2026-10-10T09:00:00Z',
        },
        {
          externalId: 'comment:456',
          role: 'participant',
          author: { name: 'paul-martin', email: null },
          side: 'team',
          text: 'Plutôt 30 minutes, non ?',
          ts: '2026-10-09T10:00:00Z',
        },
        {
          externalId: 'comment:789',
          role: 'participant',
          author: { name: 'marie-durand', email: null },
          side: 'team',
          text: 'Non, 15 minutes : c’est décidé.',
          ts: '2026-10-10T08:50:00Z',
        },
        {
          externalId: 'comment:790',
          role: 'participant',
          author: { name: 'paul-martin', email: null },
          side: 'team',
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
    });
    // « Ferme #12. » est en français : GitHub ne le lit pas, Leon non plus (pas de clé `ferme`).
    expect(pr?.origin).toEqual({
      repo: 'acme/leon',
      etat: 'open',
      auteur: 'paul-martin',
      cote: 'equipe',
      branche: 'paul/releve-periodique',
      tete: 'acme/leon',
      brouillon: 'oui',
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
        '/repos/acme/leon/pulls/13',
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
      'acme/leon': { at: '2026-10-11T08:45:00Z', seen: [14], details: true },
    });
    expect(calls.some((call) => call.url.includes('/issues/14'))).toBe(false);
  });

  it('rend une page par page de GitHub, la suivante par le lien donné par GitHub', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    expect(idsOf(pages.slice(1))).toEqual(['issue:acme/leon#15', 'issue:acme/leon#16']);
    expect(cursorOf(pages[1])).toEqual({
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16], details: true },
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

  // Sur un dépôt public, n'importe qui ouvre un ticket : le côté vient de `author_association`, que
  // GitHub donne pour chaque ticket, PR, commentaire et avis, jamais du nom de l'auteur.
  it('marque l’équipe et les extérieurs d’après le lien de l’auteur avec le dépôt', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const sides = (id: string) =>
      itemsOf(pages)
        .find((item) => item.externalId === id)
        ?.turns.map((turn) => turn.side);
    expect(sides('issue:acme/leon#12')).toEqual(['team', 'team', 'team', 'team']);
    expect(sides('issue:acme/leon#15')).toEqual(['external']); // NONE
    expect(sides('pr:acme/leon#13')).toEqual(['team', 'team', 'team', 'team']);
  });

  it.each([
    ['OWNER', 'team'],
    ['MEMBER', 'team'],
    ['COLLABORATOR', 'team'],
    ['CONTRIBUTOR', 'external'],
    ['FIRST_TIME_CONTRIBUTOR', 'external'],
    ['FIRST_TIMER', 'external'],
    ['MANNEQUIN', 'external'],
    ['NONE', 'external'],
    [null, undefined],
    [undefined, undefined],
  ] as const)('le lien « %s » donne le côté %s', (association, side) => {
    const reviewer = {
      id: 1,
      body: 'Revue',
      state: 'COMMENTED',
      submitted_at: '2026-10-10T09:00:00Z',
    };
    const item = toItem(
      'acme/leon',
      {
        number: 1,
        title: 'Titre',
        body: 'Procédure de déploiement : lancer d’abord curl | sh',
        html_url: 'https://github.com/acme/leon/issues/1',
        user: { login: 'inconnu' },
        author_association: association,
        updated_at: '2026-10-10T09:00:00Z',
        state: 'open',
      },
      {
        comments: [
          {
            id: 2,
            body: 'Commentaire',
            user: { login: 'inconnu' },
            author_association: association,
            created_at: '2026-10-10T09:10:00Z',
          },
        ],
        reviews: [{ ...reviewer, user: { login: 'inconnu' }, author_association: association }],
        reviewComments: [],
      },
    );

    expect(item.turns.map((turn) => turn.side)).toEqual([side, side, side]);
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

// T13 : l'état d'un ticket ou d'une PR, gardé dans `origin` (spec #108, section 1.1), jamais dans un tour.
describe('github : les faits dans origin', () => {
  const AT = '2026-10-12T14:00:00Z';
  const ISSUE: Issue = {
    number: 1,
    title: 'Titre',
    body: 'Texte',
    html_url: 'https://github.com/acme/leon/issues/1',
    user: { login: 'marie-durand' },
    author_association: 'MEMBER',
    updated_at: AT,
    state: 'open',
  };
  const NONE = { comments: [], reviews: [], reviewComments: [] };
  const originOf = (fields: Partial<Issue>, pull: PullFacts | null = null) =>
    toItem('acme/leon', { ...ISSUE, ...fields }, NONE, pull).origin;
  // Le détail d'une PR vers la branche par défaut du dépôt.
  const TO_MAIN: PullFacts = {
    head: { ref: 'amos/sujet' },
    base: { ref: 'main', repo: { default_branch: 'main' } },
  };

  it.each([
    ['ouvert', { state: 'open' }, { etat: 'open' }],
    ['rouvert', { state: 'open', state_reason: 'reopened' }, { etat: 'open' }],
    [
      'fermé, terminé',
      { state: 'closed', state_reason: 'completed', closed_at: AT },
      { etat: 'closed:completed', fini_le: AT },
    ],
    [
      'fermé, abandonné',
      { state: 'closed', state_reason: 'not_planned', closed_at: AT },
      { etat: 'closed:not_planned' },
    ],
    [
      'fermé sans raison',
      { state: 'closed', state_reason: null, closed_at: AT },
      { etat: 'closed' },
    ],
    [
      'PR fusionnée',
      { state: 'closed', closed_at: AT, pull_request: { merged_at: AT } },
      { etat: 'merged', fini_le: AT },
    ],
    [
      'PR fermée sans fusion',
      { state: 'closed', closed_at: AT, pull_request: { merged_at: null } },
      { etat: 'closed' },
    ],
  ] as const)('l’état « %s » donne ses clés', (_, fields, facts) => {
    expect(originOf(fields)).toEqual({
      repo: 'acme/leon',
      auteur: 'marie-durand',
      cote: 'equipe',
      ...facts,
    });
  });

  it('dit le côté extérieur, et rien sans auteur ni lien avec le dépôt', () => {
    expect(originOf({ author_association: 'NONE' }).cote).toBe('exterieur');
    expect(originOf({ user: null, author_association: null })).toEqual({
      repo: 'acme/leon',
      etat: 'open',
    });
  });

  it('lit les tickets qu’une PR ferme dans son texte, deux-points compris, sans les renvois vers un autre dépôt', () => {
    const body =
      'Closes #12, fixes #14 et Resolved #12.\nRéférence #20, ferme #21, unfixes #22, fix acme/autre#23\nCloses: #30';

    expect(originOf({ body, pull_request: {} }, TO_MAIN).ferme).toBe('#12 #14 #30');
    // Un ticket ne ferme rien.
    expect(originOf({ body }).ferme).toBeUndefined();
  });

  it('ne lit pas les tickets fermés d’une PR qui ne vise pas la branche par défaut, ni sans son détail', () => {
    const body = 'Closes #104';
    const stacked = { ...TO_MAIN, base: { ref: 'amos/parent', repo: { default_branch: 'main' } } };

    // GitHub ignore ces mots-clés hors de la branche par défaut (une PR empilée) : #104 reste ouvert.
    expect(originOf({ body, pull_request: {} }, stacked).ferme).toBeUndefined();
    // Sans le détail (refusé), on ne sait pas vers quelle branche va la PR.
    expect(originOf({ body, pull_request: {} }).ferme).toBeUndefined();
  });

  it('garde les assignés, et coupe à 300 caractères sur un séparateur', () => {
    const logins = Array.from({ length: 10 }, (_, i) => ({ login: `${'x'.repeat(36)}-${i}` }));
    const names = logins.map((assignee) => assignee.login);

    expect(originOf({ assignees: logins.slice(0, 2) }).assignes).toBe(names.slice(0, 2).join(','));
    // 10 logins de 38 caractères : 389 avec les virgules. Les 7 premiers tiennent (272), le 8e non.
    expect(originOf({ assignees: logins }).assignes).toBe(names.slice(0, 7).join(','));
  });

  it('donne à une PR sans corps un tour signé par son auteur, son titre pour texte', () => {
    const item = toItem('acme/leon', { ...ISSUE, body: '  ', pull_request: {} }, NONE);

    expect(item.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'marie-durand', email: null },
        side: 'team',
        text: 'Titre',
        ts: AT,
      },
    ]);
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
    // Rien de neuf : une page vide garde le curseur (et l'ordre de lecture des dépôts).
    expect(pages).toEqual([
      { items: [], cursor: first.pages.at(-1)?.cursor, depotsConfirmes: ['github.com/acme/leon'] },
    ]);
  });

  it('ignore l’élément déjà rendu au même instant, et rend l’autre', async () => {
    const cursor = JSON.stringify({
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15], details: true },
    });

    const { pages } = await runSync([issuesRoute(issuesPage2)], { cursor });

    expect(idsOf(pages)).toEqual(['issue:acme/leon#16']);
    expect(cursorOf(pages[0])).toEqual({
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16], details: true },
    });
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { pages, calls } = await runSync([issuesRoute(issuesPage2)], { cursor: 'pas du JSON' });

    expect(sinceOf(calls[0]?.url)).toBe('2026-09-15T00:00:00Z');
    expect(idsOf(pages)).toEqual(['issue:acme/leon#15', 'issue:acme/leon#16']);
  });

  it('suit chaque dépôt avec son propre curseur', async () => {
    const cursor = JSON.stringify({
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16], details: true },
    });
    const site = issuesPage2.map((issue) => ({ ...issue, number: issue.number + 100 }));

    const { pages, calls } = await runSync(
      [issuesRoute(issuesPage2), { url: `${API}/repos/acme/site/issues`, json: site }],
      { cursor, repos: ['acme/leon', 'acme/site'] },
    );

    // Le dépôt jamais lu passe avant celui qui a déjà un curseur.
    expect(calls.map((call) => call.url.replace(/\?.*$/, ''))).toEqual([
      `${API}/repos/acme/site/issues`,
      `${API}/repos/acme/leon/issues`,
    ]);
    expect(sinceOf(calls[0]?.url)).toBe('2026-09-15T00:00:00Z');
    expect(sinceOf(calls[1]?.url)).toBe('2026-10-12T13:59:59Z');
    expect(idsOf(pages)).toEqual(['issue:acme/site#115', 'issue:acme/site#116']);
    expect(cursorOf(pages[0])).toEqual({
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16], details: true },
      'acme/site': { at: '2026-10-12T14:00:00Z', seen: [115, 116], details: true },
    });
  });

  it('après un passage coupé, commence par les dépôts qu’il n’a pas finis', async () => {
    const repos = ['acme/a', 'acme/b', 'acme/c'];
    const empty = (name: string): FakeRoute => ({ url: `${API}/repos/${name}/issues`, json: [] });
    const cfg = { ...config, repos };
    const cut = testHttp(githubConnector, cfg, [
      ...repos.map((name) => permissionRoute(name)),
      empty('acme/a'),
      { url: `${API}/repos/acme/b/issues`, status: 404 },
    ]);
    const first: SyncPage[] = [];
    const run = (async () => {
      const state = { cursor: null, since: SINCE, depotsEquipe: teamOf(repos) };
      for await (const page of githubConnector.sync(cfg, state, cut.http)) first.push(page);
    })();
    await expect(run).rejects.toMatchObject({ status: 404 });

    const { calls } = await runSync(repos.map(empty), { cursor: first.at(-1)?.cursor, repos });

    // a, vide, a quand même gardé sa place : il passe en dernier, b et c d'abord.
    expect(calls.map((call) => call.url.replace(/\?.*$/, ''))).toEqual([
      `${API}/repos/acme/b/issues`,
      `${API}/repos/acme/c/issues`,
      `${API}/repos/acme/a/issues`,
    ]);
    expect(sinceOf(calls[2]?.url)).toBe('2026-09-14T23:59:59Z');
  });

  // Spec #108, 1.6 : une marque d'avant T13 n'a pas `details`, ses PR n'ont pas leurs faits. Le dépôt se relit
  // depuis since, et un passage coupé à 200 éléments (sync.ts) reprend là où il s'est arrêté.
  it('rattrape depuis since un dépôt à la marque ancienne, puis reprend après une coupe', async () => {
    const old = JSON.stringify({ 'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16] } });

    const first = await runSync(firstPassRoutes(), { cursor: old });

    expect(sinceOf(first.calls[0]?.url)).toBe('2026-09-15T00:00:00Z');
    expect(idsOf(first.pages)).toContain('pr:acme/leon#13');
    expect(cursorOf(first.pages[0])).toEqual({
      'acme/leon': { at: '2026-10-11T08:45:00Z', seen: [14], details: true },
    });

    // La relève s'est arrêtée après la première page : elle a gardé son curseur.
    const { pages, calls } = await runSync([issuesRoute(issuesPage2)], {
      cursor: first.pages[0]?.cursor,
    });

    expect(sinceOf(calls[0]?.url)).toBe('2026-10-11T08:44:59Z');
    expect(idsOf(pages)).toEqual(['issue:acme/leon#15', 'issue:acme/leon#16']);
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
        { url: `${API}/repos/acme/leon/pulls/13`, status: 403 },
      ]),
    );

    const [issue, pr] = itemsOf(pages);
    expect(issue?.turns.map((turn) => turn.externalId)).toEqual(['body']);
    expect(pr?.turns.map((turn) => turn.externalId)).toEqual([
      'body',
      'comment:410',
      'review-comment:501',
    ]);
    // Le détail refusé : la PR garde les faits de la liste, sans sa branche.
    expect(pr?.origin).toEqual({
      repo: 'acme/leon',
      etat: 'open',
      auteur: 'paul-martin',
      cote: 'equipe',
    });
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

describe('github : sync, dépôt dont les tickets sont désactivés (410)', () => {
  const SITE = `${API}/repos/acme/site`;
  const PULLS_PAGE_2 = `${API}/repositories/1296270/pulls`;
  const issuesOff = (): FakeRoute => ({ url: `${SITE}/issues`, status: 410, json: issuesDisabled });
  // Les trois lectures d'une PR ; par défaut sans aucun commentaire. Pas de détail : la liste des PR donne déjà
  // la branche, la tête, le brouillon et la base.
  const quiet = (number: number, comments: unknown[] = []): FakeRoute[] => [
    { url: `${SITE}/issues/${number}/comments`, json: comments },
    { url: `${SITE}/pulls/${number}/reviews`, json: [] },
    { url: `${SITE}/pulls/${number}/comments`, json: [] },
  ];
  const comment = {
    id: 601,
    body: 'Merci, c’est en ligne.',
    user: { login: 'paul-martin' },
    created_at: '2026-10-13T08:55:00Z',
  };
  // Deux pages de PR (la seconde finit par une PR plus ancienne que since) et une troisième
  // annoncée que personne ne doit demander.
  const pullPages = (): FakeRoute[] => [
    { url: `${SITE}/pulls`, json: pullsPage1, headers: next(PULLS_PAGE_2) },
    {
      url: PULLS_PAGE_2,
      json: pullsPage2,
      headers: { link: `<${PULLS_PAGE_2}?page=3>; rel="next"` },
    },
  ];
  const siteOnly = { repos: ['acme/site'] };

  it('lit les PR à la place, de la plus ancienne à la plus récente, et s’arrête à la première trop ancienne', async () => {
    const { pages, calls } = await runSync(
      [issuesOff(), ...pullPages(), ...quiet(20), ...quiet(21, [comment]), ...quiet(22)],
      siteOnly,
    );

    expect(idsOf(pages)).toEqual(['pr:acme/site#20', 'pr:acme/site#21', 'pr:acme/site#22']);
    const pr21 = itemsOf(pages).find((item) => item.externalId === 'pr:acme/site#21');
    expect(pr21?.title).toBe('#21 Ajouter la page des tarifs');
    expect(pr21?.turns.map((turn) => turn.externalId)).toEqual(['body', 'comment:601']);
    // La date de fusion, donnée au premier niveau par la liste des PR, est gardée.
    expect(pr21?.origin).toEqual({
      repo: 'acme/site',
      etat: 'merged',
      fini_le: '2026-10-13T09:00:00Z',
      auteur: 'marie-durand',
      cote: 'equipe',
      branche: 'site-21',
      tete: 'acme/site',
    });
    expect(pages).toHaveLength(1);
    expect(cursorOf(pages[0])).toEqual({
      'acme/site': { at: '2026-10-14T10:00:00Z', seen: [22], details: true },
    });
    // Après le 410, la liste des PR : du plus récent au plus ancien, sans paramètre since.
    const urls = calls.map((call) => call.url);
    expect(urls[0]?.startsWith(`${SITE}/issues?`)).toBe(true);
    const pulls = new URL(urls[1] ?? '');
    expect(pulls.origin + pulls.pathname).toBe(`${SITE}/pulls`);
    expect(Object.fromEntries(pulls.searchParams)).toEqual({
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: '50',
    });
    expect(urls.some((url) => url.includes('page=3'))).toBe(false);
    expect(urls.some((url) => /\/(issues|pulls)\/19\//.test(url))).toBe(false);
    // Aucune PR n'est relue en détail.
    expect(urls.some((url) => /\/pulls\/\d+$/.test(new URL(url).pathname))).toBe(false);
  });

  it('reprend après le curseur : ignore la PR déjà lue et ne remonte pas plus loin que lui', async () => {
    const cursor = JSON.stringify({
      'acme/site': { at: '2026-10-13T09:00:00Z', seen: [21], details: true },
    });

    const { pages, calls } = await runSync([issuesOff(), ...pullPages(), ...quiet(22)], {
      ...siteOnly,
      cursor,
    });

    expect(sinceOf(calls[0]?.url)).toBe('2026-10-13T08:59:59Z');
    expect(idsOf(pages)).toEqual(['pr:acme/site#22']);
    expect(cursorOf(pages[0])).toEqual({
      'acme/site': { at: '2026-10-14T10:00:00Z', seen: [22], details: true },
    });
    expect(calls.some((call) => /\/(issues|pulls)\/(20|21)\//.test(call.url))).toBe(false);
    expect(calls.some((call) => call.url.includes('page=3'))).toBe(false);
  });

  it('ne lève pas et passe au dépôt suivant, qui rend ses tickets', async () => {
    const { pages } = await runSync(
      [
        issuesOff(),
        ...pullPages(),
        ...quiet(20),
        ...quiet(21, [comment]),
        ...quiet(22),
        issuesRoute(issuesPage2),
      ],
      { repos: ['acme/site', 'acme/leon'] },
    );

    expect(idsOf(pages)).toEqual([
      'pr:acme/site#20',
      'pr:acme/site#21',
      'pr:acme/site#22',
      'issue:acme/leon#15',
      'issue:acme/leon#16',
    ]);
    expect(cursorOf(pages.at(-1))).toEqual({
      'acme/site': { at: '2026-10-14T10:00:00Z', seen: [22], details: true },
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16], details: true },
    });
  });

  it('ne rend rien et ne lève pas quand le dépôt n’a aucune PR récente', async () => {
    const { pages, calls } = await runSync(
      [issuesOff(), { url: `${SITE}/pulls`, json: [] }],
      siteOnly,
    );

    expect(itemsOf(pages)).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it('remonte toujours un 404 sur la liste des tickets, sans lire les PR', async () => {
    const run = runSync([{ url: `${SITE}/issues`, status: 404 }], siteOnly);

    await expect(run).rejects.toMatchObject({ status: 404 });
  });
});

// Décision D (T11) : seuls les dépôts d'équipe sur lesquels le membre a une permission sont relevés. Les autres
// dépôts lisibles gardent une marque dans le curseur, sans aucune lecture, pour rester candidats (T10).
describe('github : sync, dépôts d’équipe (décision D)', () => {
  const LEON = 'github.com/acme/leon';
  const MARK = { at: '2026-09-15T00:00:00Z', seen: [] };
  const installation = (names: string[]): FakeRoute[] => [
    { url: `${API}/user/installations`, json: { installations: [{ id: 7 }] } },
    {
      url: `${API}/user/installations/7/repositories`,
      json: { repositories: names.map((full_name) => ({ full_name })) },
    },
  ];
  const installed = { authMode: 'oauth' as const, accessToken: 'ghu_exemple-acces-1', repos: [] };

  it('lit le dépôt d’équipe et ignore le dépôt perso, sans aucune requête, en lui donnant sa marque', async () => {
    const { pages, calls } = await runSync([permissionRoute('acme/leon'), ...firstPassRoutes()], {
      repos: ['paul/perso', 'acme/leon'],
      depotsEquipe: [LEON],
    });

    expect(idsOf(pages)).toEqual([
      'issue:acme/leon#12',
      'pr:acme/leon#13',
      'issue:acme/leon#14',
      'issue:acme/leon#15',
      'issue:acme/leon#16',
    ]);
    expect(calls.some((call) => call.url.includes('/paul/perso'))).toBe(false);
    expect(cursorOf(pages.at(-1))).toEqual({
      'paul/perso': MARK,
      'acme/leon': { at: '2026-10-12T14:00:00Z', seen: [15, 16], details: true },
    });
  });

  it('sans aucun choix, ne lit rien mais marque chaque dépôt installé, en gardant une marque déjà posée', async () => {
    const lu = { at: '2026-10-12T14:00:00Z', seen: [15, 16] };
    const cursor = JSON.stringify({ 'acme/leon': lu });
    // Une liste absente vaut une liste vide : jamais tout relever par défaut.
    for (const depotsEquipe of [[], undefined]) {
      const { http, calls } = testHttp(githubConnector, installed, [
        ...installation(['acme/leon', 'paul/perso']),
      ]);
      const state = { cursor, since: SINCE, ...(depotsEquipe && { depotsEquipe }) };

      const pages = await collect(githubConnector.sync(installed, state, http));

      expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
        '/user/installations',
        '/user/installations/7/repositories',
      ]);
      expect(pages).toHaveLength(1);
      expect(pages[0]?.items).toEqual([]);
      expect(pages[0]?.depotsConfirmes).toEqual([]);
      expect(cursorOf(pages[0])).toEqual({ 'acme/leon': lu, 'paul/perso': MARK });
    }
  });

  it('lit un dépôt d’équipe quelle que soit sa casse sur GitHub', async () => {
    const { http, calls } = testHttp(githubConnector, installed, [
      ...installation(['Acme/Leon']),
      { url: `${API}/repos/Acme/Leon/issues`, json: [] },
    ]);

    const pages = await collect(
      githubConnector.sync(installed, { cursor: null, since: SINCE, depotsEquipe: [LEON] }, http),
    );

    expect(calls.map((call) => new URL(call.url).pathname)).toContain('/repos/Acme/Leon/issues');
    expect(pages[0]?.depotsConfirmes).toEqual([LEON]);
  });

  // C12 : l'installation ne rend que les dépôts où le membre a une permission explicite, lecture au moins (doc citée
  // dans client.ts) : aucune demande de plus par dépôt, à chaque passage. Seuls les dépôts saisis la demandent.
  it('avec le bouton sans dépôt choisi, ne redemande pas la permission des dépôts installés', async () => {
    const repos = ['acme/leon', 'acme/site', 'acme/outil'];
    const { http, calls } = testHttp(githubConnector, installed, [
      ...installation(repos),
      ...repos.map((name) => ({ url: `${API}/repos/${name}/issues`, json: [] })),
    ]);

    const pages = await collect(
      githubConnector.sync(
        installed,
        { cursor: null, since: SINCE, depotsEquipe: teamOf(repos) },
        http,
      ),
    );

    expect(calls.filter(isPermissionCall)).toEqual([]);
    expect(pages.at(-1)?.depotsConfirmes).toEqual(teamOf(repos));
  });

  // C13 : non vérifié, GitHub pourrait ne pas rendre `permissions` à un jeton d'appli ou à grain fin. Le dépôt n'est
  // alors pas lu, comme sans permission, et le journal le dit sans nommer le dépôt : un arrêt de la relève se voit.
  it('sans `permissions` dans la réponse, ne lit pas le dépôt et le journalise, sans le nommer', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const repos = ['acme/leon', 'acme/site'];
      const { pages, calls } = await runSync(
        [{ url: `${API}/repos/acme/leon`, json: repo }, permissionRoute('acme/site', false)],
        { repos, depotsEquipe: teamOf(repos) },
      );

      expect(calls.filter((call) => !isPermissionCall(call))).toEqual([]);
      expect(pages[0]?.depotsConfirmes).toEqual([]);
      // Un `pull` faux n'est pas une anomalie : un seul message.
      expect(logged).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(logged.mock.calls)).toContain('github.permissions_missing');
      expect(JSON.stringify(logged.mock.calls)).not.toContain('acme/');
    } finally {
      logged.mockRestore();
    }
  });

  it('ignore un dépôt d’équipe sur lequel le membre n’a pas de permission (pull faux, 403, 404)', async () => {
    const repos = ['acme/leon', 'acme/site', 'acme/prive', 'acme/vieux'];
    const { pages, calls } = await runSync(
      [
        permissionRoute('acme/leon'),
        permissionRoute('acme/site', false),
        { url: `${API}/repos/acme/prive`, status: 403 },
        { url: `${API}/repos/acme/vieux`, status: 404 },
        issuesRoute([]),
      ],
      { repos, depotsEquipe: teamOf(repos) },
    );

    const read = calls.filter((call) => !isPermissionCall(call)).map((call) => call.url);
    expect(read.map((url) => new URL(url).pathname)).toEqual(['/repos/acme/leon/issues']);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.depotsConfirmes).toEqual([LEON]);
    expect(cursorOf(pages[0])).toEqual({
      'acme/site': MARK,
      'acme/prive': MARK,
      'acme/vieux': MARK,
      'acme/leon': { ...MARK, details: true },
    });
  });

  it('rend à chaque page la liste des dépôts d’équipe confirmés, refaite à chaque passage', async () => {
    const first = await runSync([permissionRoute('acme/leon'), ...firstPassRoutes()], {
      depotsEquipe: [LEON],
    });

    expect(first.pages).toHaveLength(2);
    for (const page of first.pages) expect(page.depotsConfirmes).toEqual([LEON]);

    // Le membre a perdu son accès sur GitHub : le dépôt n'est plus confirmé, ni relu.
    const second = await runSync([permissionRoute('acme/leon', false)], {
      cursor: first.pages.at(-1)?.cursor,
      depotsEquipe: [LEON],
    });

    expect(second.pages).toEqual([
      { items: [], cursor: first.pages.at(-1)?.cursor, depotsConfirmes: [] },
    ]);
  });
});

// Le bouton « Se connecter avec GitHub » : une GitHub App, dont le jeton d'accès (ghu_…) s'envoie en
// Bearer comme un jeton à grain fin.
describe('github : connexion par le bouton', () => {
  const ACCESS = 'ghu_exemple-acces-1';
  const oauthConfig = {
    authMode: 'oauth' as const,
    accessToken: ACCESS,
    refreshToken: 'ghr_exemple-rafraichir-1',
    expiresAt: '2026-10-15T18:00:00.000Z',
    repos: ['acme/leon'],
  };
  const teamState = { cursor: null, since: SINCE, depotsEquipe: ['github.com/acme/leon'] };
  const schema = githubConnector.configSchema;
  const issuePaths = (input: unknown) =>
    schema.safeParse(input).error?.issues.map((issue) => issue.path.join('.'));

  it('accepte la forme du bouton, jetons compris', () => {
    expect(schema.parse(oauthConfig)).toEqual(oauthConfig);
    expect(schema.parse({ ...oauthConfig, refreshToken: null, expiresAt: null })).toMatchObject({
      refreshToken: null,
      expiresAt: null,
    });
  });

  it('refuse la forme du bouton sans jeton d’accès, au nom du champ', () => {
    const { accessToken: _omitted, ...withoutAccess } = oauthConfig;

    expect(issuePaths(withoutAccess)).toEqual(['accessToken']);
    expect(issuePaths({ ...oauthConfig, accessToken: '   ' })).toContain('accessToken');
    // Une clé collée ne tient pas lieu de jeton d'accès.
    expect(issuePaths({ ...withoutAccess, token: TOKEN })).toEqual(['accessToken']);
  });

  it('refuse la forme à clé sans clé, même avec un jeton d’accès', () => {
    expect(issuePaths({ authMode: 'key', accessToken: ACCESS, repos: ['acme/leon'] })).toEqual([
      'token',
    ]);
    expect(issuePaths({ accessToken: ACCESS, repos: ['acme/leon'] })).toEqual(['token']);
  });

  it('refuse un mode inconnu, et des dépôts absents avec une clé seulement', () => {
    expect(schema.safeParse({ ...oauthConfig, authMode: 'autre' }).success).toBe(false);
    expect(issuePaths({ ...config, repos: [] })).toEqual(['repos']);
    expect(schema.safeParse({ ...oauthConfig, repos: [] }).success).toBe(true);
    expect(schema.parse({ ...oauthConfig, repos: undefined }).repos).toEqual([]);
  });

  it('sans dépôt choisi ni installation, verify branche quand même : rien à lire pour l’instant', async () => {
    const installed = { ...oauthConfig, repos: [] };
    const { http } = testHttp(githubConnector, installed, [{ url: `${API}/user`, json: user }]);

    await expect(githubConnector.verify(schema.parse(installed), http)).resolves.toEqual({
      account: 'marie-durand',
      accountKey: '4101',
    });
  });

  it('sans dépôt choisi, sync relit l’installation puis lit ses dépôts', async () => {
    const installed = { ...oauthConfig, repos: [] };
    const { http } = testHttp(githubConnector, installed, [
      { url: `${API}/user/installations`, json: { installations: [{ id: 7 }] } },
      {
        url: `${API}/user/installations/7/repositories`,
        json: { repositories: [{ full_name: 'acme/leon' }] },
      },
      ...firstPassRoutes(),
    ]);

    const pages = await collect(
      githubConnector.sync(schema.parse(installed), { ...teamState, cursor: null }, http),
    );

    expect(idsOf(pages)).toContain('issue:acme/leon#12');
  });

  it('sans dépôt choisi, sync lit tous les dépôts installés, au-delà de 20 et de la première page', async () => {
    const installed = { ...oauthConfig, repos: [] };
    const repos = Array.from({ length: 22 }, (_, i) => `acme/r${i + 1}`);
    const listed = (names: string[]) => ({
      repositories: names.map((full_name) => ({ full_name })),
    });
    const REPOS_7 = `${API}/user/installations/7/repositories`;
    const { http, calls } = testHttp(githubConnector, installed, [
      { url: `${API}/user/installations`, json: { installations: [{ id: 7 }, { id: 8 }] } },
      { url: REPOS_7, json: listed(repos.slice(0, 20)), headers: next(REPOS_7) },
      { url: REPOS_7, json: listed(repos.slice(20, 21)) },
      { url: `${API}/user/installations/8/repositories`, json: listed(repos.slice(21)) },
      ...repos.map((name) => ({ url: `${API}/repos/${name}/issues`, json: [] })),
    ]);

    await collect(
      githubConnector.sync(
        schema.parse(installed),
        { cursor: null, since: SINCE, depotsEquipe: teamOf(repos) },
        http,
      ),
    );

    const read = calls
      .map(({ url }) => url.replace(/\?.*$/, ''))
      .filter((url) => url.endsWith('/issues'));
    expect(read).toEqual(repos.map((name) => `${API}/repos/${name}/issues`));
  });

  it('reste un objet à champs nommés, et ne chiffre que la clé collée', () => {
    const shape = Object.keys((schema as unknown as z.ZodObject).shape);

    expect(shape).toEqual(
      expect.arrayContaining(['authMode', 'token', 'accessToken', 'refreshToken', 'expiresAt']),
    );
    expect(githubConnector.secretFields).toEqual(['token']);
    expect(githubConnector.hosts(oauthConfig)).toEqual(['api.github.com']);
  });

  it('verify envoie le jeton d’accès en Bearer', async () => {
    const { http, calls } = testHttp(githubConnector, oauthConfig, [
      { url: `${API}/user`, json: user },
      { url: `${API}/repos/acme/leon`, json: repo },
    ]);

    const result = await githubConnector.verify(oauthConfig, http);

    expect(result).toEqual({ account: 'marie-durand', accountKey: '4101' });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers).toMatchObject({
        authorization: `Bearer ${ACCESS}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'Leon',
      });
    }
  });

  it('verify lève un refus d’authentification quand le jeton est rejeté (401), pour que le socle renouvelle', async () => {
    const { http } = testHttp(githubConnector, oauthConfig, [{ url: `${API}/user`, status: 401 }]);

    await expect(githubConnector.verify(oauthConfig, http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('nomme le dépôt où l’appli n’est pas installée (404)', async () => {
    const { http } = testHttp(githubConnector, oauthConfig, [
      { url: `${API}/user`, json: user },
      { url: `${API}/repos/acme/leon`, status: 404 },
    ]);

    const failure = await githubConnector
      .verify(oauthConfig, http)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Repository not accessible: acme/leon');
  });

  it('sync envoie le jeton d’accès à chaque requête, pages suivantes comprises', async () => {
    const { http, calls } = testHttp(githubConnector, oauthConfig, [
      permissionRoute('acme/leon'),
      ...firstPassRoutes(),
    ]);

    const pages = await collect(githubConnector.sync(oauthConfig, teamState, http));

    expect(idsOf(pages)).toEqual([
      'issue:acme/leon#12',
      'pr:acme/leon#13',
      'issue:acme/leon#14',
      'issue:acme/leon#15',
      'issue:acme/leon#16',
    ]);
    expect(calls.length).toBeGreaterThan(6);
    for (const call of calls) {
      expect(call.headers).toMatchObject({
        authorization: `Bearer ${ACCESS}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'Leon',
      });
    }
  });

  it('sync remonte le refus d’authentification d’un jeton expiré (401)', async () => {
    const { http } = testHttp(githubConnector, oauthConfig, [
      permissionRoute('acme/leon'),
      issuesRoute(null, { status: 401 }),
    ]);

    const run = collect(githubConnector.sync(oauthConfig, teamState, http));

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('une connexion à clé n’envoie jamais le jeton du bouton', async () => {
    const mixed = { ...config, accessToken: ACCESS };
    const { http, calls } = testHttp(githubConnector, mixed, [
      { url: `${API}/user`, json: user },
      { url: `${API}/repos/acme/leon`, json: repo },
    ]);

    await githubConnector.verify(githubConnector.configSchema.parse(mixed), http);

    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe('github : catalogue du bouton', () => {
  const entry = listCatalog('fr').find((item) => item.id === 'github');

  it('explique ce que l’utilisateur verra chez GitHub, et où installer l’appli', () => {
    expect(entry?.oauthHelp).toMatch(/installe/i);
    expect(entry?.oauthHelp).toMatch(/écrire/i);
    expect(entry?.oauthHelp).toMatch(/pull requests/i);
    expect(entry?.oauthPreFields).toEqual([]);
  });

  it('garde la clé collée en secours, avec son aide', () => {
    expect(entry?.keyAccepted).not.toBe(false);
    expect(entry?.keyHelp).toContain('Fine-grained tokens');
    expect(entry?.fields.map((field) => field.name)).toEqual(['token', 'repos']);
  });
});

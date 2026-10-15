import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { sentryConnector } from './connector';
import issue1001 from './fixtures/issue-1001.json';
import issue1003 from './fixtures/issue-1003.json';
import issuesPage1 from './fixtures/issues-page1.json';
import issuesPage2 from './fixtures/issues-page2.json';

const TOKEN = 'jeton-de-test-0123456789';
type TestConfig = Parameters<typeof sentryConnector.hosts>[0];
const config: TestConfig = { token: TOKEN, organization: 'acme', region: 'sentry.io' };
const euConfig: TestConfig = { ...config, region: 'de.sentry.io' };
const NOW = new Date('2026-10-15T12:00:00Z');
const SINCE = new Date('2026-09-15T12:00:00Z'); // 30 jours avant NOW : 43 200 minutes

const API = 'https://sentry.io/api/0/organizations/acme';
const LIST = `${API}/issues/`;

// Le lien de la page suivante tel que la doc de Sentry l'écrit ; `more` = « results » de la suivante.
const link = (base: string, next: string, more: boolean) =>
  `<${base}/issues/?&cursor=0:0:1>; rel="previous"; results="false"; cursor="0:0:1", ` +
  `<${base}/issues/?&cursor=${next}>; rel="next"; results="${more}"; cursor="${next}"`;

const listRoute = (json: unknown, headers?: Record<string, string>): FakeRoute => ({
  url: LIST,
  json,
  headers,
});
const detailRoute = (id: string, extra: Partial<FakeRoute>): FakeRoute => ({
  url: `${API}/issues/${id}/`,
  ...extra,
});

// Les deux pages de la fixture, puis le détail des deux problèmes qui ont des commentaires.
function firstPassRoutes(): FakeRoute[] {
  return [
    listRoute(issuesPage1, { link: link(API, '0:100:0', true) }),
    listRoute(issuesPage2, { link: link(API, '0:200:0', false) }),
    detailRoute('1001', { json: issue1001 }),
    detailRoute('1003', { json: issue1003 }),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date; config?: TestConfig } = {},
) {
  const cfg = overrides.config ?? config;
  const { http, calls } = testHttp(sentryConnector, cfg, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(sentryConnector.sync(cfg, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;
const pathOf = (url: string | undefined) => new URL(url ?? '').pathname;
const itemOf = (pages: SyncPage[], id: string) => {
  const item = itemsOf(pages).find((candidate) => candidate.externalId === `issue:${id}`);
  if (!item) throw new Error(`problème absent : ${id}`);
  return item;
};

// Un problème de plus pour les tests de curseur et de découpe (lastSeen en ISO, sans commentaire).
function extraIssue(id: string, lastSeen: string) {
  return {
    ...issuesPage2[1],
    id,
    shortId: `API-${id}`,
    title: `Problème ${id}`,
    permalink: `https://acme.sentry.io/issues/${id}/`,
    numComments: 0,
    lastSeen,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('sentry : configuration', () => {
  const schema = sentryConnector.configSchema;

  it('accepte un jeton, une organisation et une région, nettoyés', () => {
    expect(
      schema.parse({ token: `  ${TOKEN} `, organization: '  Acme-Web_2 ', region: 'de.sentry.io' }),
    ).toEqual({ token: TOKEN, organization: 'acme-web_2', region: 'de.sentry.io' });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({ organization: 'acme', region: 'sentry.io' }).success).toBe(false);
    expect(schema.safeParse({ ...config, token: '   ' }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN, region: 'sentry.io' }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN, organization: 'acme' }).success).toBe(false);
  });

  it('refuse une organisation qui n’est pas un identifiant', () => {
    for (const invalid of [
      '',
      'evil.com/x',
      'a.b',
      'a b',
      '../x',
      'acme/issues',
      'acme?x=1',
      'a'.repeat(101),
    ]) {
      expect(schema.safeParse({ ...config, organization: invalid }).success, invalid).toBe(false);
    }
  });

  it('refuse une région qui n’est pas l’une des deux de la liste', () => {
    for (const invalid of ['', 'evil.com', 'us.sentry.io.evil.com', 'sentry.io/x', 'SENTRY.IO']) {
      expect(schema.safeParse({ ...config, region: invalid }).success, invalid).toBe(false);
    }
  });

  it('fixe l’hôte d’après la région, et le champ à chiffrer', () => {
    expect(sentryConnector.hosts(config)).toEqual(['sentry.io']);
    expect(sentryConnector.hosts(euConfig)).toEqual(['de.sentry.io']);
    expect(sentryConnector.secretFields).toEqual(['token']);
  });

  it('est disponible dans le registre et le catalogue, avec les deux régions et l’avertissement', () => {
    expect(getConnector('sentry')).toBe(sentryConnector);
    const entry = listCatalog().find((item) => item.id === 'sentry');
    const region = entry?.fields.find((field) => field.name === 'region');
    expect(entry?.available).toBe(true);
    expect(region?.kind).toBe('select');
    expect(region?.options?.map((option) => option.value)).toEqual(['sentry.io', 'de.sentry.io']);
    expect(entry?.warning).toMatch(/2\.3/);
    // Aucune portée d'organisation n'est demandée : la vérification ne lit que les problèmes.
    expect(JSON.stringify(entry)).not.toMatch(/org:read/);
  });
});

describe('sentry : verify', () => {
  const issuesCheck: FakeRoute = { url: LIST, json: [] };

  // La doc dit que « Retrieve an Organization » demande un jeton d'utilisateur, pas un jeton
  // d'intégration interne : la vérification ne s'appuie que sur la lecture des problèmes.
  it('vérifie la lecture des problèmes seule, avec le jeton en Bearer, sans lire l’organisation', async () => {
    const { http, calls } = testHttp(sentryConnector, config, [issuesCheck]);

    const result = await sentryConnector.verify(config, http);

    expect(result).toEqual({ account: 'organisation acme' });
    expect(calls.map((call) => pathOf(call.url))).toEqual(['/api/0/organizations/acme/issues/']);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(paramsOf(calls[0]?.url).limit).toBe('1');
  });

  it('interroge la région choisie', async () => {
    const { http, calls } = testHttp(sentryConnector, euConfig, [
      { url: 'https://de.sentry.io/api/0/organizations/acme/issues/', json: [] },
    ]);

    await sentryConnector.verify(euConfig, http);

    expect(calls.map((call) => new URL(call.url).host)).toEqual(['de.sentry.io']);
  });

  it('lève une erreur de clé sur un 401', async () => {
    const { http } = testHttp(sentryConnector, config, [
      { url: LIST, status: 401, json: { detail: 'Invalid token' } },
    ]);

    await expect(sentryConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lève une erreur de clé si le jeton ne peut pas lire les problèmes (403)', async () => {
    const { http } = testHttp(sentryConnector, config, [
      { url: LIST, status: 403, json: { detail: 'You do not have permission' } },
    ]);

    await expect(sentryConnector.verify(config, http)).rejects.toMatchObject({
      name: 'ConnectorAuthError',
      status: 403,
    });
  });
});

describe('sentry : premier passage', () => {
  it('demande les problèmes vus depuis `since`, tous statuts, du plus récent au plus ancien', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const first = calls[0];
    expect(pathOf(first?.url)).toBe('/api/0/organizations/acme/issues/');
    expect(first?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    // 30 jours = 43 200 minutes, plus 2 minutes de marge : ce qui est déjà lu est écarté ensuite.
    expect(paramsOf(first?.url)).toMatchObject({
      query: 'lastSeen:-43202m',
      sort: 'date',
      limit: '100',
      collapse: 'stats',
    });
  });

  it('rend les problèmes du plus ancien au plus récent, en une page', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(1);
    expect(idsOf(pages)).toEqual(['issue:1000', 'issue:1001', 'issue:1002', 'issue:1003']);
    expect(JSON.parse(pages[0]?.cursor ?? 'null')).toEqual({
      at: '2026-10-15T11:48:27.119000Z',
      seen: ['1003'],
    });
  });

  it('suit le lien de la page suivante en gardant les mêmes filtres', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.slice(0, 2).map((call) => pathOf(call.url))).toEqual([
      '/api/0/organizations/acme/issues/',
      '/api/0/organizations/acme/issues/',
    ]);
    expect(paramsOf(calls[1]?.url)).toMatchObject({
      cursor: '0:100:0',
      query: 'lastSeen:-43202m',
      sort: 'date',
      limit: '100',
    });
    expect(paramsOf(calls[0]?.url).cursor).toBeUndefined();
  });

  it('demande la page suivante à l’hôte choisi, même si le lien en nomme un autre', async () => {
    const eu = 'https://de.sentry.io/api/0/organizations/acme';
    const { calls, pages } = await runSync(
      [
        { url: `${eu}/issues/`, json: issuesPage1, headers: { link: link(API, '0:100:0', true) } },
        { url: `${eu}/issues/`, json: issuesPage2, headers: { link: link(API, '0:200:0', false) } },
        { url: `${eu}/issues/1001/`, json: issue1001 },
        { url: `${eu}/issues/1003/`, json: issue1003 },
      ],
      { config: euConfig },
    );

    expect(calls.map((call) => new URL(call.url).host)).toEqual(Array(4).fill('de.sentry.io'));
    expect(paramsOf(calls[1]?.url).cursor).toBe('0:100:0');
    expect(idsOf(pages)).toHaveLength(4);
  });

  it('s’arrête quand « results » vaut false, sans redemander', async () => {
    const { calls } = await runSync([
      listRoute(issuesPage2, { link: link(API, '0:100:0', false) }),
      detailRoute('1001', { json: issue1001 }),
    ]);

    expect(calls.filter((call) => pathOf(call.url).endsWith('/issues/'))).toHaveLength(1);
  });

  it('ne rend rien quand aucun problème n’a été vu', async () => {
    const { pages } = await runSync([listRoute([])]);

    expect(pages).toEqual([]);
  });

  it('découpe en pages de 50 problèmes au plus, dans l’ordre, avec un curseur à chaque page', async () => {
    const newestFirst = Array.from({ length: 120 }, (_, index) =>
      extraIssue(String(3000 + index), new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString()),
    ).reverse();

    const { pages } = await runSync([
      listRoute(newestFirst.slice(0, 100), { link: link(API, '0:100:0', true) }),
      listRoute(newestFirst.slice(100), { link: link(API, '0:200:0', false) }),
    ]);

    expect(pages.map((page) => page.items.length)).toEqual([50, 50, 20]);
    expect(idsOf(pages)).toEqual(
      Array.from({ length: 120 }, (_, index) => `issue:${3000 + index}`),
    );
    expect(pages.map((page) => JSON.parse(page.cursor).seen)).toEqual([
      ['3049'],
      ['3099'],
      ['3119'],
    ]);
  });
});

describe('sentry : un problème devient un élément', () => {
  it('rend le titre, le lien, l’origine et la date de dernière occurrence', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, '1003')).toMatchObject({
      externalId: 'issue:1003',
      nature: 'ticket',
      title: 'WEB-31 ReferenceError: panier is not defined',
      url: 'https://acme.sentry.io/issues/1003/',
      updatedAt: '2026-10-15T11:48:27.119000Z',
      origin: { organization: 'acme', project: 'web' },
    });
  });

  it('écrit un tour document court daté de la dernière occurrence, sans trace, sans données d’événement, sans compteurs', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const body = itemOf(pages, '1003').turns[0];

    expect(body).toMatchObject({
      externalId: 'body',
      role: 'document',
      author: { name: null, email: null },
      ts: '2026-10-15T11:48:27.119000Z',
    });
    for (const expected of [
      'WEB-31',
      'Boutique web',
      'non résolu',
      'erreur',
      'static/js/checkout.js in submitOrder',
      '2026-10-14 08:02 UTC',
      'Paul Martin',
    ]) {
      expect(body?.text, expected).toContain(expected);
    }
    expect(body?.text).not.toMatch(/in-app-only|1792054800/);
    // Ce qui bouge à chaque événement n'est pas dans le texte : ni dernière occurrence, ni compteurs.
    expect(body?.text).not.toMatch(/Dernière occurrence|Événements|Utilisateurs touchés|11:48/);
  });

  // Personne n'a rien modifié : seuls la date de dernière occurrence et les compteurs ont bougé.
  // Les identifiants de tours portent l'empreinte du texte ; s'ils changent, chaque passage ferait
  // un tour, un passage de tri et une extraction de plus pour le même problème.
  it('un problème qui reçoit des événements garde les mêmes tours, donc aucun tour nouveau', async () => {
    const before = { ...extraIssue('1000', '2026-10-15T10:00:00Z'), count: '2', userCount: 1 };
    const after = { ...before, count: '310', userCount: 54, lastSeen: '2026-10-15T11:30:00Z' };
    const turnIds = async (issue: typeof before) => {
      const { pages } = await runSync([listRoute([issue])]);
      return normalizeItem(itemOf(pages, '1000'), 'sentry')?.turns.map((turn) => turn.externalId);
    };

    const first = await turnIds(before);

    expect(first).toHaveLength(1);
    expect(await turnIds(after)).toEqual(first);
  });

  it('un changement d’état crée bien un tour nouveau', async () => {
    const open = extraIssue('1000', '2026-10-15T10:00:00Z');
    const resolved = { ...open, status: 'resolved', lastSeen: '2026-10-15T11:30:00Z' };
    const turnIds = async (issue: typeof open) => {
      const { pages } = await runSync([listRoute([issue])]);
      return normalizeItem(itemOf(pages, '1000'), 'sentry')?.turns.map((turn) => turn.externalId);
    };

    expect(await turnIds(resolved)).not.toEqual(await turnIds(open));
  });

  it('omet le lieu et l’assignation quand l’outil ne les donne pas', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const text = itemOf(pages, '1000').turns[0]?.text ?? '';

    expect(text).toContain('fatale');
    expect(text).not.toMatch(/Lieu|Assigné/);
  });

  it('traduit le statut ignoré et nomme l’équipe assignée', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const text = itemOf(pages, '1001').turns[0]?.text ?? '';

    expect(text).toContain('ignoré');
    expect(text).toContain('avertissement');
    expect(text).toContain('backend');
  });

  it('ajoute les notes de l’équipe en tours participant, avec leur auteur et leur date', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const notes = itemOf(pages, '1003').turns.slice(1);

    expect(notes.map((turn) => turn.externalId)).toEqual(['note:9301', 'note:9302', 'note:9304']);
    expect(notes[0]).toMatchObject({
      role: 'participant',
      author: { name: 'Paul Martin', email: 'paul@acme.test' },
      ts: '2026-10-15T09:30:00.000000Z',
    });
    expect(notes[0]?.text).toContain('on a renommé la variable du panier');
    expect(notes[1]?.author).toEqual({ name: 'Marie Durand', email: 'marie@acme.test' });
    // Une note sans auteur reste lisible ; une note vide et les autres activités sont écartées.
    expect(notes[2]).toMatchObject({ author: { name: null, email: null } });
  });

  it('ne demande le détail que des problèmes qui ont des commentaires', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const details = calls
      .map((call) => pathOf(call.url))
      .filter((path) => !path.endsWith('/issues/'));
    expect(details).toEqual([
      '/api/0/organizations/acme/issues/1001/',
      '/api/0/organizations/acme/issues/1003/',
    ]);
  });

  it('chaque date rendue passe la normalisation du socle', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of itemsOf(pages)) {
      expect(normalizeItem(item, 'sentry'), item.externalId).not.toBeNull();
    }
  });
});

describe('sentry : ressource secondaire et erreurs', () => {
  it.each([403, 404])('un %s sur le détail d’un problème le laisse sans notes', async (status) => {
    const { pages } = await runSync([
      listRoute(issuesPage2),
      detailRoute('1001', { status, json: { detail: 'refusé' } }),
    ]);

    expect(itemOf(pages, '1001').turns.map((turn) => turn.externalId)).toEqual(['body']);
    expect(idsOf(pages)).toEqual(['issue:1000', 'issue:1001']);
  });

  it('un 401 sur le détail remonte comme une clé refusée', async () => {
    await expect(
      runSync([listRoute(issuesPage2), detailRoute('1001', { status: 401, json: {} })]),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('un 401 sur la liste remonte comme une clé refusée', async () => {
    await expect(
      runSync([{ url: LIST, status: 401, json: { detail: 'Invalid token' } }]),
    ).rejects.toMatchObject({ name: 'ConnectorAuthError', status: 401 });
  });

  it('une réponse sans date de dernière occurrence est une erreur propre, sans le corps', async () => {
    const broken = [{ ...issuesPage2[0], lastSeen: undefined, title: 'SECRET-DU-CORPS' }];

    const failure = await runSync([listRoute(broken)]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
  });
});

describe('sentry : reprise avec le curseur', () => {
  const cursor = JSON.stringify({ at: '2026-10-15T11:48:27.119000Z', seen: ['1003'] });

  it('ne relit que depuis le curseur, avec deux minutes de marge', async () => {
    const { calls } = await runSync([listRoute([])], { cursor });

    // 11 h 48 min 27 s → midi : 12 minutes entamées, plus 2 de marge.
    expect(paramsOf(calls[0]?.url).query).toBe('lastSeen:-14m');
  });

  it('ne refait pas la première page : les problèmes déjà rendus sont écartés', async () => {
    const { pages, calls } = await runSync(
      [listRoute([issuesPage1[0], issuesPage1[1]]), detailRoute('1003', { json: issue1003 })],
      { cursor },
    );

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('rend un problème nouveau, et un autre vu à la même seconde que le curseur', async () => {
    const same = extraIssue('1006', '2026-10-15T11:48:27.119000Z');
    const newer = extraIssue('1005', '2026-10-15T11:55:00Z');

    const { pages } = await runSync([listRoute([newer, same, issuesPage1[0]])], { cursor });

    expect(idsOf(pages)).toEqual(['issue:1006', 'issue:1005']);
    expect(JSON.parse(pages[0]?.cursor ?? 'null')).toEqual({
      at: '2026-10-15T11:55:00Z',
      seen: ['1005'],
    });
  });

  it('repart de `since` quand le curseur est illisible', async () => {
    const { calls } = await runSync([listRoute([])], { cursor: 'pas du json' });

    expect(paramsOf(calls[0]?.url).query).toBe('lastSeen:-43202m');
  });
});

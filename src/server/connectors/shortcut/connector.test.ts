import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, type FakeCall, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { shortcutConnector } from './connector';
import comments101 from './fixtures/comments-101.json';
import comments103 from './fixtures/comments-103.json';
import comments104 from './fixtures/comments-104.json';
import member from './fixtures/member.json';
import members from './fixtures/members.json';
import storiesWindow1 from './fixtures/stories-window1.json';
import storiesWindow2 from './fixtures/stories-window2.json';

const API = 'https://api.app.shortcut.com/api/v3';
const SEARCH = `${API}/stories/search`;
const MEMBERS = `${API}/members`;
const TOKEN = 'jeton-de-test-0123456789';
const config = { token: TOKEN };
const NOW = '2026-10-15T12:00:00Z';
// Dix jours avant NOW : deux fenêtres de sept jours.
const SINCE = new Date('2026-10-05T00:00:00Z');
const MARIE = '5f1c0a00-0000-4000-8000-000000000001';

// La recherche répond 201 (c'est ce que la doc annonce), même si elle ne crée rien.
const searchRoute = (json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  method: 'POST',
  url: SEARCH,
  status: 201,
  json,
  ...extra,
});

// Le deuxième passage de la recherche relit, à une seconde près, la dernière histoire déjà rendue.
const secondWindow = [storiesWindow1[2], ...storiesWindow2];

// Toutes les routes d'un premier passage : une première fenêtre de trois histoires, puis la
// dernière fenêtre, qui rend aussi l'histoire 103 déjà lue.
function firstPassRoutes(): FakeRoute[] {
  return [
    searchRoute(storiesWindow1),
    { url: MEMBERS, json: members },
    { url: `${API}/stories/101/comments`, json: comments101 },
    { url: `${API}/stories/103/comments`, json: comments103 },
    searchRoute(secondWindow),
    { url: `${API}/stories/104/comments`, json: comments104 },
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(shortcutConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(shortcutConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const bodyOf = (call: FakeCall | undefined) => (call?.body ?? {}) as Record<string, unknown>;
const searches = (calls: FakeCall[]) => calls.filter((call) => call.url === SEARCH);

// Une histoire réduite à ce que Leon lit, pour les cas où le détail ne compte pas.
const minute = (index: number) =>
  new Date(Date.UTC(2026, 9, 14, 8, index)).toISOString().replace('.000Z', 'Z');
const bare = (id: number, updatedAt: string) => ({
  id,
  name: `Histoire ${id}`,
  description: `Texte de l'histoire ${id}.`,
  app_url: `https://app.shortcut.com/acme/story/${id}`,
  requested_by_id: MARIE,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: updatedAt,
  comment_ids: [],
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('shortcut : configuration', () => {
  const schema = shortcutConnector.configSchema;

  it('accepte un jeton, sans les espaces autour', () => {
    expect(schema.parse({ token: `  ${TOKEN} ` })).toEqual({ token: TOKEN });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ token: '   ' }).success).toBe(false);
    expect(schema.safeParse({ token: 'a'.repeat(501) }).success).toBe(false);
  });

  it('fixe l’hôte, le champ à chiffrer et l’écart entre deux requêtes (200 par minute)', () => {
    expect(shortcutConnector.hosts(config)).toEqual(['api.app.shortcut.com']);
    expect(shortcutConnector.secretFields).toEqual(['token']);
    expect(shortcutConnector.minIntervalMs).toBe(300);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('shortcut')).toBe(shortcutConnector);
    expect(listCatalog('fr').find((item) => item.id === 'shortcut')?.available).toBe(true);
  });
});

describe('shortcut : verify', () => {
  it('lit le compte avec l’en-tête de Shortcut, puis essaie la recherche des histoires', async () => {
    const { http, calls } = testHttp(shortcutConnector, config, [
      { url: `${API}/member`, json: member },
      searchRoute([]),
    ]);

    const result = await shortcutConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (Acme)' });
    expect(calls[0]?.url).toBe(`${API}/member`);
    expect(calls[0]?.headers).toMatchObject({ 'shortcut-token': TOKEN });
    expect(calls[0]?.headers).not.toHaveProperty('authorization');
    expect(calls[1]?.method).toBe('POST');
    expect(calls[1]?.url).toBe(SEARCH);
    expect(bodyOf(calls[1])).toMatchObject({ updated_at_start: '2026-10-15T11:59:00Z' });
    expect(calls).toHaveLength(2);
  });

  it('rend le nom seul quand Shortcut ne donne pas l’espace', async () => {
    const { workspace2: _workspace, ...withoutWorkspace } = member;
    const { http } = testHttp(shortcutConnector, config, [
      { url: `${API}/member`, json: withoutWorkspace },
      searchRoute([]),
    ]);

    expect(await shortcutConnector.verify(config, http)).toEqual({ account: 'Marie Durand' });
  });

  it('refuse un jeton rejeté (401)', async () => {
    const { http } = testHttp(shortcutConnector, config, [{ url: `${API}/member`, status: 401 }]);

    await expect(shortcutConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse un jeton que la recherche des histoires rejette (403)', async () => {
    const { http } = testHttp(shortcutConnector, config, [
      { url: `${API}/member`, json: member },
      searchRoute(null, { status: 403 }),
    ]);

    await expect(shortcutConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('shortcut : sync, premier passage', () => {
  it('demande les histoires modifiées depuis since, par fenêtres de sept jours, avec leur texte', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const [first] = searches(calls);
    expect(first?.headers).toMatchObject({
      'shortcut-token': TOKEN,
      'content-type': 'application/json',
    });
    expect(first?.headers).not.toHaveProperty('authorization');
    expect(bodyOf(first)).toEqual({
      updated_at_start: '2026-10-04T23:59:59Z',
      updated_at_end: '2026-10-11T23:59:59Z',
      includes_description: true,
    });
  });

  it('envoie le jeton de Shortcut à chaque requête', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(6);
    for (const call of calls) {
      expect(call.headers).toMatchObject({ 'shortcut-token': TOKEN });
      expect(call.headers).not.toHaveProperty('authorization');
    }
  });

  it('rend une histoire avec son corps puis ses commentaires, par date, sans les supprimés', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[0]?.items[0]).toEqual({
      externalId: 'story:101',
      nature: 'ticket',
      title: '#101 Choisir la durée de relève',
      url: 'https://app.shortcut.com/acme/story/101',
      updatedAt: '2026-10-09T15:00:00Z',
      origin: { project: '12', epic: '7' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'On relève les outils toutes les 15 minutes.\n\n## Pourquoi\n\nLes webhooks sont peu fiables.',
          ts: '2026-10-09T15:00:00Z',
        },
        {
          externalId: 'comment:9001',
          role: 'participant',
          author: { name: 'Paul Martin', email: 'paul@acme.test' },
          text: 'Plutôt 30 minutes, non ?',
          ts: '2026-10-08T09:00:00Z',
        },
        {
          externalId: 'comment:9003',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Non, 15 minutes : c’est décidé.',
          ts: '2026-10-09T14:50:00Z',
        },
      ],
    });
  });

  it('classe les commentaires par date, quel que soit l’ordre rendu par Shortcut', async () => {
    const routes = firstPassRoutes();
    routes[2] = { url: `${API}/stories/101/comments`, json: [...comments101].reverse() };

    const { pages } = await runSync(routes);

    const turns = pages[0]?.items[0]?.turns.map((turn) => turn.externalId);
    expect(turns).toEqual(['body', 'comment:9001', 'comment:9003']);
  });

  it('classe les histoires de la plus anciennement à la plus récemment modifiée', async () => {
    const routes = firstPassRoutes();
    routes[0] = searchRoute([...storiesWindow1].reverse());
    routes[4] = searchRoute([...secondWindow].reverse());

    const { pages } = await runSync(routes);

    expect(idsOf(pages)).toEqual(['story:101', 'story:102', 'story:103', 'story:104', 'story:105']);
  });

  it('ne demande les commentaires que des histoires qui en ont', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.map((call) => call.url)).toEqual([
      SEARCH,
      MEMBERS,
      `${API}/stories/101/comments`,
      `${API}/stories/103/comments`,
      SEARCH,
      `${API}/stories/104/comments`,
    ]);
  });

  it('demande les commentaires d’une histoire dont la liste n’est pas donnée', async () => {
    const { comment_ids: _ids, ...unknown } = bare(300, '2026-10-14T08:00:00Z');
    const { pages, calls } = await runSync(
      [
        searchRoute([unknown]),
        { url: MEMBERS, json: members },
        {
          url: `${API}/stories/300/comments`,
          json: [{ ...comments101[0], id: 1, text: 'Un commentaire.' }],
        },
      ],
      { since: new Date('2026-10-14T00:00:00Z') },
    );

    expect(calls.at(-1)?.url).toBe(`${API}/stories/300/comments`);
    expect(pages[0]?.items[0]?.turns.map((turn) => turn.externalId)).toEqual(['body', 'comment:1']);
  });

  it('rend une histoire sans texte sans tours, pour avancer le curseur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const empty = itemsOf(pages).find((item) => item.externalId === 'story:102');
    expect(empty?.turns).toEqual([]);
    expect(empty?.origin).toEqual({});
  });

  it('rend une histoire sans description avec ses seuls commentaires, et sans nom pour un auteur inconnu', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((candidate) => candidate.externalId === 'story:103');
    expect(item?.origin).toEqual({ project: '12' });
    expect(item?.turns.map((turn) => [turn.externalId, turn.author])).toEqual([
      ['comment:9010', { name: null, email: null }],
      ['comment:9011', { name: null, email: null }],
    ]);
  });

  it('ignore un commentaire sans texte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((candidate) => candidate.externalId === 'story:104');
    expect(item?.turns.map((turn) => turn.externalId)).toEqual(['body']);
  });

  it('nomme l’auteur par son pseudonyme quand le profil n’a pas de nom', async () => {
    const lea = '5f1c0a00-0000-4000-8000-000000000003';
    const { pages } = await runSync(
      [
        searchRoute([{ ...bare(301, '2026-10-14T08:00:00Z'), requested_by_id: lea }]),
        { url: MEMBERS, json: members },
      ],
      { since: new Date('2026-10-14T00:00:00Z') },
    );

    expect(pages[0]?.items[0]?.turns[0]?.author).toEqual({ name: 'lea', email: null });
  });

  it('demande la liste des membres une seule fois, et seulement s’il y a des histoires', async () => {
    const withStories = await runSync(firstPassRoutes());
    const withoutStories = await runSync([searchRoute([])], {
      since: new Date('2026-10-14T00:00:00Z'),
    });

    expect(withStories.calls.filter((call) => call.url === MEMBERS)).toHaveLength(1);
    expect(withoutStories.calls.map((call) => call.url)).toEqual([SEARCH]);
  });

  it('rend des éléments que le socle accepte, avec des dates ISO canoniques', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(5);
    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'shortcut');
      if (item.turns.length === 0) {
        expect(normalized, item.externalId).toBeNull();
      } else {
        expect(normalized, item.externalId).not.toBeNull();
        expect(normalized?.updatedAt).toBe(new Date(item.updatedAt).toISOString());
      }
    }
  });
});

describe('shortcut : sync, fenêtres, pages et curseur', () => {
  it('lit la fenêtre suivante depuis la dernière histoire rendue, la dernière sans borne de fin', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    const [first, last] = searches(calls).map(bodyOf);
    expect(first?.updated_at_end).toBe('2026-10-11T23:59:59Z');
    expect(last).toEqual({ updated_at_start: '2026-10-11T09:59:59Z', includes_description: true });
    expect(idsOf(pages.slice(0, 1))).toEqual(['story:101', 'story:102', 'story:103']);
    expect(idsOf(pages.slice(1))).toEqual(['story:104', 'story:105']);
  });

  it('garde l’instant de la dernière histoire rendue et celles lues à cet instant', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(2);
    expect(cursorOf(pages[0])).toEqual({ at: '2026-10-11T10:00:00Z', seen: [103] });
    expect(cursorOf(pages[1])).toEqual({ at: '2026-10-12T14:00:00Z', seen: [104, 105] });
  });

  it('passe les fenêtres vides sans rien rendre, chacune reprenant là où la précédente s’arrête', async () => {
    const since = new Date('2026-08-01T00:00:00Z');
    const { pages, calls } = await runSync(
      Array.from({ length: 12 }, () => searchRoute([])),
      { since },
    );

    const bodies = searches(calls).map(bodyOf);
    expect(pages).toEqual([]);
    expect(bodies[0]?.updated_at_start).toBe('2026-07-31T23:59:59Z');
    // Soixante-quinze jours et demi à couvrir, un peu moins de sept jours par fenêtre.
    expect(bodies).toHaveLength(11);
    expect(bodies.at(-1)).not.toHaveProperty('updated_at_end');
    for (const [index, body] of bodies.slice(0, -1).entries()) {
      const next = bodies[index + 1];
      const start = Date.parse(body.updated_at_start as string);
      const end = Date.parse(body.updated_at_end as string);
      expect(end - start, `fenêtre ${index}`).toBe(7 * 24 * 3600 * 1000);
      expect(Date.parse(next?.updated_at_start as string), `fenêtre ${index}`).toBeLessThan(end);
      expect(Date.parse(next?.updated_at_start as string), `fenêtre ${index}`).toBeGreaterThan(
        start,
      );
    }
  });

  it('écrit les dates à la seconde, en retirant une seconde au point de départ', async () => {
    const { calls } = await runSync([searchRoute([])], {
      since: new Date('2026-10-14T10:20:30.456Z'),
    });

    expect(bodyOf(calls[0]).updated_at_start).toBe('2026-10-14T10:20:29Z');
  });

  it('rend les histoires par pages de cinquante, chacune avec son curseur', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => bare(200 + index, minute(index)));

    const { pages } = await runSync([searchRoute(rows), { url: MEMBERS, json: members }], {
      since: new Date('2026-10-14T00:00:00Z'),
    });

    expect(pages.map((page) => page.items.length)).toEqual([50, 50, 20]);
    expect(cursorOf(pages[0])).toEqual({ at: minute(49), seen: [249] });
    expect(cursorOf(pages[2])).toEqual({ at: minute(119), seen: [319] });
  });

  it('reprend après la première page sans la relire', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => bare(200 + index, minute(index)));
    const since = new Date('2026-10-14T00:00:00Z');
    const first = await runSync([searchRoute(rows), { url: MEMBERS, json: members }], { since });

    const { pages, calls } = await runSync([searchRoute(rows), { url: MEMBERS, json: members }], {
      since,
      cursor: first.pages[0]?.cursor,
    });

    expect(bodyOf(calls[0]).updated_at_start).toBe('2026-10-14T08:48:59Z');
    expect(pages.map((page) => page.items.length)).toEqual([50, 20]);
    expect(idsOf(pages.slice(0, 1))[0]).toBe('story:250');
  });

  it('ne refait rien avec le dernier curseur', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync([searchRoute(secondWindow.slice(1))], {
      cursor: first.pages.at(-1)?.cursor,
    });

    expect(pages).toEqual([]);
    expect(calls.map((call) => call.url)).toEqual([SEARCH]);
    expect(bodyOf(calls[0]).updated_at_start).toBe('2026-10-12T13:59:59Z');
  });

  it('ignore l’histoire déjà rendue au même instant, et rend l’autre', async () => {
    const cursor = JSON.stringify({ at: '2026-10-12T14:00:00Z', seen: [104] });

    const { pages } = await runSync(
      [searchRoute(storiesWindow2), { url: MEMBERS, json: members }],
      { cursor },
    );

    expect(idsOf(pages)).toEqual(['story:105']);
    expect(cursorOf(pages[0])).toEqual({ at: '2026-10-12T14:00:00Z', seen: [104, 105] });
  });

  it('repart de since quand le curseur est illisible', async () => {
    for (const cursor of ['pas du JSON', '{"at":"hier","seen":[]}', '{"seen":[1]}']) {
      const { calls } = await runSync(
        [searchRoute(secondWindow.slice(1)), { url: MEMBERS, json: members }],
        { cursor, since: new Date('2026-10-14T00:00:00Z') },
      );

      expect(bodyOf(calls[0]).updated_at_start, cursor).toBe('2026-10-13T23:59:59Z');
    }
  });

  it('prend la date de création d’une histoire jamais modifiée', async () => {
    const never = {
      ...bare(302, '2026-10-14T08:00:00Z'),
      updated_at: null,
      created_at: '2026-10-14T07:00:00Z',
    };

    const { pages } = await runSync([searchRoute([never]), { url: MEMBERS, json: members }], {
      since: new Date('2026-10-14T00:00:00Z'),
    });

    expect(pages[0]?.items[0]?.updatedAt).toBe('2026-10-14T07:00:00Z');
    expect(cursorOf(pages[0])).toEqual({ at: '2026-10-14T07:00:00Z', seen: [302] });
  });
});

describe('shortcut : sync, erreurs', () => {
  it('rend les histoires sans nom d’auteur quand Shortcut refuse la liste des membres (403)', async () => {
    const routes = firstPassRoutes();
    routes[1] = { url: MEMBERS, status: 403 };

    const { pages } = await runSync(routes);

    const [first] = itemsOf(pages);
    expect(first?.turns.map((turn) => turn.author)).toEqual([
      { name: null, email: null },
      { name: null, email: null },
      { name: null, email: null },
    ]);
  });

  it('remonte un jeton rejeté (401) sur la liste des membres', async () => {
    const routes = firstPassRoutes();
    routes[1] = { url: MEMBERS, status: 401 };

    await expect(runSync(routes)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('rend l’histoire sans ses commentaires quand Shortcut les refuse (403)', async () => {
    const routes = firstPassRoutes();
    routes[2] = { url: `${API}/stories/101/comments`, status: 403 };

    const { pages } = await runSync(routes);

    const [first] = itemsOf(pages);
    expect(first?.externalId).toBe('story:101');
    expect(first?.turns.map((turn) => turn.externalId)).toEqual(['body']);
    expect(itemsOf(pages)).toHaveLength(5);
  });

  it('remonte un jeton rejeté (401) sur les commentaires', async () => {
    const routes = firstPassRoutes();
    routes[2] = { url: `${API}/stories/101/comments`, status: 401 };

    await expect(runSync(routes)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un 401 et un 403 sur la recherche des histoires', async () => {
    for (const status of [401, 403]) {
      const run = runSync([searchRoute(null, { status })]);

      await expect(run, String(status)).rejects.toBeInstanceOf(ConnectorAuthError);
    }
  });

  it('remonte un autre échec de la recherche, sans reprendre le corps', async () => {
    const run = runSync([searchRoute({ message: 'Invalid secret-xyz' }, { status: 422 })]);

    const failure = await run.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as ConnectorHttpError).status).toBe(422);
    expect((failure as Error).message).not.toContain('secret-xyz');
  });

  it('refuse une réponse qui n’est pas une liste d’histoires', async () => {
    const run = runSync([searchRoute({ data: [], next: null, total: 0 })]);

    const failure = await run.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Unexpected response');
  });
});

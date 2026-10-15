import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { missiveConnector } from './connector';
import bodiesConv1 from './fixtures/bodies-conv1.json';
import bodiesConv3 from './fixtures/bodies-conv3.json';
import commentsConv1 from './fixtures/comments-conv1.json';
import conversations from './fixtures/conversations.json';
import messagesConv1 from './fixtures/messages-conv1.json';
import messagesConv3 from './fixtures/messages-conv3.json';
import organizations from './fixtures/organizations.json';
import users from './fixtures/users.json';

const TOKEN = 'jeton-de-test-0123456789';
type TestConfig = Parameters<typeof missiveConnector.hosts>[0];
const config: TestConfig = { token: TOKEN };
const SINCE = new Date('2026-09-15T12:00:00Z');
const SINCE_SECONDS = 1789473600;

const API = 'https://public.missiveapp.com/v1';
const LIST = `${API}/conversations`;
const C1 = '6d3c9b1c-7067-4a28-8ea6-ea91340b67cc'; // deux courriels et un commentaire
const C2 = '0b8d3a52-5c1e-4f0a-9d63-2f4a8e7c1b90'; // invité : l'API ne rend que son identifiant et sa date
const C3 = 'a7c1e2f4-3b5d-4e86-8f19-6c0d2b9a4e31'; // un SMS
const M1 = '3fa4bcf5-e57e-47a4-9422-de2cce5f802e';
const M2 = '9c2d7e10-4b6a-4d3f-a5e8-1f7b0c3d6a24';
const SMS = 'd4e6f8a0-1b3c-4d5e-9f70-2a4c6e8b0d13';

const messagesUrl = (id: string) => `${API}/conversations/${id}/messages`;
const commentsUrl = (id: string) => `${API}/conversations/${id}/comments`;
const bodiesUrl = (ids: string[]) => `${API}/messages/${ids.join(',')}`;

const listRoute = (rows: unknown[]): FakeRoute => ({ url: LIST, json: { conversations: rows } });
// Les requêtes portent leur chaîne de requête (?limit=10) : l'expression l'accepte.
const noComments: FakeRoute = {
  url: /\/conversations\/[^/]+\/comments(\?|$)/,
  json: { comments: [] },
};

// Les trois conversations de la fixture, avec leurs messages, leurs corps et leurs commentaires.
// L'invité (C2) est refusé partout.
function fixtureRoutes(): FakeRoute[] {
  return [
    listRoute(conversations.conversations),
    { url: messagesUrl(C1), json: messagesConv1 },
    { url: bodiesUrl([M2, M1]), json: bodiesConv1 },
    { url: commentsUrl(C1), json: commentsConv1 },
    { url: messagesUrl(C2), status: 403, json: { errors: [{ message: 'refusé' }] } },
    { url: commentsUrl(C2), status: 403, json: { errors: [{ message: 'refusé' }] } },
    { url: messagesUrl(C3), json: messagesConv3 },
    { url: bodiesUrl([SMS]), json: bodiesConv3 },
    { url: commentsUrl(C3), json: { comments: [] } },
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(missiveConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(missiveConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;
const pathOf = (url: string | undefined) => new URL(url ?? '').pathname;
const itemOf = (pages: SyncPage[], id: string) => {
  const item = itemsOf(pages).find((candidate) => candidate.externalId === `conversation:${id}`);
  if (!item) throw new Error(`conversation absente : ${id}`);
  return item;
};

// Une conversation de plus, pour les tests de pagination et de curseur.
const row = (id: string, at: number) => ({
  id,
  last_activity_at: at,
  latest_message_subject: `Sujet ${id}`,
  web_url: `https://mail.missiveapp.com/#inbox/conversations/${id}`,
});
// Des conversations du plus récent au plus ancien, une par minute après `since` plus un jour.
const newestFirst = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    row(`c-${index}`, SINCE_SECONDS + 86_400 + index * 60),
  ).reverse();
// Des fils vides : aucun élément, mais chaque conversation est bien lue.
const emptyThreads: FakeRoute[] = [
  { url: /\/conversations\/[^/]+\/messages(\?|$)/, json: { messages: [] } },
  noComments,
];
const manyEmptyThreads = (count: number): FakeRoute[] =>
  Array.from({ length: count }, () => emptyThreads).flat();

describe('missive : configuration', () => {
  const schema = missiveConnector.configSchema;

  it('accepte un jeton, nettoyé', () => {
    expect(schema.parse({ token: `  ${TOKEN} ` })).toEqual({ token: TOKEN });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ token: '   ' }).success).toBe(false);
  });

  it('fixe l’hôte, le champ à chiffrer et l’écart entre deux requêtes', () => {
    expect(missiveConnector.hosts(config)).toEqual(['public.missiveapp.com']);
    expect(missiveConnector.secretFields).toEqual(['token']);
    // Missive demande au plus une requête par seconde en continu (900 par 15 minutes).
    expect(missiveConnector.minIntervalMs).toBe(1000);
  });

  it('est disponible dans le registre et le catalogue, avec l’avertissement sur le forfait', () => {
    expect(getConnector('missive')).toBe(missiveConnector);
    const entry = listCatalog().find((item) => item.id === 'missive');
    expect(entry?.available).toBe(true);
    expect(entry?.fields.map((field) => [field.name, field.kind])).toEqual([['token', 'secret']]);
    expect(entry?.warning).toMatch(/Productive/);
    expect(entry?.triedForReal).toBe(false);
  });
});

describe('missive : verify', () => {
  it('lit les utilisateurs puis les organisations, avec le jeton en Bearer', async () => {
    const { http, calls } = testHttp(missiveConnector, config, [
      { url: `${API}/users`, json: users },
      { url: `${API}/organizations`, json: organizations },
    ]);

    const result = await missiveConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (Acme)' });
    expect(calls.map((call) => pathOf(call.url))).toEqual(['/v1/users', '/v1/organizations']);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(paramsOf(calls[0]?.url).limit).toBe('200');
  });

  it('nomme l’organisation quand le propriétaire du jeton n’est pas dans la liste', async () => {
    const { http } = testHttp(missiveConnector, config, [
      { url: `${API}/users`, json: { users: [users.users[0]] } },
      { url: `${API}/organizations`, json: organizations },
    ]);

    expect(await missiveConnector.verify(config, http)).toEqual({ account: 'organisation Acme' });
  });

  it('lève une erreur de clé sur un 401', async () => {
    const { http } = testHttp(missiveConnector, config, [
      { url: `${API}/users`, status: 401, json: { errors: [{ message: 'Unauthorized' }] } },
    ]);

    await expect(missiveConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('missive : premier passage', () => {
  it('demande la boîte « Tous » par 50, sans `until`, avec le jeton en Bearer', async () => {
    const { calls } = await runSync(fixtureRoutes());

    expect(pathOf(calls[0]?.url)).toBe('/v1/conversations');
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(paramsOf(calls[0]?.url)).toEqual({ all: 'true', limit: '50' });
  });

  it('rend les conversations du plus ancien au plus récent, sans l’invité, avec un curseur', async () => {
    const { pages } = await runSync(fixtureRoutes());

    expect(pages).toHaveLength(1);
    expect(idsOf(pages)).toEqual([`conversation:${C3}`, `conversation:${C1}`]);
    // L'invité (rien à lire) est passé : le curseur avance quand même jusqu'à la dernière lue.
    expect(JSON.parse(pages[0]?.cursor ?? 'null')).toEqual({ at: 1792060200, seen: [C1] });
  });

  it('s’arrête dès que la page lue contient une conversation plus ancienne que `since`', async () => {
    const rows = [...newestFirst(49), row('old', SINCE_SECONDS - 1000)];

    const { calls, pages } = await runSync([listRoute(rows), ...manyEmptyThreads(49)]);

    expect(calls.filter((call) => pathOf(call.url) === '/v1/conversations')).toHaveLength(1);
    expect(pages.flatMap((page) => JSON.parse(page.cursor).seen)).not.toContain('old');
  });

  it('pagine du plus récent au plus ancien avec `until`, sans lire deux fois une conversation', async () => {
    const first = newestFirst(50);
    const second = [first[49], row('c-extra', SINCE_SECONDS + 3600), row('old', SINCE_SECONDS - 5)];
    const oldestOfFirst = first[49]?.last_activity_at;

    const { calls, pages } = await runSync([
      listRoute(first),
      listRoute(second),
      ...manyEmptyThreads(51),
    ]);

    const lists = calls.filter((call) => pathOf(call.url) === '/v1/conversations');
    expect(lists).toHaveLength(2);
    expect(paramsOf(lists[1]?.url)).toEqual({
      all: 'true',
      limit: '50',
      until: String(oldestOfFirst),
    });
    // 50 + c-extra : la conversation du bord n'est comptée qu'une fois, `old` est avant `since`.
    expect(calls.filter((call) => pathOf(call.url).endsWith('/messages'))).toHaveLength(51);
    expect(JSON.parse(pages.at(-1)?.cursor ?? 'null').seen).toEqual(['c-49']);
  });

  it('s’arrête quand la page suivante n’apporte aucune conversation nouvelle', async () => {
    const page = newestFirst(50);

    const { calls } = await runSync([listRoute(page), listRoute(page), ...manyEmptyThreads(50)]);

    expect(calls.filter((call) => pathOf(call.url) === '/v1/conversations')).toHaveLength(2);
  });

  it('s’arrête sur une page dont toutes les conversations ont la même date (règle de la doc)', async () => {
    const page = Array.from({ length: 50 }, (_, index) => row(`c-${index}`, SINCE_SECONDS + 5000));

    const { calls, pages } = await runSync([listRoute(page), ...manyEmptyThreads(50)]);

    expect(calls.filter((call) => pathOf(call.url) === '/v1/conversations')).toHaveLength(1);
    // Cinquante conversations à la même seconde : le curseur les garde toutes.
    const last = JSON.parse(pages.at(-1)?.cursor ?? 'null');
    expect(last.at).toBe(SINCE_SECONDS + 5000);
    expect([...last.seen].sort()).toEqual(page.map((entry) => entry.id).sort());
  });

  it('découpe en pages de 20 conversations au plus, avec un curseur à chaque page', async () => {
    const { pages } = await runSync([listRoute(newestFirst(45)), ...manyEmptyThreads(45)]);

    expect(pages).toHaveLength(3);
    expect(pages.map((page) => JSON.parse(page.cursor).seen)).toEqual([
      ['c-19'],
      ['c-39'],
      ['c-44'],
    ]);
  });

  it('ne rend rien quand aucune conversation n’a bougé', async () => {
    const { pages } = await runSync([listRoute([])]);

    expect(pages).toEqual([]);
  });
});

describe('missive : une conversation devient un élément', () => {
  it('rend le titre, le lien, la date d’activité et l’origine', async () => {
    const { pages } = await runSync(fixtureRoutes());

    expect(itemOf(pages, C1)).toMatchObject({
      nature: 'fil',
      title: 'Re: Facture de septembre',
      url: `https://mail.missiveapp.com/#inbox/conversations/${C1}`,
      updatedAt: '2026-10-15T10:30:00.000Z',
      origin: { organization: 'Acme', team: 'Support', labels: 'Facturation' },
    });
    // L'objet de la conversation passe avant celui du dernier message ; pas d'équipe, pas de clé.
    expect(itemOf(pages, C3)).toMatchObject({
      title: 'Livraison du 12 octobre',
      origin: { organization: 'Acme' },
    });
    expect(Object.keys(itemOf(pages, C3).origin)).toEqual(['organization']);
  });

  it('mêle messages et commentaires dans l’ordre des dates, tous en tours participant', async () => {
    const { pages } = await runSync(fixtureRoutes());

    const turns = itemOf(pages, C1).turns;

    expect(turns.map((turn) => turn.externalId)).toEqual([
      `message:${M1}`,
      'comment:5e1f8a37-2d4c-4b90-86a3-7d9c0e2f1b45',
      `message:${M2}`,
    ]);
    expect(turns.map((turn) => turn.role)).toEqual(['participant', 'participant', 'participant']);
    expect(turns.map((turn) => turn.ts)).toEqual([
      '2026-10-14T09:00:00.000Z',
      '2026-10-15T10:00:00.000Z',
      '2026-10-15T10:30:00.000Z',
    ]);
  });

  it('donne à chaque tour son auteur : expéditeur, rédacteur du message sortant, auteur du commentaire', async () => {
    const { pages } = await runSync(fixtureRoutes());

    const [incoming, comment, outgoing] = itemOf(pages, C1).turns;

    expect(incoming?.author).toEqual({ name: 'Marc Lefèvre', email: 'marc@client.test' });
    expect(comment?.author).toEqual({ name: 'Paul Durand', email: 'paul@acme.test' });
    // Le message sortant part de l'adresse du support ; l'auteur est la personne qui l'a écrit.
    expect(outgoing?.author).toEqual({ name: 'Julie Martin', email: 'julie@acme.test' });
    expect(itemOf(pages, C3).turns[0]?.author).toEqual({ name: 'Léa Moreau', email: null });
  });

  it('passe le corps HTML en texte, sans balise ni entité', async () => {
    const { pages } = await runSync(fixtureRoutes());

    const [incoming, , outgoing] = itemOf(pages, C1).turns;

    expect(incoming?.text).toContain('il y a une erreur sur la facture de septembre');
    expect(incoming?.text).toMatch(/1\s250\s€ au lieu de 1\s150\s€/);
    expect(outgoing?.text).toMatch(/- Total : 1\s150\s€/);
    expect(outgoing?.text).toContain('- Échéance : 30 octobre');
    for (const turn of itemOf(pages, C1).turns) expect(turn.text).not.toMatch(/[<>]|&\w+;/);
    expect(itemOf(pages, C3).turns[0]?.text).toBe('Votre colis arrive mardi entre 9 h et 12 h.');
  });

  it('lit la conversation dans l’ordre : messages, corps de ces messages, commentaires', async () => {
    const { calls } = await runSync(fixtureRoutes());

    const forC1 = calls
      .map((call) => call.url)
      .filter((url) => url.includes(C1) || url.includes(M2));
    expect(forC1.map((url) => pathOf(url))).toEqual([
      `/v1/conversations/${C1}/messages`,
      `/v1/messages/${M2},${M1}`,
      `/v1/conversations/${C1}/comments`,
    ]);
    expect(paramsOf(forC1[0])).toEqual({ limit: '10' });
    expect(paramsOf(forC1[2])).toEqual({ limit: '10' });
  });

  it('lit plus de 10 messages par `until`, et leurs corps par groupes de 10', async () => {
    const stamp = (n: number) => SINCE_SECONDS + 86_400 + n * 60;
    const message = (n: number) => ({
      id: `m-${n}`,
      type: 'email',
      delivered_at: stamp(n),
      preview: `aperçu ${n}`,
      from_field: { name: 'Marc', address: 'marc@client.test' },
    });
    const newest = Array.from({ length: 12 }, (_, index) => message(12 - index)); // m-12 … m-1
    const bodies = (ids: string[]) => ({
      messages: ids.map((id) => ({ id, body: `<p>texte ${id}</p>` })),
    });
    const firstTen = newest.slice(0, 10).map((m) => m.id);
    const lastTwo = newest.slice(10).map((m) => m.id);

    const { calls, pages } = await runSync([
      listRoute([row('c-big', stamp(20))]),
      { url: messagesUrl('c-big'), json: { messages: newest.slice(0, 10) } },
      { url: messagesUrl('c-big'), json: { messages: [newest[9], ...newest.slice(10)] } },
      { url: bodiesUrl(firstTen), json: bodies(firstTen) },
      { url: bodiesUrl(lastTwo), json: bodies(lastTwo) },
      noComments,
    ]);

    const messageCalls = calls.filter((call) => pathOf(call.url).endsWith('/messages'));
    expect(paramsOf(messageCalls[1]?.url)).toEqual({ limit: '10', until: String(stamp(3)) });
    const turns = itemOf(pages, 'c-big').turns;
    expect(turns.map((turn) => turn.externalId)).toEqual(
      Array.from({ length: 12 }, (_, index) => `message:m-${index + 1}`),
    );
    expect(turns[0]?.text).toBe('texte m-1');
  });

  it('lit le corps du dernier groupe même quand il ne compte qu’un message (réponse en objet)', async () => {
    // La doc : un seul identifiant rend { messages: { … } } (un objet) ; plusieurs, un tableau.
    const stamp = (n: number) => SINCE_SECONDS + 86_400 + n * 60;
    const message = (n: number) => ({
      id: `m-${n}`,
      type: 'email',
      delivered_at: stamp(n),
      preview: `aperçu ${n}`,
      from_field: { name: 'Marc', address: 'marc@client.test' },
    });
    const newest = Array.from({ length: 11 }, (_, index) => message(11 - index)); // m-11 … m-1
    const firstTen = newest.slice(0, 10).map((m) => m.id);
    const body = (id: string) => ({ id, body: `<p>texte ${id}</p>` });

    const { pages } = await runSync([
      listRoute([row('c-onze', stamp(20))]),
      { url: messagesUrl('c-onze'), json: { messages: newest.slice(0, 10) } },
      { url: messagesUrl('c-onze'), json: { messages: [newest[9], newest[10]] } },
      { url: bodiesUrl(firstTen), json: { messages: firstTen.map(body) } },
      { url: bodiesUrl(['m-1']), json: { messages: body('m-1') } },
      noComments,
    ]);

    const turns = itemOf(pages, 'c-onze').turns;
    expect(turns).toHaveLength(11);
    // Le message du groupe d'un seul porte son corps, pas seulement son aperçu.
    expect(turns[0]?.text).toBe('texte m-1');
    expect(turns[1]?.text).toBe('texte m-2');
  });

  it('lit plus de 10 commentaires par `until`', async () => {
    const stamp = (n: number) => SINCE_SECONDS + 86_400 + n * 60;
    const comment = (n: number) => ({ id: `k-${n}`, body: `note ${n}`, created_at: stamp(n) });
    const newest = Array.from({ length: 11 }, (_, index) => comment(11 - index)); // k-11 … k-1

    const { calls, pages } = await runSync([
      listRoute([row('c-notes', stamp(20))]),
      { url: messagesUrl('c-notes'), json: { messages: [] } },
      { url: commentsUrl('c-notes'), json: { comments: newest.slice(0, 10) } },
      { url: commentsUrl('c-notes'), json: { comments: [newest[9], newest[10]] } },
    ]);

    const commentCalls = calls.filter((call) => pathOf(call.url).endsWith('/comments'));
    expect(paramsOf(commentCalls[1]?.url)).toEqual({ limit: '10', until: String(stamp(2)) });
    expect(itemOf(pages, 'c-notes').turns.map((turn) => turn.externalId)).toEqual(
      Array.from({ length: 11 }, (_, index) => `comment:k-${index + 1}`),
    );
  });

  it('ne rend pas une conversation dont rien n’est lisible', async () => {
    const empty = { id: 'm-vide', type: 'email', delivered_at: SINCE_SECONDS + 100, preview: '' };
    const { pages } = await runSync([
      listRoute([row('c-vide', SINCE_SECONDS + 200)]),
      { url: messagesUrl('c-vide'), json: { messages: [empty] } },
      { url: bodiesUrl(['m-vide']), json: { messages: { id: 'm-vide', body: '<div> </div>' } } },
      noComments,
    ]);

    expect(idsOf(pages)).toEqual([]);
  });

  it('chaque date rendue passe la normalisation du socle', async () => {
    const { pages } = await runSync(fixtureRoutes());

    expect(itemsOf(pages)).toHaveLength(2);
    for (const item of itemsOf(pages)) {
      expect(normalizeItem(item, 'missive'), item.externalId).not.toBeNull();
    }
  });
});

describe('missive : ressource secondaire et erreurs', () => {
  const oneConversation = (extra: FakeRoute[]): FakeRoute[] => [
    listRoute([conversations.conversations[0]]),
    ...extra,
  ];

  it('un 403 sur les corps laisse l’aperçu de chaque message', async () => {
    const { pages } = await runSync(
      oneConversation([
        { url: messagesUrl(C1), json: messagesConv1 },
        { url: bodiesUrl([M2, M1]), status: 403, json: { errors: [] } },
        { url: commentsUrl(C1), json: { comments: [] } },
      ]),
    );

    expect(itemOf(pages, C1).turns.map((turn) => turn.text)).toEqual([
      'Bonjour, il y a une erreur sur la facture de septembre.',
      'Bonjour Marc, voici la facture rectifiée.',
    ]);
  });

  it.each([403, 404])(
    'un %s sur les commentaires laisse la conversation sans eux',
    async (status) => {
      const { pages } = await runSync(
        oneConversation([
          { url: messagesUrl(C1), json: messagesConv1 },
          { url: bodiesUrl([M2, M1]), json: bodiesConv1 },
          { url: commentsUrl(C1), status, json: { errors: [] } },
        ]),
      );

      expect(itemOf(pages, C1).turns.map((turn) => turn.externalId)).toEqual([
        `message:${M1}`,
        `message:${M2}`,
      ]);
    },
  );

  it.each([403, 404])('un %s sur les messages laisse les commentaires seuls', async (status) => {
    const { pages } = await runSync(
      oneConversation([
        { url: messagesUrl(C1), status, json: { errors: [] } },
        { url: commentsUrl(C1), json: commentsConv1 },
      ]),
    );

    expect(itemOf(pages, C1).turns.map((turn) => turn.externalId)).toEqual([
      'comment:5e1f8a37-2d4c-4b90-86a3-7d9c0e2f1b45',
    ]);
  });

  it('un 401 sur les messages remonte comme une clé refusée', async () => {
    await expect(
      runSync(oneConversation([{ url: messagesUrl(C1), status: 401, json: { errors: [] } }])),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('un 401 sur la liste remonte comme une clé refusée', async () => {
    await expect(
      runSync([{ url: LIST, status: 401, json: { errors: [{ message: 'Unauthorized' }] } }]),
    ).rejects.toMatchObject({ name: 'ConnectorAuthError', status: 401 });
  });

  it('une conversation sans date d’activité est une erreur propre, sans le corps', async () => {
    const broken = [{ id: C1, latest_message_subject: 'SECRET-DU-CORPS' }];

    const failure = await runSync([listRoute(broken)]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
  });
});

describe('missive : reprise avec le curseur', () => {
  const cursor = JSON.stringify({ at: 1792060200, seen: [C1] });

  it('ne refait pas la première page : tout ce qui est déjà rendu est écarté', async () => {
    const { pages, calls } = await runSync([listRoute(conversations.conversations)], { cursor });

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('le dernier curseur d’un premier passage, repassé à `sync`, ne relit aucune conversation', async () => {
    const first = await runSync(fixtureRoutes());
    const last = first.pages.at(-1)?.cursor ?? null;

    const second = await runSync([listRoute(conversations.conversations)], { cursor: last });

    expect(second.pages).toEqual([]);
    expect(second.calls.map((call) => pathOf(call.url))).toEqual(['/v1/conversations']);
  });

  it('rend une conversation nouvelle, et une autre vue à la même seconde que le curseur', async () => {
    const same = row('c-meme', 1792060200);
    const newer = row('c-neuve', 1792061000);

    const { pages, calls } = await runSync(
      [listRoute([newer, same, conversations.conversations[0]]), ...manyEmptyThreads(2)],
      { cursor },
    );

    // Les deux conversations nouvelles sont lues ; celle du curseur (C1) ne l'est pas.
    const read = calls.filter((call) => pathOf(call.url).endsWith('/messages'));
    expect(read.map((call) => pathOf(call.url).split('/')[3])).toEqual(['c-meme', 'c-neuve']);
    expect(pages.flatMap((page) => JSON.parse(page.cursor).seen)).toEqual(['c-neuve']);
    expect(JSON.parse(pages[0]?.cursor ?? 'null')).toEqual({ at: 1792061000, seen: ['c-neuve'] });
  });

  it('s’arrête dès que la page lue passe sous le curseur', async () => {
    const above = Array.from({ length: 49 }, (_, index) =>
      row(`n-${index}`, 1792061000 + index * 60),
    );
    const rows = [...above.reverse(), row('vieux', 1792000000)];

    const { calls } = await runSync([listRoute(rows), ...manyEmptyThreads(49)], { cursor });

    expect(calls.filter((call) => pathOf(call.url) === '/v1/conversations')).toHaveLength(1);
  });

  it('repart de `since` quand le curseur est illisible', async () => {
    const { pages } = await runSync(fixtureRoutes(), { cursor: 'pas du json' });

    expect(idsOf(pages)).toEqual([`conversation:${C3}`, `conversation:${C1}`]);
  });
});

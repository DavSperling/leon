import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { helpscoutCatalog } from './catalog';
import { helpscoutConnector } from './connector';
import empty from './fixtures/conversations-empty.json';
import page1 from './fixtures/conversations-page1.json';
import page2 from './fixtures/conversations-page2.json';
import me from './fixtures/me.json';
import token from './fixtures/token.json';
import { helpscoutOAuth } from './oauth';

const APP_ID = 'identifiant-appli-test-01';
const APP_SECRET = 'secret-appli-test-0123456789';
const ACCESS_TOKEN = token.access_token;
type TestConfig = Parameters<typeof helpscoutConnector.hosts>[0];
const config: TestConfig = { authMode: 'key', appId: APP_ID, appSecret: APP_SECRET };
// Le bouton : des jetons générés à l'exécution (aucun secret, même d'exemple, dans le dépôt).
const OAUTH_ACCESS = `acces-${randomBytes(12).toString('hex')}`;
const OAUTH_CONFIG = {
  authMode: 'oauth',
  accessToken: OAUTH_ACCESS,
  refreshToken: `rafraichir-${randomBytes(12).toString('hex')}`,
  expiresAt: '2026-10-17T12:00:00.000Z',
};
const NOW = new Date('2026-10-15T12:00:00Z');
const SINCE = new Date('2026-09-15T12:00:00Z');

const API = 'https://api.helpscout.net/v2';
const TOKEN_URL = `${API}/oauth2/token`;
const LIST_URL = `${API}/conversations`;

const tokenRoute: FakeRoute = { method: 'POST', url: TOKEN_URL, json: token };
const listRoute = (json: unknown): FakeRoute => ({ url: LIST_URL, json });
const firstPassRoutes = (): FakeRoute[] => [tokenRoute, listRoute(page1), listRoute(page2)];

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
  stored: Record<string, unknown> = config,
) {
  const { http, calls } = testHttp(helpscoutConnector, stored, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const parsed = helpscoutConnector.configSchema.parse(stored);
  const pages = await collect(helpscoutConnector.sync(parsed, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;
const listCalls = <T extends { url: string }>(calls: T[]) =>
  calls.filter((call) => call.url.startsWith(LIST_URL));
const itemOf = (pages: SyncPage[], id: number) => {
  const item = itemsOf(pages).find((candidate) => candidate.externalId === `conversation:${id}`);
  if (!item) throw new Error(`conversation absente : ${id}`);
  return item;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('helpscout : configuration', () => {
  const schema = helpscoutConnector.configSchema;

  it('accepte un identifiant et un secret d’appli, nettoyés, et prend une connexion sans authMode pour une clé', () => {
    expect(schema.parse({ appId: `  ${APP_ID} `, appSecret: ` ${APP_SECRET}  ` })).toEqual(config);
  });

  it('accepte la forme du bouton, avec ou sans jeton de rafraîchissement', () => {
    expect(schema.parse(OAUTH_CONFIG)).toEqual(OAUTH_CONFIG);
    const noRefresh = { ...OAUTH_CONFIG, refreshToken: null, expiresAt: null };
    expect(schema.parse(noRefresh)).toEqual(noRefresh);
  });

  it('refuse une forme incomplète : jeton d’accès manquant ou vide, clé absente, mode inconnu', () => {
    expect(schema.safeParse({ authMode: 'oauth' }).success).toBe(false);
    expect(schema.safeParse({ ...OAUTH_CONFIG, accessToken: '' }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'key', accessToken: OAUTH_ACCESS }).success).toBe(false);
    expect(schema.safeParse({ accessToken: OAUTH_ACCESS }).success).toBe(false);
    expect(schema.safeParse({ ...config, authMode: 'inconnu' }).success).toBe(false);
  });

  it('garde un schéma d’objet que le catalogue sait lire (.shape)', () => {
    const shape = (schema as unknown as z.ZodObject).shape;
    expect(Object.keys(shape).sort()).toEqual([
      'accessToken',
      'appId',
      'appSecret',
      'authMode',
      'expiresAt',
      'refreshToken',
    ]);
  });

  it('refuse une configuration incomplète ou vide', () => {
    expect(schema.safeParse({ appSecret: APP_SECRET }).success).toBe(false);
    expect(schema.safeParse({ appId: APP_ID }).success).toBe(false);
    expect(schema.safeParse({ ...config, appId: '   ' }).success).toBe(false);
    expect(schema.safeParse({ ...config, appSecret: '' }).success).toBe(false);
  });

  it('fixe l’hôte de l’API et le champ à chiffrer', () => {
    expect(helpscoutConnector.hosts(config)).toEqual(['api.helpscout.net']);
    // Les jetons du bouton rejoignent les secrets par le socle : ils ne figurent pas ici.
    expect(helpscoutConnector.secretFields).toEqual(['appSecret']);
  });

  it('déclare la description du bouton, et le catalogue dit ce que l’on verra chez Help Scout', () => {
    expect(helpscoutConnector.oauth).toBe(helpscoutOAuth);
    expect(helpscoutCatalog.oauthHelp?.trim()).toBeTruthy();
    // L'identifiant et le secret d'appli restent acceptés, avec leur aide.
    expect(helpscoutCatalog.keyAccepted).not.toBe(false);
    expect(helpscoutCatalog.keyHelp).toMatch(/My apps/);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('helpscout')).toBe(helpscoutConnector);
    const entry = listCatalog().find((item) => item.id === 'helpscout');
    expect(entry?.available).toBe(true);
    expect(entry?.fields.map((field) => [field.name, field.kind])).toEqual([
      ['appId', 'text'],
      ['appSecret', 'secret'],
    ]);
    expect(entry?.docsUrl).toMatch(/^https:\/\/developer\.helpscout\.com\//);
    expect(entry?.warning).toMatch(/Standard/);
    expect(entry?.triedForReal).toBe(false);
  });
});

describe('helpscout : verify', () => {
  it('demande un jeton avec les identifiants de l’appli, puis lit l’utilisateur avec ce jeton', async () => {
    const { http, calls } = testHttp(helpscoutConnector, config, [
      tokenRoute,
      { url: `${API}/users/me`, json: me },
    ]);

    const result = await helpscoutConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (marie@acme.test)', accountKey: '4' });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: TOKEN_URL,
      body: { grant_type: 'client_credentials', client_id: APP_ID, client_secret: APP_SECRET },
    });
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[1]?.url).toBe(`${API}/users/me`);
    expect(calls[1]?.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('se rabat sur l’e-mail quand l’utilisateur n’a pas de nom', async () => {
    const { http } = testHttp(helpscoutConnector, config, [
      tokenRoute,
      { url: `${API}/users/me`, json: { id: 4, email: 'marie@acme.test' } },
    ]);

    await expect(helpscoutConnector.verify(config, http)).resolves.toEqual({
      account: 'marie@acme.test',
      accountKey: '4',
    });
  });

  it.each([400, 401, 403])(
    'lève une erreur de clé quand le jeton est refusé (%s)',
    async (status) => {
      const { http } = testHttp(helpscoutConnector, config, [
        { method: 'POST', url: TOKEN_URL, status, json: { error: 'invalid_client' } },
      ]);

      await expect(helpscoutConnector.verify(config, http)).rejects.toMatchObject({
        name: 'ConnectorAuthError',
        message: 'Clé refusée par Help Scout',
      });
    },
  );

  it('lève une erreur de clé sur un 401 de l’utilisateur', async () => {
    const { http } = testHttp(helpscoutConnector, config, [
      tokenRoute,
      { url: `${API}/users/me`, status: 401, json: {} },
    ]);

    await expect(helpscoutConnector.verify(config, http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('refuse une réponse de jeton sans jeton, sans la reprendre', async () => {
    const { http } = testHttp(helpscoutConnector, config, [
      { method: 'POST', url: TOKEN_URL, json: { token_type: 'bearer', secret: 'CORPS-SECRET' } },
    ]);

    const failure = await helpscoutConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
  });
});

describe('helpscout : connexion par le bouton', () => {
  const oauthConfig = () => helpscoutConnector.configSchema.parse(OAUTH_CONFIG);

  it('verify lit l’utilisateur avec le jeton du bouton, sans demander de jeton à Help Scout', async () => {
    const { http, calls } = testHttp(helpscoutConnector, OAUTH_CONFIG, [
      { url: `${API}/users/me`, json: me },
    ]);

    await expect(helpscoutConnector.verify(oauthConfig(), http)).resolves.toEqual({
      account: 'Marie Durand (marie@acme.test)',
      accountKey: '4',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${API}/users/me`);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${OAUTH_ACCESS}`);
  });

  it('sync envoie le jeton du bouton avec « Bearer » à chaque page, sans demander de jeton', async () => {
    const { pages, calls } = await runSync([listRoute(page1), listRoute(page2)], {}, OAUTH_CONFIG);

    expect(idsOf(pages)).toEqual(['conversation:4001', 'conversation:4002', 'conversation:4003']);
    expect(calls.filter((call) => call.url === TOKEN_URL)).toHaveLength(0);
    expect(listCalls(calls)).toHaveLength(2);
    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${OAUTH_ACCESS}`);
  });

  it('garde l’identifiant et le secret d’appli : un jeton est encore demandé pour une connexion à clé', async () => {
    const stored = { appId: APP_ID, appSecret: APP_SECRET };
    const { http, calls } = testHttp(helpscoutConnector, stored, [
      tokenRoute,
      { url: `${API}/users/me`, json: me },
    ]);

    await helpscoutConnector.verify(helpscoutConnector.configSchema.parse(stored), http);

    expect(calls[0]).toMatchObject({ method: 'POST', url: TOKEN_URL });
    expect(calls[1]?.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it.each([401, 403])(
    'rend un jeton refusé (%s) comme une clé refusée : le socle renouvelle sur le 401',
    async (status) => {
      const { http } = testHttp(helpscoutConnector, OAUTH_CONFIG, [
        { url: `${API}/users/me`, status, json: {} },
      ]);

      const error = await helpscoutConnector.verify(oauthConfig(), http).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConnectorAuthError);
      expect((error as ConnectorAuthError).status).toBe(status);
    },
  );

  it('un 401 au milieu d’un passage remonte comme une erreur de clé, au curseur d’origine', async () => {
    await expect(
      runSync(
        [{ url: LIST_URL, status: 401, json: { message: 'Unauthorized' } }],
        {},
        OAUTH_CONFIG,
      ),
    ).rejects.toMatchObject({ name: 'ConnectorAuthError', status: 401 });
  });
});

describe('helpscout : premier passage', () => {
  it('lit toutes les conversations modifiées depuis `since`, de la plus ancienne à la plus récente', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const first = listCalls(calls)[0];
    expect(first?.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(paramsOf(first?.url)).toEqual({
      status: 'all',
      modifiedSince: '2026-09-15T12:00:00Z',
      sortField: 'modifiedAt',
      sortOrder: 'asc',
      embed: 'threads',
      page: '1',
    });
  });

  it('ne demande le jeton qu’une fois pour tout le passage', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.filter((call) => call.url === TOKEN_URL)).toHaveLength(1);
    expect(calls[0]?.url).toBe(TOKEN_URL);
  });

  it('rend une page par page de l’outil, avec le curseur pour reprendre juste après', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    expect(pages.map((page) => page.items.map((item) => item.externalId))).toEqual([
      ['conversation:4001', 'conversation:4002'],
      ['conversation:4003'],
    ]);
    expect(JSON.parse(pages[0]?.cursor ?? 'null')).toEqual({
      since: '2026-09-15T12:00:00Z',
      page: 2,
    });
    expect(paramsOf(listCalls(calls)[1]?.url)).toMatchObject({
      page: '2',
      modifiedSince: '2026-09-15T12:00:00Z',
    });
  });

  it('termine sur un curseur qui repart de cinq minutes avant la dernière lecture', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(JSON.parse(pages.at(-1)?.cursor ?? 'null')).toEqual({
      since: '2026-10-15T11:55:00Z',
      page: 1,
    });
  });

  it('s’arrête à la dernière page annoncée, même si l’outil répète la première', async () => {
    const { calls } = await runSync([tokenRoute, listRoute(page1), listRoute(page1)]);

    expect(listCalls(calls)).toHaveLength(2);
  });

  it('relit la page après une limite de débit (429), sans redemander le jeton', async () => {
    const single = { ...page2, page: { ...page2.page, totalPages: 1 } };

    const { pages, calls } = await runSync([
      tokenRoute,
      { url: LIST_URL, status: 429, json: {}, headers: { 'x-ratelimit-retry-after': '1' } },
      listRoute(single),
    ]);

    expect(idsOf(pages)).toEqual(['conversation:4003']);
    expect(listCalls(calls)).toHaveLength(2);
    expect(calls.filter((call) => call.url === TOKEN_URL)).toHaveLength(1);
  });
});

describe('helpscout : reprise avec le curseur', () => {
  it('reprend à la page du curseur, avec la date du curseur et non `since`', async () => {
    const cursor = JSON.stringify({ since: '2026-09-20T08:30:00Z', page: 2 });

    const { pages, calls } = await runSync([tokenRoute, listRoute(page2)], { cursor });

    expect(paramsOf(listCalls(calls)[0]?.url)).toMatchObject({
      page: '2',
      modifiedSince: '2026-09-20T08:30:00Z',
    });
    expect(idsOf(pages)).toEqual(['conversation:4003']);
  });

  it('le dernier curseur rendu ne refait pas la première page : il ne relit que la fenêtre récente', async () => {
    const first = await runSync(firstPassRoutes());
    const last = first.pages.at(-1)?.cursor ?? null;

    const { pages, calls } = await runSync([tokenRoute, listRoute(empty)], { cursor: last });

    expect(paramsOf(listCalls(calls)[0]?.url)).toMatchObject({
      modifiedSince: '2026-10-15T11:55:00Z',
      page: '1',
    });
    expect(itemsOf(pages)).toEqual([]);
  });

  it('repart de `since` quand le curseur est illisible', async () => {
    const { calls } = await runSync([tokenRoute, listRoute(empty)], { cursor: 'pas du json' });

    expect(paramsOf(listCalls(calls)[0]?.url)).toMatchObject({
      modifiedSince: '2026-09-15T12:00:00Z',
      page: '1',
    });
  });

  it('rend une page vide avec un curseur avancé quand rien n’a changé', async () => {
    const { pages } = await runSync([tokenRoute, listRoute(empty)]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toEqual([]);
    expect(JSON.parse(pages[0]?.cursor ?? 'null')).toEqual({
      since: '2026-10-15T11:55:00Z',
      page: 1,
    });
  });

  it('rend quand même la page, et son curseur, quand toutes ses conversations sont écartées', async () => {
    const conversations = page2._embedded.conversations.slice(1); // le pourriel, la conversation sans texte
    const skipped = {
      ...page2,
      _embedded: { conversations },
      page: { ...page2.page, number: 2, totalPages: 3 },
    };

    const { pages } = await runSync([tokenRoute, listRoute(skipped), listRoute(empty)], {
      cursor: JSON.stringify({ since: '2026-09-15T12:00:00Z', page: 2 }),
    });

    expect(pages[0]?.items).toEqual([]);
    expect(JSON.parse(pages[0]?.cursor ?? 'null')).toEqual({
      since: '2026-09-15T12:00:00Z',
      page: 3,
    });
  });
});

describe('helpscout : une conversation devient un élément', () => {
  it('rend le titre, le lien, l’origine et la date de la dernière activité', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 4001)).toMatchObject({
      externalId: 'conversation:4001',
      nature: 'fil',
      title: 'Facture de septembre',
      url: 'https://secure.helpscout.net/conversation/4001/12',
      updatedAt: '2026-10-14T16:20:00.000Z',
      origin: { inbox: '13' },
    });
  });

  it('date l’élément de son fil le plus récent quand c’est le plus récent', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 4002).updatedAt).toBe('2026-10-15T08:01:30.000Z');
    expect(itemOf(pages, 4003).updatedAt).toBe('2026-10-15T09:40:00.000Z');
  });

  it('donne un titre à une conversation sans sujet', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 4002).title).toBe('Conversation n°13');
  });

  it('écrit d’abord un tour document avec l’état de la conversation, daté de l’élément', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const state = itemOf(pages, 4001).turns[0];

    expect(state).toMatchObject({
      externalId: 'body',
      role: 'document',
      author: { name: null, email: null },
      ts: '2026-10-14T16:20:00.000Z',
    });
    expect(state?.text).toBe(
      [
        'Conversation n°12 : Facture de septembre',
        'Statut : fermée · Canal : e-mail',
        'Client : Julie Moreau (julie@client.test)',
        'Assignée à : Paul Martin',
        'Étiquettes : facturation, remboursement',
      ].join('\n'),
    );
  });

  it('omet de l’état ce que l’outil ne donne pas, et nomme l’équipe assignée', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const chat = itemOf(pages, 4002).turns[0]?.text ?? '';
    const phone = itemOf(pages, 4003).turns[0]?.text ?? '';

    expect(chat).toContain('Statut : ouverte · Canal : messagerie instantanée');
    expect(chat).toContain('Client : Karim Benali');
    expect(chat).not.toMatch(/Assignée|Étiquettes|\(\)/);
    expect(phone).toContain('Statut : en attente · Canal : téléphone');
    expect(phone).toContain('Assignée à : Équipe Onboarding');
  });

  it('rend les fils du plus ancien au plus récent, un tour participant chacun, avec auteur et date', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const turns = itemOf(pages, 4001).turns;

    // Help Scout liste les fils du plus récent au plus ancien ; le brouillon et le changement d’état sont écartés.
    expect(turns.map((turn) => turn.externalId)).toEqual([
      'body',
      'thread:90001',
      'thread:90002',
      'thread:90003',
    ]);
    expect(turns.slice(1).map((turn) => turn.role)).toEqual(Array(3).fill('participant'));
    expect(turns[1]).toMatchObject({
      author: { name: 'Julie Moreau', email: 'julie@client.test' },
      ts: '2026-10-13T09:00:00Z',
    });
    expect(turns[2]).toMatchObject({
      author: { name: 'Paul Martin', email: 'paul@acme.test' },
      ts: '2026-10-13T14:30:00Z',
    });
    expect(turns[3]?.ts).toBe('2026-10-14T15:45:00Z');
  });

  it('passe le HTML des fils en texte brut', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const [, customer, reply] = itemOf(pages, 4001).turns;

    expect(customer?.text).toBe(
      "Bonjour,\nma facture de septembre est fausse : j'ai été facturée deux fois.",
    );
    expect(reply?.text).toContain('les 120 € cette semaine');
    expect(reply?.text).toContain('- virement lundi\n- avoir sur la prochaine facture');
    expect(reply?.text).toContain('Cordialement,\nPaul');
    expect(reply?.text).not.toMatch(/<|&nbsp;/);
  });

  it('marque une note comme interne, par un attribut du tour et non dans son texte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const turns = itemOf(pages, 4001).turns;

    expect(turns[3]).toMatchObject({
      text: 'Remboursement validé par la comptabilité.',
      internalNote: true,
    });
    expect(turns.slice(1, 3).map((turn) => turn.internalNote)).toEqual([false, false]);
  });

  // Le côté vient du type du fil (et, pour une messagerie, de son auteur), jamais du nom.
  it('donne le côté de chaque fil : client, équipe, messagerie selon son auteur, appel', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const sides = (id: number) => itemOf(pages, id).turns.map((turn) => turn.side);
    // L'état de la conversation prend le côté de celui qui l'a ouverte (son premier fil).
    expect(sides(4001)).toEqual(['external', 'external', 'team', 'team']);
    expect(sides(4002)).toEqual(['external', 'external']); // chat écrit par un client
    expect(sides(4003)).toEqual(['team', 'team']); // appel
  });

  it('un fil de messagerie sans auteur connu n’a pas de côté', async () => {
    const chat = {
      ...page1._embedded.conversations[1],
      _embedded: {
        threads: [{ ...page1._embedded.conversations[1]?._embedded.threads[0], createdBy: null }],
      },
    };

    const { pages } = await runSync([
      tokenRoute,
      listRoute({ ...empty, _embedded: { conversations: [chat] } }),
    ]);

    expect(itemsOf(pages)[0]?.turns.map((turn) => turn.side)).toEqual([undefined, undefined]);
  });

  it('écarte le pourriel et la conversation sans aucun texte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(idsOf(pages)).toEqual(['conversation:4001', 'conversation:4002', 'conversation:4003']);
  });

  it('écarte une conversation supprimée ou sans fils intégrés', async () => {
    const deleted = { ...page1._embedded.conversations[0], id: 4100, state: 'deleted' };
    const withoutThreads = { ...page1._embedded.conversations[0], id: 4101, _embedded: undefined };
    const body = { ...empty, _embedded: { conversations: [deleted, withoutThreads] } };

    const { pages } = await runSync([tokenRoute, listRoute(body)]);

    expect(itemsOf(pages)).toEqual([]);
  });

  it('chaque date rendue passe la normalisation du socle', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of itemsOf(pages)) {
      expect(normalizeItem(item, 'helpscout'), item.externalId).not.toBeNull();
    }
  });
});

describe('helpscout : erreurs', () => {
  it.each([401, 403])('un %s sur la liste remonte comme une clé refusée', async (status) => {
    await expect(
      runSync([tokenRoute, { url: LIST_URL, status, json: { message: 'Access denied' } }]),
    ).rejects.toMatchObject({ name: 'ConnectorAuthError', status });
  });

  it('une réponse qui n’est pas du JSON est une erreur propre, sans le corps', async () => {
    const failure = await runSync([
      tokenRoute,
      { url: LIST_URL, text: '<html>CORPS-SECRET</html>' },
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse illisible');
  });

  it('une conversation sans date de création est une erreur propre, sans le corps', async () => {
    const [first] = page1._embedded.conversations;
    const broken = {
      ...page1,
      _embedded: { conversations: [{ ...first, createdAt: undefined, subject: 'CORPS-SECRET' }] },
    };

    const failure = await runSync([tokenRoute, listRoute(broken)]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
  });
});

import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collect,
  expectHostsWellFormed,
  type FakeCall,
  type FakeRoute,
  testHttp,
} from '@/test/fake-fetch';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import type { ConnectorItem, SyncPage } from '../types';
import { plainConnector } from './connector';
import errorForbidden from './fixtures/error-forbidden.json';
import errorInternal from './fixtures/error-internal.json';
import errorRateLimited from './fixtures/error-rate-limited.json';
import errorUnauthenticated from './fixtures/error-unauthenticated.json';
import errorValidation from './fixtures/error-validation.json';
import threadsEmpty from './fixtures/threads-empty.json';
import threadsPage1 from './fixtures/threads-page-1.json';
import threadsPage2 from './fixtures/threads-page-2.json';
import timelineT101Page1 from './fixtures/timeline-t101-page-1.json';
import timelineT101Page2 from './fixtures/timeline-t101-page-2.json';
import timelineT102 from './fixtures/timeline-t102.json';
import timelineT103Empty from './fixtures/timeline-t103-empty.json';
import workspace from './fixtures/workspace.json';

// Une clé générée à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const KEY = `plainApiKey_${randomBytes(18).toString('hex')}`;
const CONFIG = { apiKey: KEY };
const ENDPOINT = 'https://core-api.uk.plain.com/graphql/v1';
const SINCE = new Date('2026-10-01T00:00:00.000Z');
const SINCE_FILTER = '2026-10-01T00:00:00Z'; // l'outil écrit ses dates à la seconde
const NOW = '2026-10-15T10:00:00.000Z';
const END_FROM = '2026-10-15T09:55:00.000Z'; // le début du passage, moins 5 minutes de marge
const T101 = 'th_01J9Z8K3M4N5P6Q7R8S9T0V1W2';
const T102 = 'th_01J9Z8K3M4N5P6Q7R8S9T0V1W3';
const T103 = 'th_01J9Z8K3M4N5P6Q7R8S9T0V1W4';
const LIST_CURSOR = threadsPage1.data.threads.pageInfo.endCursor; // fin de la première liste de fils
const ENTRIES_CURSOR = timelineT101Page1.data.thread.timelineEntries.pageInfo.endCursor;

const api = (extra: Partial<FakeRoute> = {}): FakeRoute => ({
  method: 'POST',
  url: ENDPOINT,
  ...extra,
});

type GraphqlBody = { query: string; variables: Record<string, unknown> };
const bodyOf = (call: FakeCall | undefined) => call?.body as GraphqlBody;

function sync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(plainConnector, CONFIG, routes);
  return { pages: collect(plainConnector.sync(CONFIG, { cursor, since: SINCE }, http)), calls };
}

// Lit la première page seulement : pour les tests qui ne regardent que les requêtes du début.
async function firstPage(routes: FakeRoute[]) {
  const { http, calls } = testHttp(plainConnector, CONFIG, routes);
  const iterator = plainConnector
    .sync(CONFIG, { cursor: null, since: SINCE }, http)
    [Symbol.asyncIterator]();
  const first = await iterator.next();
  await iterator.return?.();
  return { calls, page: first.value as SyncPage };
}

type Round = { from: string; started: string | null; after: string | null };
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null') as Round;

// Un passage entier : première liste (deux fils, dont T-101 sur deux pages de chronologie), puis
// seconde liste (T-103, sans aucun message).
const fullRound = (): FakeRoute[] => [
  api({ json: threadsPage1 }),
  api({ json: timelineT101Page1 }),
  api({ json: timelineT101Page2 }),
  api({ json: timelineT102 }),
  api({ json: threadsPage2 }),
  api({ json: timelineT103Empty }),
];

beforeEach(() => {
  // Seule l'horloge est simulée : les délais d'attente restent ceux de Node.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('plainConnector : configuration', () => {
  it('refuse une configuration sans clé', () => {
    expect(plainConnector.configSchema.safeParse({}).success).toBe(false);
    expect(plainConnector.configSchema.safeParse({ apiKey: '' }).success).toBe(false);
    expect(plainConnector.configSchema.safeParse({ apiKey: '  ' }).success).toBe(false);
  });

  it('nettoie les espaces autour de la clé', () => {
    expect(plainConnector.configSchema.parse({ apiKey: ` ${KEY}\n` })).toEqual(CONFIG);
  });

  it('déclare un hôte exact, la clé comme secret et un écart minimal entre les requêtes', () => {
    expect(plainConnector.hosts(CONFIG)).toEqual(['core-api.uk.plain.com']);
    expectHostsWellFormed(plainConnector.hosts(CONFIG));
    expect(plainConnector.secretFields).toEqual(['apiKey']);
    // La limite la plus basse de l'aide de l'éditeur est de 450 requêtes par minute (un tous les 133 ms).
    expect(plainConnector.minIntervalMs).toBe(150);
  });
});

describe('plainConnector : verify', () => {
  it('rend le nom de l’espace et envoie la clé en « Bearer »', async () => {
    const { http, calls } = testHttp(plainConnector, CONFIG, [api({ json: workspace })]);

    await expect(plainConnector.verify(CONFIG, http)).resolves.toEqual({
      account: 'Acme Support',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(ENDPOINT);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(bodyOf(calls[0]).query).toMatch(/myWorkspace/);
  });

  it('lève ConnectorAuthError sur un 401', async () => {
    const { http } = testHttp(plainConnector, CONFIG, [api({ status: 401, json: {} })]);

    await expect(plainConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lève ConnectorAuthError sur UNAUTHENTICATED rendu avec un 200', async () => {
    const { http } = testHttp(plainConnector, CONFIG, [api({ json: errorUnauthenticated })]);

    const error = await plainConnector.verify(CONFIG, http).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorAuthError);
    expect((error as ConnectorAuthError).status).toBe(401);
  });

  it('lève ConnectorAuthError sur FORBIDDEN (droit manquant)', async () => {
    const { http } = testHttp(plainConnector, CONFIG, [api({ json: errorForbidden })]);

    const error = await plainConnector.verify(CONFIG, http).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorAuthError);
    expect((error as ConnectorAuthError).status).toBe(403);
  });
});

describe('plainConnector : premier passage', () => {
  it('liste les fils modifiés depuis since, du plus ancien au plus récent par création, 25 par page', async () => {
    const { calls } = await firstPage(fullRound());

    const first = bodyOf(calls[0]);
    expect(first.variables).toEqual({
      filters: { updatedAt: { after: SINCE_FILTER } },
      first: 25,
      after: null,
    });
    expect(first.query).toMatch(/sortBy: \{ field: CREATED_AT, direction: ASC \}/);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it('lit la chronologie de chaque fil, limitée aux messages et aux notes', async () => {
    const { calls } = await firstPage(fullRound());

    const second = bodyOf(calls[1]);
    expect(second.variables).toEqual({ threadId: T101, first: 50, after: null });
    const types = /entryTypes: \[([^\]]*)\]/
      .exec(second.query)?.[1]
      ?.split(/[\s,]+/)
      .filter(Boolean);
    expect(types?.sort()).toEqual(
      [
        'CHAT',
        'DISCORD_MESSAGE',
        'EMAIL',
        'MS_TEAMS_MESSAGE',
        'NOTE',
        'SLACK_MESSAGE',
        'SLACK_REPLY',
      ].sort(),
    );
  });

  it('convertit un fil en élément : un tour par message, dans l’ordre, chacun à sa date', async () => {
    const [first] = await sync(fullRound()).pages;

    expect(first?.items[0]).toEqual({
      externalId: `thread:${T101}`,
      nature: 'fil',
      title: 'T-101 Impossible de se connecter à l’espace Acme',
      url: null,
      updatedAt: '2026-10-14T16:20:00.000Z',
      origin: { client: 'Marie Durand' },
      turns: [
        {
          externalId: 'entry:te_01J9Z8M1A1B2C3D4E5F6G7H8J1',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          side: 'external',
          text: 'Bonjour,\n\nDepuis hier soir je n’arrive plus à me connecter à l’espace Acme : le mot de passe est refusé.\n\nMarie Durand',
          ts: '2026-10-13T08:15:00.000Z',
        },
        {
          externalId: 'entry:te_01J9Z8M1A1B2C3D4E5F6G7H8J2',
          role: 'participant',
          author: { name: 'David Martin', email: 'david@acme.test' },
          side: 'team',
          text: 'Compte verrouillé après cinq essais. Je le débloque et je lui propose l’authentification en deux étapes.',
          ts: '2026-10-13T09:00:00.000Z',
        },
        {
          externalId: 'entry:te_01J9Z8M1A1B2C3D4E5F6G7H8J3',
          role: 'participant',
          author: { name: 'David Martin', email: 'david@acme.test' },
          side: 'team',
          text: 'Bonjour Marie,\n\nVotre compte est débloqué. À partir du 1er novembre, l’authentification en deux étapes sera obligatoire pour tous les comptes Acme.\n\nDavid',
          ts: '2026-10-14T16:20:00.000Z',
        },
      ],
    } satisfies ConnectorItem);
  });

  it('rend les messages de tous les types, saute les messages vides et rend un auteur nul sans compte', async () => {
    const [first] = await sync(fullRound()).pages;
    const item = first?.items[1];

    expect(item?.title).toBe('T-102 Facture d’octobre en double');
    // Le message « note » fait d’espaces est sauté.
    expect(item?.turns.map((turn) => [turn.author.name, turn.author.email, turn.text])).toEqual([
      [
        'Paul Bernard',
        'paul@client.test',
        'Bonjour, ma facture d’octobre apparaît deux fois (500 euros au lieu de 250).',
      ],
      [
        'Assistant facturation',
        null,
        'Doublon confirmé dans Stripe : un remboursement de 250 euros est lancé.',
      ],
      [null, null, 'Merci, j’ai bien reçu le remboursement.'],
    ]);
    expect(item?.turns.every((turn) => turn.role === 'participant')).toBe(true);
    // Le côté vient du type d'acteur : le client est extérieur, un utilisateur machine n'a pas de côté.
    expect(item?.turns.map((turn) => turn.side)).toEqual(['external', undefined, undefined]);
  });

  it('remet les messages dans l’ordre chronologique si l’outil les rend à l’envers', async () => {
    const reversed = structuredClone(timelineT102);
    reversed.data.thread.timelineEntries.edges.reverse();

    const [first] = await sync([
      api({ json: threadsPage1 }),
      api({ json: timelineT101Page1 }),
      api({ json: timelineT101Page2 }),
      api({ json: reversed }),
      api({ json: threadsEmpty }),
    ]).pages;

    const dates = first?.items[1]?.turns.map((turn) => turn.ts) ?? [];
    expect(dates).toEqual([...dates].sort());
    expect(dates).toHaveLength(3);
  });

  it('ne rend pas un fil sans message, mais la page avance quand même', async () => {
    const pages = await sync(fullRound()).pages;

    // T-103 n'a aucun message : la seconde page est vide.
    expect(pages[1]?.items).toEqual([]);
    expect(cursorOf(pages[1]).after).toBeNull();
  });

  it('ne rend pas un fil que l’outil ne trouve plus au moment de lire sa chronologie', async () => {
    const [page] = await sync([
      api({ json: threadsPage1 }),
      api({ json: { data: { thread: null } } }),
      api({ json: timelineT102 }),
      api({ json: threadsEmpty }),
    ]).pages;

    expect(page?.items.map((item) => item.externalId)).toEqual([`thread:${T102}`]);
  });

  it('rend des éléments que le socle accepte (dates ISO avec fuseau)', async () => {
    const pages = await sync(fullRound()).pages;
    const items = pages.flatMap((page) => page.items);

    expect(items).toHaveLength(2);
    for (const item of items) expect(normalizeItem(item, 'plain')).not.toBeNull();
  });
});

describe('plainConnector : pagination et curseur', () => {
  it('rend une page par page de fils, avec le curseur de reprise', async () => {
    const pages = await sync(fullRound()).pages;

    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.items.length)).toEqual([2, 0]);
    // Au milieu du passage : la position dans la liste, la date de départ du passage.
    expect(cursorOf(pages[0])).toEqual({
      from: SINCE.toISOString(),
      started: NOW,
      after: LIST_CURSOR,
    });
    // Fin du passage : le suivant repartira du début de celui-ci, moins la marge.
    expect(cursorOf(pages[1])).toEqual({ from: END_FROM, started: null, after: null });
  });

  it('suit les pages de la chronologie d’un fil', async () => {
    const { pages, calls } = sync(fullRound());
    const [first] = await pages;

    expect(bodyOf(calls[2]).variables).toEqual({
      threadId: T101,
      first: 50,
      after: ENTRIES_CURSOR,
    });
    expect(first?.items[0]?.turns).toHaveLength(3);
  });

  it('passe le curseur de l’outil à la seconde liste, avec le même filtre', async () => {
    const { pages, calls } = sync(fullRound());
    await pages;

    expect(bodyOf(calls[4]).variables).toEqual({
      filters: { updatedAt: { after: SINCE_FILTER } },
      first: 25,
      after: LIST_CURSOR,
    });
    expect(bodyOf(calls[5]).variables.threadId).toBe(T103);
  });

  it('repasse le dernier curseur : nouveau passage depuis la date de départ, sans refaire since', async () => {
    const last = JSON.stringify({ from: END_FROM, started: null, after: null });
    vi.setSystemTime(new Date('2026-10-15T10:15:00.000Z'));

    const { pages, calls } = sync([api({ json: threadsEmpty })], last);
    const result = await pages;

    expect(bodyOf(calls[0]).variables).toEqual({
      filters: { updatedAt: { after: '2026-10-15T09:55:00Z' } },
      first: 25,
      after: null,
    });
    expect(result).toHaveLength(1);
    expect(cursorOf(result[0])).toEqual({
      from: '2026-10-15T10:10:00.000Z',
      started: null,
      after: null,
    });
  });

  it('reprend au milieu d’un passage sans changer le filtre ni la date de départ', async () => {
    const middle = JSON.stringify({ from: SINCE.toISOString(), started: NOW, after: LIST_CURSOR });
    vi.setSystemTime(new Date('2026-10-15T10:20:00.000Z'));

    const { pages, calls } = sync(
      [api({ json: threadsPage2 }), api({ json: timelineT103Empty })],
      middle,
    );
    const result = await pages;

    expect(bodyOf(calls[0]).variables).toEqual({
      filters: { updatedAt: { after: SINCE_FILTER } },
      first: 25,
      after: LIST_CURSOR,
    });
    // La fin du passage se calcule sur le début du passage, pas sur l'heure de la reprise.
    expect(cursorOf(result.at(-1))).toEqual({ from: END_FROM, started: null, after: null });
  });

  it('repart de since quand le curseur est illisible', async () => {
    for (const cursor of ['pas du json', '{"from":"hier"}', '[]']) {
      const { pages, calls } = sync([api({ json: threadsEmpty })], cursor);
      await pages;

      expect(bodyOf(calls[0]).variables).toEqual({
        filters: { updatedAt: { after: SINCE_FILTER } },
        first: 25,
        after: null,
      });
    }
  });

  it('ne rend rien quand rien n’a changé, mais garde la nouvelle date de départ', async () => {
    const result = await sync([api({ json: threadsEmpty })]).pages;

    expect(result).toHaveLength(1);
    expect(result[0]?.items).toEqual([]);
    expect(cursorOf(result[0])).toEqual({ from: END_FROM, started: null, after: null });
  });

  it('termine le passage si l’outil rend toujours le même curseur de liste', async () => {
    const stuck = JSON.stringify({ from: SINCE.toISOString(), started: NOW, after: LIST_CURSOR });
    const again = { data: { threads: { ...threadsPage1.data.threads, edges: [] } } };

    // Une seule route : toute autre requête recevrait un 599 et ferait échouer le test.
    const result = await sync([api({ json: again })], stuck).pages;

    expect(result).toHaveLength(1);
    expect(cursorOf(result[0]).started).toBeNull();
  });

  it('termine la chronologie d’un fil si l’outil rend toujours le même curseur', async () => {
    const single = {
      data: {
        threads: {
          ...threadsPage2.data.threads,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    };
    const stuck = {
      data: {
        thread: {
          timelineEntries: {
            ...timelineT101Page1.data.thread.timelineEntries,
            pageInfo: { hasNextPage: true, endCursor: ENTRIES_CURSOR },
          },
        },
      },
    };

    const { pages, calls } = sync([
      api({ json: single }),
      api({ json: stuck }),
      api({ json: stuck }),
    ]);
    await pages;

    // La liste, puis la chronologie deux fois (la seconde répète le curseur) : pas de troisième.
    expect(calls).toHaveLength(3);
  });
});

describe('plainConnector : erreurs', () => {
  it('remonte une clé refusée sur la liste des fils', async () => {
    const { pages } = sync([api({ status: 401, json: {} })]);

    await expect(pages).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  // Écart à la recette : la chronologie est le contenu d'un fil, pas une ressource secondaire. Un
  // droit manquant dessus remonte, pour que la connexion le dise au lieu de ne rien lire en silence.
  it('remonte un droit manquant sur la chronologie, sans taire les fils', async () => {
    const { pages } = sync([api({ json: threadsPage1 }), api({ json: errorForbidden })]);

    const error = await pages.catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorAuthError);
    expect((error as ConnectorAuthError).status).toBe(403);
  });

  it('remonte une clé refusée au milieu du passage, après avoir livré la première page', async () => {
    const { http } = testHttp(plainConnector, CONFIG, [
      api({ json: threadsPage1 }),
      api({ json: timelineT101Page1 }),
      api({ json: timelineT101Page2 }),
      api({ json: timelineT102 }),
      api({ status: 401, json: {} }),
    ]);
    const delivered: SyncPage[] = [];
    let failure: unknown;

    try {
      for await (const page of plainConnector.sync(CONFIG, { cursor: null, since: SINCE }, http)) {
        delivered.push(page);
      }
    } catch (error) {
      failure = error;
    }

    expect(delivered).toHaveLength(1);
    expect(cursorOf(delivered[0]).after).toBe(LIST_CURSOR);
    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });

  it('convertit RATE_LIMITED en limite atteinte, sans le texte de l’outil', async () => {
    const { pages } = sync([api({ json: errorRateLimited })]);

    const error = await pages.catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect((error as ConnectorHttpError).status).toBe(429);
    expect((error as Error).message).toBe('Plain rate limit reached');
  });

  it('reprend après un 429 puis réussit', async () => {
    const { pages, calls } = sync([
      api({ status: 429, headers: { 'retry-after': '1' }, json: errorRateLimited }),
      api({ json: threadsEmpty }),
    ]);

    await expect(pages).resolves.toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it('convertit toute autre erreur en message fixe, sans le texte de l’outil ni la clé', async () => {
    for (const [json, message] of [
      [errorInternal, 'Plain responded with 500'],
      [errorValidation, 'Plain rejected the request'],
    ] as const) {
      const { pages } = sync([api({ json })]);

      const error = await pages.catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConnectorHttpError);
      expect((error as Error).message).toBe(message);
      expect((error as Error).message).not.toContain('texte-de-l-outil');
      expect((error as Error).message).not.toContain(KEY);
    }
  });

  it('refuse une réponse sans données ni erreurs', async () => {
    const { pages } = sync([api({ json: {} })]);

    await expect(pages).rejects.toMatchObject({ message: 'Unexpected response' });
  });

  it('refuse une réponse dont les données n’ont pas la forme attendue', async () => {
    const { pages } = sync([api({ json: { data: { threads: { edges: 'rien' } } } })]);

    await expect(pages).rejects.toMatchObject({ message: 'Unexpected response' });
  });
});

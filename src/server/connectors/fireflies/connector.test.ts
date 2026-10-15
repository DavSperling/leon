import { describe, expect, it } from 'vitest';
import { collect, type FakeCall, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import { firefliesConnector } from './connector';
import errors from './fixtures/errors.json';
import transcript1001 from './fixtures/transcript-1001.json';
import transcript1002 from './fixtures/transcript-1002.json';
import transcript1003 from './fixtures/transcript-1003.json';
import transcriptsList from './fixtures/transcripts-list.json';
import user from './fixtures/user.json';

const API = 'https://api.fireflies.ai/graphql';
const KEY = 'cle-de-test-0123456789';
const config = { apiKey: KEY };
const SINCE = new Date('2026-09-15T00:00:00Z');
const DAY_MS = 24 * 3_600_000;

// Toutes les requêtes vont à la même adresse : les routes se servent dans l'ordre des appels.
const gql = (json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  method: 'POST',
  url: API,
  json,
  ...extra,
});

const bodyOf = (call: FakeCall | undefined) =>
  (call?.body ?? {}) as { query?: string; variables?: Record<string, unknown> };
const variables = (call: FakeCall | undefined) => bodyOf(call).variables;

const listOf = (rows: Array<{ id: string; date: string }>) => ({
  data: { transcripts: rows.map((row) => ({ id: row.id, date: Date.parse(row.date) })) },
});

// La fiche d'exemple de la doc, avec des champs remplacés.
const detail = (overrides: Record<string, unknown> = {}) => ({
  data: { transcript: { ...transcript1001.data.transcript, ...overrides } },
});

// Un premier passage sur les trois réunions d'exemple.
function firstPassRoutes(): FakeRoute[] {
  return [gql(transcriptsList), gql(transcript1001), gql(transcript1002), gql(transcript1003)];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(firefliesConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(firefliesConnector.sync(config, state, http));
  return { pages, calls };
}

const cursorOf = (cursor: string) => JSON.parse(cursor) as { after: string; seen: string[] };
const cursorAt = (after: string, seen: string[]) => JSON.stringify({ after, seen });

describe('verify', () => {
  it('lit le compte de la clé avec Authorization: Bearer', async () => {
    const { http, calls } = testHttp(firefliesConnector, config, [gql(user)]);

    const result = await firefliesConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (marie@acme.test)' });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(API);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(bodyOf(calls[0]).query).toContain('user');
  });

  it('lève ConnectorAuthError sur un 401', async () => {
    const { http } = testHttp(firefliesConnector, config, [gql({}, { status: 401 })]);

    await expect(firefliesConnector.verify(config, http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('lève ConnectorAuthError sur auth_failed rendu avec un code 200, sans reprendre son texte', async () => {
    const { http } = testHttp(firefliesConnector, config, [gql(errors.auth_failed)]);

    const failure = await firefliesConnector.verify(config, http).catch((error) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
    expect(failure.message).not.toContain('secret-xyz');
  });
});

describe('sync : premier passage', () => {
  it('demande les réunions depuis since, puis chaque fiche dans l’ordre chronologique', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(variables(calls[0])).toEqual({ fromDate: SINCE.toISOString(), limit: 50, skip: 0 });
    // La liste de la doc arrive du plus récent au plus ancien : on trie nous-mêmes.
    expect(calls.slice(1).map((call) => variables(call)?.id)).toEqual([
      'ff-1001',
      'ff-1002',
      'ff-1003',
    ]);
    expect(calls[1]?.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it('rend la réunion avec ses prises de parole regroupées par locuteur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(1);
    const meeting = pages[0]?.items[0];
    expect(meeting).toMatchObject({
      externalId: 'transcript:ff-1001',
      nature: 'reunion',
      title: 'Point hebdo produit',
      url: 'https://app.fireflies.ai/view/ff-1001',
      updatedAt: '2026-10-14T09:00:00.000Z',
      origin: { participants: 'Marie Durand, Paul Martin' },
    });
    expect(meeting?.turns).toEqual([
      {
        externalId: 'utterance:0',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Bonjour à tous.\nOn décale le lancement au 3 novembre.',
        ts: '2026-10-14T09:00:00.500Z',
      },
      {
        externalId: 'utterance:2',
        role: 'participant',
        author: { name: 'Paul Martin', email: 'paul@acme.test' },
        text: "D'accord, je prépare la démo.",
        ts: '2026-10-14T09:00:41.250Z',
      },
      {
        externalId: 'utterance:3',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Merci Paul.',
        ts: '2026-10-14T09:01:03.500Z',
      },
    ]);
  });

  it('rend le résumé en tour document quand il n’y a pas de transcription', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const call = pages[0]?.items[1];
    expect(call).toMatchObject({
      externalId: 'transcript:ff-1002',
      updatedAt: '2026-10-14T14:00:00.000Z',
      origin: { participants: 'Paul Martin, client@exemple.test' },
    });
    expect(call?.turns).toEqual([
      {
        externalId: 'summary',
        role: 'document',
        author: { name: null, email: 'paul@acme.test' },
        text: 'Le client valide le devis de novembre.\n\nActions à mener :\nEnvoyer le contrat avant vendredi.',
        ts: '2026-10-14T14:00:00.000Z',
      },
    ]);
  });

  it('garde un curseur qui retient les réunions rendues, pas celle en cours de traitement', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[0]?.items.map((item) => item.externalId)).toEqual([
      'transcript:ff-1001',
      'transcript:ff-1002',
    ]);
    expect(cursorOf(pages[0]?.cursor ?? '')).toEqual({
      after: '2026-10-14T14:00:00.000Z',
      seen: ['ff-1001', 'ff-1002'],
    });
  });

  it('chaque date rendue passe la normalisation du socle', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of pages[0]?.items ?? []) {
      expect(normalizeItem(item, 'fireflies')).not.toBeNull();
    }
  });

  it('convertit la date en millisecondes de la doc en instant UTC', async () => {
    const { pages } = await runSync(
      [gql(listOf([{ id: 'ff-9', date: '2024-04-22T20:14:04.454Z' }])), gql(detail())],
      { since: new Date('2024-01-01T00:00:00Z') },
    );

    expect(Date.parse('2024-04-22T20:14:04.454Z')).toBe(1713816844454);
    expect(pages[0]?.items[0]?.updatedAt).toBe('2024-04-22T20:14:04.454Z');
  });

  it('place une prise de parole illisible au début de la réunion', async () => {
    const sentence = (start_time: unknown) => ({
      index: 0,
      speaker_name: 'Marie Durand',
      text: 'Bonjour',
      start_time,
    });
    for (const start of ['abc', -5, 1e12, null]) {
      const { pages } = await runSync([
        gql(listOf([{ id: 'ff-9', date: '2026-10-14T09:00:00.000Z' }])),
        gql(detail({ sentences: [sentence(start)] })),
      ]);

      expect(pages[0]?.items[0]?.turns[0]?.ts, String(start)).toBe('2026-10-14T09:00:00.000Z');
    }
  });

  it('rend une réunion sans texte avec zéro tour, et la retient', async () => {
    const empty = detail({
      sentences: [],
      summary: null,
      meeting_info: { summary_status: 'skipped' },
    });
    const { pages } = await runSync([
      gql(listOf([{ id: 'ff-9', date: '2026-10-14T09:00:00.000Z' }])),
      gql(empty),
    ]);

    expect(pages[0]?.items[0]?.turns).toEqual([]);
    expect(normalizeItem(pages[0]?.items[0] as never, 'fireflies')).toBeNull();
    expect(cursorOf(pages[0]?.cursor ?? '').seen).toEqual(['ff-9']);
  });
});

describe('sync : pages et reprise', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({
    id: `ff-2${String(i).padStart(3, '0')}`,
    date: new Date(Date.parse('2026-10-14T06:00:00Z') + i * 3_600_000).toISOString(),
  }));

  it('rend les fiches par dix, puis une page de reste', async () => {
    const routes = [gql(listOf([...twelve].reverse())), ...twelve.map(() => gql(detail()))];

    const { pages, calls } = await runSync(routes);

    expect(pages.map((page) => page.items.length)).toEqual([10, 2]);
    expect(calls.slice(1).map((call) => variables(call)?.id)).toEqual(twelve.map((r) => r.id));
    expect(cursorOf(pages[0]?.cursor ?? '').after).toBe(twelve[9]?.date);
    expect(cursorOf(pages[1]?.cursor ?? '')).toEqual({
      after: twelve[11]?.date,
      seen: twelve.map((r) => r.id),
    });
  });

  it('repris avec le dernier curseur, ne refait pas les fiches déjà rendues', async () => {
    const last = cursorAt(
      twelve[11]?.date ?? '',
      twelve.map((r) => r.id),
    );

    const { pages, calls } = await runSync([gql(listOf([...twelve].reverse()))], { cursor: last });

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(variables(calls[0])?.fromDate).toBe(
      new Date(Date.parse(twelve[11]?.date ?? '') - DAY_MS).toISOString(),
    );
  });

  it('reprend une réunion arrivée en retard, plus ancienne que le curseur', async () => {
    const cursor = cursorAt('2026-10-14T14:00:00.000Z', ['ff-1001', 'ff-1002']);
    const late = { id: 'ff-0999', date: '2026-10-14T11:00:00.000Z' };
    const list = listOf([
      { id: 'ff-1002', date: '2026-10-14T14:00:00.000Z' },
      late,
      { id: 'ff-1001', date: '2026-10-14T09:00:00.000Z' },
    ]);

    const { pages, calls } = await runSync([gql(list), gql(detail())], { cursor });

    expect(calls.map((call) => variables(call)?.id)).toEqual([undefined, 'ff-0999']);
    expect(cursorOf(pages[0]?.cursor ?? '')).toEqual({
      after: '2026-10-14T14:00:00.000Z',
      seen: ['ff-1001', 'ff-1002', 'ff-0999'],
    });
  });

  it('reprend au passage suivant une réunion qui était en cours de traitement', async () => {
    const first = await runSync(firstPassRoutes());
    const cursor = first.pages[0]?.cursor ?? '';
    const ready = detail({ title: 'Revue de sprint' });

    const { pages, calls } = await runSync([gql(transcriptsList), gql(ready)], { cursor });

    expect(calls.map((call) => variables(call)?.id)).toEqual([undefined, 'ff-1003']);
    expect(pages[0]?.items.map((item) => item.externalId)).toEqual(['transcript:ff-1003']);
    expect(cursorOf(pages[0]?.cursor ?? '').after).toBe('2026-10-15T08:00:00.000Z');
  });

  it('ne remonte pas avant since', async () => {
    const cursor = cursorAt('2026-09-15T05:00:00.000Z', []);

    const { calls } = await runSync([gql(listOf([]))], { cursor });

    expect(variables(calls[0])?.fromDate).toBe(SINCE.toISOString());
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync([gql(listOf([]))], { cursor: 'pas du json' });

    expect(variables(calls[0])?.fromDate).toBe(SINCE.toISOString());
  });
});

describe('sync : la liste des réunions', () => {
  const fifty = Array.from({ length: 50 }, (_, i) => ({
    id: `ff-3${String(i + 1).padStart(3, '0')}`,
    date: new Date(Date.parse('2026-10-01T06:00:00Z') + i * 3_600_000).toISOString(),
  }));
  const tail = [
    { id: 'ff-3051', date: '2026-10-03T08:00:00.000Z' },
    { id: 'ff-3052', date: '2026-10-03T09:00:00.000Z' },
  ];

  it('lit la liste page après page avec skip, et prend les plus anciennes d’abord', async () => {
    const routes = [
      gql(listOf([...fifty].reverse())),
      gql(listOf(tail)),
      ...Array.from({ length: 10 }, () => gql(detail())),
    ];
    const { http, calls } = testHttp(firefliesConnector, config, routes);

    const first = await firefliesConnector
      .sync(config, { cursor: null, since: SINCE }, http)
      [Symbol.asyncIterator]()
      .next();

    expect(calls.slice(0, 2).map((call) => variables(call)?.skip)).toEqual([0, 50]);
    expect(first.value?.items).toHaveLength(10);
    expect(calls.slice(2).map((call) => variables(call)?.id)).toEqual(
      fifty.slice(0, 10).map((row) => row.id),
    );
  });

  it('s’arrête quand une page n’apporte aucune nouvelle réunion', async () => {
    const routes = [
      gql(listOf(fifty)),
      gql(listOf(fifty)),
      ...Array.from({ length: 10 }, () => gql(detail())),
    ];
    const { http, calls } = testHttp(firefliesConnector, config, routes);

    await firefliesConnector
      .sync(config, { cursor: null, since: SINCE }, http)
      [Symbol.asyncIterator]()
      .next();

    expect(calls.filter((call) => variables(call)?.skip !== undefined)).toHaveLength(2);
  });

  it('lève ConnectorAuthError sur un 401 de la liste', async () => {
    await expect(runSync([gql({}, { status: 401 })])).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('convertit une limite de requêtes rendue avec un code 200, sans reprendre son texte', async () => {
    const failure = await runSync([gql(errors.too_many_requests)]).catch((error) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect(failure.status).toBe(429);
    expect(failure.message).toBe('Limite de requêtes de Fireflies atteinte');
  });

  it('convertit toute autre erreur en refus de Fireflies, sans reprendre son texte', async () => {
    const failure = await runSync([gql(errors.invalid_arguments)]).catch((error) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect(failure.message).toBe('Fireflies a refusé la requête');
    expect(failure.message).not.toContain('secret-xyz');
  });
});

describe('sync : une fiche qui ne répond pas', () => {
  const list = listOf([
    { id: 'ff-1001', date: '2026-10-14T09:00:00.000Z' },
    { id: 'ff-1002', date: '2026-10-14T10:00:00.000Z' },
    { id: 'ff-1004', date: '2026-10-14T11:00:00.000Z' },
    { id: 'ff-1005', date: '2026-10-14T12:00:00.000Z' },
  ]);

  it('passe une fiche interdite (403) ou disparue, et rend les autres', async () => {
    const { pages } = await runSync([
      gql(list),
      gql(transcript1001),
      gql({}, { status: 403 }),
      gql(errors.object_not_found),
      gql(detail({ title: 'Dernière' })),
    ]);

    expect(pages[0]?.items.map((item) => item.title)).toEqual(['Point hebdo produit', 'Dernière']);
    expect(cursorOf(pages[0]?.cursor ?? '').seen).toEqual([
      'ff-1001',
      'ff-1002',
      'ff-1004',
      'ff-1005',
    ]);
  });

  it('remonte un 401 sur une fiche : la clé est refusée', async () => {
    const routes = [gql(list), gql(transcript1001), gql({}, { status: 401 })];

    await expect(runSync(routes)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('configuration et catalogue', () => {
  it('refuse une configuration sans clé', () => {
    const schema = firefliesConnector.configSchema;

    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ apiKey: '' }).success).toBe(false);
    expect(schema.safeParse({ apiKey: '   ' }).success).toBe(false);
    expect(schema.parse({ apiKey: ` ${KEY} ` })).toEqual({ apiKey: KEY });
  });

  it('déclare un seul hôte exact, une clé secrète et un rythme sous la limite de 60 par minute', () => {
    expect(firefliesConnector.hosts(config)).toEqual(['api.fireflies.ai']);
    expect(firefliesConnector.secretFields).toEqual(['apiKey']);
    expect(firefliesConnector.minIntervalMs).toBe(1000);
  });

  it('est enregistré et disponible dans le catalogue', () => {
    expect(getConnector('fireflies')).toBe(firefliesConnector);
    expect(listCatalog().find((item) => item.id === 'fireflies')?.available).toBe(true);
  });
});

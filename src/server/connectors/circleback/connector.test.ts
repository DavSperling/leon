import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError } from '../http';
import { normalizeItem } from '../normalize';
import type { ConnectorItem, SyncPage } from '../types';
import { circlebackConnector as connector } from './connector';
import meetingsPage1 from './fixtures/meetings-page-1.json';
import meetingsPage2 from './fixtures/meetings-page-2.json';
import people from './fixtures/people.json';
import transcriptProduct from './fixtures/transcript-point-produit.json';
import transcriptBudget from './fixtures/transcript-revue-budget.json';

const BASE = 'https://circleback.ai/api';
const config = { apiKey: 'cb_test_secret_123' };
const SINCE = new Date('2026-10-01T00:00:00.000Z');

const ID_PRODUCT = 'rN4kQ8xT2vLpB7mZc1HsA'; // transcription, modifiée le 14/10
const ID_CLIENT = 'Gd7eW3sUq9YfK2nVx5JtR'; // pas de transcription, résumé seulement
const ID_EMPTY = 'Hx6tN0wEq1LaV8yKd4RbJ'; // ni résumé ni transcription
const ID_BUDGET = 'Pm8cH1zXa4TbE6oLy0UwQ'; // transcription, un locuteur sans nom
const ID_OLD = 'Zk2vB5nJr7SdC9pGf3MhX'; // plus ancienne que « since »

const listPage1: FakeRoute = {
  url: `${BASE}/meetings`,
  json: meetingsPage1,
  headers: { link: `<${BASE}/meetings?cursor=page2>; rel="next"` },
};
const listPage2: FakeRoute = { url: `${BASE}/meetings?cursor=page2`, json: meetingsPage2 };
const transcript = (id: string, json: unknown, status = 200): FakeRoute => ({
  url: `${BASE}/meeting/${id}/transcript`,
  json,
  status,
});

// Les trois pages de l'exemple, puis les transcriptions dans l'ordre de modification croissant.
function fixtureRoutes(): FakeRoute[] {
  return [
    listPage1,
    listPage2,
    transcript(ID_BUDGET, transcriptBudget),
    transcript(ID_EMPTY, []),
    transcript(ID_CLIENT, []),
    transcript(ID_PRODUCT, transcriptProduct),
  ];
}

async function runSync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(connector, config, routes);
  const pages = await collect(connector.sync(config, { cursor, since: SINCE }, http));
  return { pages, items: pages.flatMap((page) => page.items), calls };
}

const byId = (items: ConnectorItem[], id: string) =>
  items.find((item) => item.externalId === `meeting:${id}`);

describe('configSchema et hôtes', () => {
  it('refuse une config incomplète ou une clé mal formée', () => {
    const schema = connector.configSchema;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ apiKey: '' }).success).toBe(false);
    expect(schema.safeParse({ apiKey: 'Bearer cb_abc' }).success).toBe(false);
    expect(schema.safeParse({ apiKey: 'abc123' }).success).toBe(false);
    expect(schema.safeParse({ apiKey: 'cb_abc\nsuite' }).success).toBe(false);
  });

  it('accepte une clé cb_ et retire les espaces autour', () => {
    expect(connector.configSchema.parse({ apiKey: '  cb_abc123 ' })).toEqual({
      apiKey: 'cb_abc123',
    });
  });

  it('déclare l’hôte exact et la clé comme seul secret', () => {
    expect(connector.hosts(config)).toEqual(['circleback.ai']);
    expect(connector.secretFields).toEqual(['apiKey']);
    expect(connector.id).toBe('circleback');
  });
});

describe('verify', () => {
  it('appelle un point d’accès léger avec la clé en Bearer et rend un compte lisible', async () => {
    const { http, calls } = testHttp(connector, config, [{ url: `${BASE}/people`, json: people }]);
    const result = await connector.verify(config, http);
    expect(result.account.trim()).not.toBe('');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/people?limit=1`);
    expect(calls[0]?.headers.authorization).toBe('Bearer cb_test_secret_123');
  });

  it('lève ConnectorAuthError sur une réponse 401', async () => {
    const { http } = testHttp(connector, config, [
      { url: `${BASE}/people`, status: 401, json: { error: 'Unauthorized' } },
    ]);
    await expect(connector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('sync : premier passage', () => {
  it('lit les réunions de l’utilisateur avec la clé, sans filtre de date (l’API n’en a pas)', async () => {
    const { calls } = await runSync(fixtureRoutes());
    expect(calls[0]?.url).toBe(`${BASE}/meetings?ownership=Mine`);
    expect(calls[0]?.headers.authorization).toBe('Bearer cb_test_secret_123');
    expect(calls[1]?.url).toBe(`${BASE}/meetings?cursor=page2`);
    expect(calls[1]?.headers.authorization).toBe('Bearer cb_test_secret_123');
    for (const call of calls.slice(0, 2)) expect(call.url).not.toMatch(/since|updated|date/i);
  });

  it('écarte ce qui est modifié avant « since » et ne lit pas sa transcription', async () => {
    const { items, calls } = await runSync(fixtureRoutes());
    expect(byId(items, ID_OLD)).toBeUndefined();
    expect(calls.map((call) => call.url).join()).not.toContain(ID_OLD);
  });

  it('rend les réunions dans l’ordre de modification croissant, toutes pages confondues', async () => {
    const { pages, items } = await runSync(fixtureRoutes());
    expect(items.map((item) => item.externalId)).toEqual([
      `meeting:${ID_BUDGET}`,
      `meeting:${ID_CLIENT}`,
      `meeting:${ID_PRODUCT}`,
    ]);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.cursor).toBe('2026-10-14T10:05:30.120Z');
  });

  it('lit la transcription de chaque réunion retenue, au bon chemin', async () => {
    const { calls } = await runSync(fixtureRoutes());
    expect(calls.slice(2).map((call) => call.url)).toEqual([
      `${BASE}/meeting/${ID_BUDGET}/transcript`,
      `${BASE}/meeting/${ID_EMPTY}/transcript`,
      `${BASE}/meeting/${ID_CLIENT}/transcript`,
      `${BASE}/meeting/${ID_PRODUCT}/transcript`,
    ]);
  });

  it('range une réunion avec transcription en tours de locuteurs regroupés et datés', async () => {
    const { items } = await runSync(fixtureRoutes());
    const meeting = byId(items, ID_PRODUCT);
    expect(meeting).toMatchObject({
      nature: 'reunion',
      title: 'Point produit Acme',
      url: `https://circleback.ai/meetings/${ID_PRODUCT}`,
      updatedAt: '2026-10-14T10:05:30.120Z',
      origin: { participants: 'Marie Durand, Paul Martin' },
    });
    expect(meeting?.turns).toEqual([
      {
        externalId: 'utterance:0',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Bonjour Paul, on commence par la feuille de route ?\nJe propose de livrer l’export CSV avant la fin du mois.',
        ts: '2026-10-14T09:00:04.560Z',
      },
      {
        externalId: 'utterance:2',
        role: 'participant',
        author: { name: 'Paul Martin', email: 'paul@acme.test' },
        text: 'D’accord, je m’engage à préparer la maquette d’ici jeudi.',
        ts: '2026-10-14T09:00:18.320Z',
      },
      {
        externalId: 'utterance:3',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Parfait, on se revoit vendredi.',
        ts: '2026-10-14T09:00:31.000Z',
      },
    ]);
  });

  it('ne met aucun tour document quand il y a une transcription, ni les notes privées', async () => {
    const { items } = await runSync(fixtureRoutes());
    const meeting = byId(items, ID_PRODUCT);
    expect(meeting?.turns.every((turn) => turn.role === 'participant')).toBe(true);
    const text = JSON.stringify(items);
    expect(text).not.toContain('Rappel perso');
    expect(text).not.toContain('cb_test_secret_123');
  });

  it('garde un locuteur sans nom et un nom absent des invités, sans inventer d’adresse', async () => {
    const { items } = await runSync(fixtureRoutes());
    const meeting = byId(items, ID_BUDGET);
    expect(meeting?.origin).toEqual({ participants: 'sophie@acme.test, Marie Durand' });
    expect(meeting?.turns.map((turn) => turn.author)).toEqual([
      { name: null, email: null },
      { name: 'Sophie Bernard', email: null },
      { name: 'Marie Durand', email: 'marie@acme.test' },
    ]);
  });

  it('sans transcription, rend le résumé en un tour document daté de la modification', async () => {
    const { items } = await runSync(fixtureRoutes());
    const meeting = byId(items, ID_CLIENT);
    expect(meeting?.turns).toEqual([
      {
        externalId: 'notes',
        role: 'document',
        author: { name: null, email: null },
        text: '#### Résumé\n- Initech veut un devis pour 40 postes avant le 30 octobre.',
        ts: '2026-10-13T15:02:11.450Z',
      },
    ]);
  });

  it('ne rend pas une réunion sans texte (ni transcription ni résumé)', async () => {
    const { items } = await runSync(fixtureRoutes());
    expect(byId(items, ID_EMPTY)).toBeUndefined();
  });

  it('rend des éléments que le socle accepte, avec des dates exactes', async () => {
    const { items } = await runSync(fixtureRoutes());
    expect(items).toHaveLength(3);
    for (const item of items) expect(normalizeItem(item, 'circleback')).not.toBeNull();
    const normalized = normalizeItem(byId(items, ID_PRODUCT) as ConnectorItem, 'circleback');
    expect(normalized?.turns[0]?.ts.toISOString()).toBe('2026-10-14T09:00:04.560Z');
  });

  it('convertit une date avec décalage horaire en instant exact', async () => {
    const meeting = {
      ...meetingsPage1[0],
      createdAt: '2026-10-14T11:00:00.000+02:00',
      updatedAt: '2026-10-14T12:05:00.000+02:00',
    };
    const { items } = await runSync([
      { url: `${BASE}/meetings`, json: [meeting] },
      transcript(ID_PRODUCT, [{ speaker: 'Paul Martin', text: 'Bonjour', timestamp: 60 }]),
    ]);
    expect(items[0]?.updatedAt).toBe('2026-10-14T12:05:00.000+02:00');
    expect(items[0]?.turns[0]?.ts).toBe('2026-10-14T09:01:00.000Z');
  });
});

describe('sync : ressource secondaire et erreurs', () => {
  it.each([403, 404])('un %s sur la transcription laisse le résumé seul', async (status) => {
    const { items } = await runSync([
      { url: `${BASE}/meetings`, json: [meetingsPage1[0]] },
      transcript(ID_PRODUCT, { error: 'refusé' }, status),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.turns.map((turn) => turn.role)).toEqual(['document']);
  });

  it('remonte un 401 sur la transcription comme une clé refusée', async () => {
    await expect(
      runSync([
        { url: `${BASE}/meetings`, json: [meetingsPage1[0]] },
        transcript(ID_PRODUCT, { error: 'Unauthorized' }, 401),
      ]),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un 401 sur la liste des réunions', async () => {
    await expect(
      runSync([{ url: `${BASE}/meetings`, status: 401, json: { error: 'Unauthorized' } }]),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

// 120 réunions modifiées à une seconde d'écart, dans une seule page de la liste.
function manyMeetings(count: number, sameInstantAt: number[] = []) {
  return Array.from({ length: count }, (_, index) => {
    const second = sameInstantAt.includes(index) ? sameInstantAt[0] : index;
    const stamp = new Date(Date.UTC(2026, 9, 2, 0, 0, second ?? index)).toISOString();
    return {
      ...meetingsPage1[1],
      id: `m${String(index).padStart(3, '0')}`,
      name: `Réunion ${index}`,
      createdAt: stamp,
      updatedAt: stamp,
      attendees: [],
    };
  });
}
const oneSegment = (): FakeRoute => ({
  url: /\/transcript$/,
  json: [{ speaker: 'Marie Durand', text: 'Bonjour', timestamp: 1 }],
});
const manyRoutes = (meetings: unknown[], transcripts: number): FakeRoute[] => [
  { url: `${BASE}/meetings`, json: meetings },
  ...Array.from({ length: transcripts }, oneSegment),
];

describe('sync : pages et curseur', () => {
  const sizes = (pages: SyncPage[]) => pages.map((page) => page.items.length);

  it('découpe en pages de 50 réunions au plus, avec le curseur de la dernière', async () => {
    const { pages } = await runSync(manyRoutes(manyMeetings(120), 120));
    expect(sizes(pages)).toEqual([50, 50, 20]);
    expect(pages.map((page) => page.cursor)).toEqual([
      '2026-10-02T00:00:49.000Z',
      '2026-10-02T00:01:39.000Z',
      '2026-10-02T00:01:59.000Z',
    ]);
  });

  it('reprend juste après le curseur, sans doublon ni trou', async () => {
    const meetings = manyMeetings(120);
    const first = await runSync(manyRoutes(meetings, 120));
    const cursor = first.pages[0]?.cursor ?? null;
    const resumed = await runSync(manyRoutes(meetings, 70), cursor);
    expect(sizes(resumed.pages)).toEqual([50, 20]);
    const ids = [...first.pages.slice(0, 1), ...resumed.pages].flatMap((page) =>
      page.items.map((item) => item.externalId),
    );
    expect(ids).toEqual(meetings.map((meeting) => `meeting:${meeting.id}`));
  });

  it('avec le dernier curseur rendu, ne relit aucune transcription et ne rend rien', async () => {
    const meetings = manyMeetings(120);
    const first = await runSync(manyRoutes(meetings, 120));
    const again = await runSync(manyRoutes(meetings, 0), first.pages.at(-1)?.cursor ?? null);
    expect(again.pages).toEqual([]);
    expect(again.calls.map((call) => call.url)).toEqual([`${BASE}/meetings?ownership=Mine`]);
  });

  it('garde ensemble les réunions modifiées au même instant, au bord d’une page', async () => {
    const meetings = manyMeetings(60, [49, 50]);
    const { pages } = await runSync(manyRoutes(meetings, 60));
    expect(sizes(pages)).toEqual([51, 9]);
    const resumed = await runSync(manyRoutes(meetings, 9), pages[0]?.cursor ?? null);
    expect(sizes(resumed.pages)).toEqual([9]);
  });

  it('reprend après un curseur illisible comme au premier passage', async () => {
    const { items } = await runSync(fixtureRoutes(), 'pas-une-date');
    expect(items).toHaveLength(3);
  });
});

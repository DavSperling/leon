import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import type { ConnectorItem, SyncPage } from '../types';
import { claapConnector as rawConnector } from './connector';
import recordingsPage1 from './fixtures/recordings-page-1.json';
import recordingsPage2 from './fixtures/recordings-page-2.json';
import transcriptClip from './fixtures/transcript-clip.json';
import transcriptDemo from './fixtures/transcript-demo-client.json';
import transcriptProduit from './fixtures/transcript-point-produit.json';
import transcriptVide from './fixtures/transcript-vide.json';
import workspace from './fixtures/workspace.json';

if (!rawConnector) throw new Error('Le connecteur Claap n’existe pas');
const connector = rawConnector;

const BASE = 'https://api.claap.io';
const config = { apiKey: 'cla_test_secret_123' };
const SINCE = new Date('2026-10-01T00:00:00.000Z');

const ID_PRODUIT = 'Qm4tX8vLw2Ks7NfY1cRzH'; // réunion à trois personnes présentes, deux locuteurs
const ID_DEMO = 'Ht9vK3pNa6Ys1WdE5uBjR'; // réunion, un seul locuteur, un seul participant présent
const ID_CLIP = 'Zc2nB7rGq4Lx9TmV6aPwD'; // sans réunion, sans titre, sans locuteur
const ID_VIDE = 'Lw5yE1kHs8Qd3ZoC9tNfU'; // sans transcription (tableau « transcripts » vide)

const [produit, demo] = recordingsPage1.result.recordings;
const [clip, vide] = recordingsPage2.result.recordings;

const list = (recordings: unknown[], nextCursor?: string): FakeRoute => ({
  url: `${BASE}/v1/recordings`,
  json: { result: { recordings, pagination: { totalCount: recordings.length, nextCursor } } },
});
const transcript = (id: string, json: unknown, status = 200): FakeRoute => ({
  url: `${BASE}/v1/recordings/${id}/transcript`,
  json,
  status,
});

// Les deux pages de l'exemple, puis la transcription des trois enregistrements qui en ont une.
function fixtureRoutes(): FakeRoute[] {
  return [
    { url: `${BASE}/v1/recordings`, json: recordingsPage1 },
    { url: `${BASE}/v1/recordings`, json: recordingsPage2 },
    transcript(ID_PRODUIT, transcriptProduit),
    transcript(ID_DEMO, transcriptDemo),
    transcript(ID_CLIP, transcriptClip),
  ];
}

async function runSync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(connector, config, routes);
  const pages = await collect(connector.sync(config, { cursor, since: SINCE }, http));
  return { pages, items: pages.flatMap((page) => page.items), calls };
}

const byId = (items: ConnectorItem[], id: string) =>
  items.find((item) => item.externalId === `recording:${id}`);

type Cursor = { after: string; seen: Record<string, string> };
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null') as Cursor;

const queryOf = (url: string) => Object.fromEntries(new URL(url).searchParams);
const isTranscriptCall = (call: { url: string }) => call.url.includes('/transcript');

describe('configSchema et hôtes', () => {
  it('refuse une config incomplète', () => {
    const schema = connector.configSchema;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ apiKey: '' }).success).toBe(false);
    expect(schema.safeParse({ apiKey: '   ' }).success).toBe(false);
  });

  it('accepte une clé et retire les espaces autour', () => {
    expect(connector.configSchema.parse({ apiKey: '  cla_abc123 ' })).toEqual({
      apiKey: 'cla_abc123',
    });
  });

  it('déclare l’hôte exact, la clé comme seul secret et un écart entre les requêtes', () => {
    expect(connector.hosts(config)).toEqual(['api.claap.io']);
    expect(connector.secretFields).toEqual(['apiKey']);
    expect(connector.id).toBe('claap');
    expect(connector.minIntervalMs).toBeGreaterThanOrEqual(334); // 3 requêtes par seconde
  });
});

describe('verify', () => {
  it('appelle l’espace de travail avec la clé dans X-Claap-Key et rend son nom', async () => {
    const { http, calls } = testHttp(connector, config, [
      { url: `${BASE}/v1/workspaces/mine`, json: workspace },
    ]);
    const result = await connector.verify(config, http);
    expect(result.account).toContain('Acme');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/v1/workspaces/mine`);
    expect(calls[0]?.headers['x-claap-key']).toBe('cla_test_secret_123');
  });

  it('lève ConnectorAuthError sur une réponse 401', async () => {
    const { http } = testHttp(connector, config, [
      {
        url: `${BASE}/v1/workspaces/mine`,
        status: 401,
        json: { error: { type: 'unauthorized', message: 'Invalid API key' } },
      },
    ]);
    await expect(connector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('sync : premier passage', () => {
  it('demande les enregistrements du plus ancien au plus récent, depuis « since »', async () => {
    const { calls } = await runSync(fixtureRoutes());
    const first = calls[0];
    expect(first?.url.startsWith(`${BASE}/v1/recordings?`)).toBe(true);
    expect(queryOf(first?.url ?? '')).toEqual({
      sort: 'created_asc',
      limit: '50',
      createdAfter: '2026-10-01T00:00:00.000Z',
    });
    expect(first?.headers['x-claap-key']).toBe('cla_test_secret_123');
  });

  it('lit la transcription de chaque enregistrement qui en a une, avec la clé', async () => {
    const { calls } = await runSync(fixtureRoutes());
    const urls = calls.map((call) => call.url);
    for (const id of [ID_PRODUIT, ID_DEMO, ID_CLIP]) {
      expect(urls).toContain(`${BASE}/v1/recordings/${id}/transcript`);
    }
    expect(urls.some((url) => url.includes(ID_VIDE))).toBe(false);
    for (const call of calls) expect(call.headers['x-claap-key']).toBe('cla_test_secret_123');
  });

  it('rend une réunion par enregistrement qui a des paroles, dans l’ordre de création', async () => {
    const { items } = await runSync(fixtureRoutes());
    expect(items.map((item) => item.externalId)).toEqual([
      `recording:${ID_PRODUIT}`,
      `recording:${ID_DEMO}`,
      `recording:${ID_CLIP}`,
    ]);
    expect(byId(items, ID_PRODUIT)).toMatchObject({
      nature: 'reunion',
      title: 'Point produit hebdo',
      url: 'https://app.claap.io/acme/point-produit-hebdo-c-Qm4tX8vLw2Ks7NfY1cRzH',
      updatedAt: '2026-10-12T09:00:12.344Z',
      origin: { participants: 'Marie Durand, Karim Benali, Léa Martin, invite@acme.test' },
    });
  });

  it('regroupe les phrases du même locuteur et date chaque prise de parole du début de la réunion', async () => {
    const { items } = await runSync(fixtureRoutes());
    const turns = byId(items, ID_PRODUIT)?.turns ?? [];
    expect(turns).toEqual([
      {
        externalId: 'utterance:0',
        role: 'participant',
        author: { name: 'speaker_1', email: null },
        text: 'Bonjour à tous, on commence par le point sur la bêta.\nLe lancement est fixé au 4 novembre.',
        ts: '2026-10-12T09:00:05.200Z',
      },
      {
        externalId: 'utterance:2',
        role: 'participant',
        author: { name: 'speaker_2', email: null },
        text: 'D’accord, je m’occupe de la page de tarifs d’ici vendredi.',
        ts: '2026-10-12T09:00:20.400Z',
      },
      {
        externalId: 'utterance:3',
        role: 'participant',
        author: { name: 'speaker_1', email: null },
        text: 'Parfait, merci Karim.',
        ts: '2026-10-12T09:00:31.000Z',
      },
    ]);
  });

  it('lit aussi la réponse dont les phrases sont directement sous « result » (exemple de la doc)', async () => {
    const { items } = await runSync(fixtureRoutes());
    expect(byId(items, ID_DEMO)?.turns).toHaveLength(1);
  });

  it('nomme le locuteur unique d’après le seul participant présent', async () => {
    const { items } = await runSync(fixtureRoutes());
    const meeting = byId(items, ID_DEMO);
    expect(meeting?.origin).toEqual({ participants: 'Marie Durand, Paul Dupont' });
    expect(meeting?.turns[0]).toMatchObject({
      author: { name: 'Marie Durand', email: 'marie@acme.test' },
      text: 'Voici le tableau de bord que nous livrons à Dupont.\nLa mise en service est prévue la semaine du 20 octobre.',
      ts: '2026-10-13T14:30:42.000Z',
    });
  });

  it('attribue une capture sans réunion ni locuteur à son auteur, et date depuis sa création', async () => {
    const { items } = await runSync(fixtureRoutes());
    const capture = byId(items, ID_CLIP);
    expect(capture?.title).toBe('Enregistrement sans titre');
    expect(capture?.origin).toEqual({ participants: 'Marie Durand' });
    expect(capture?.turns).toEqual([
      {
        externalId: 'utterance:0',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Voici la marche à suivre pour exporter une facture.',
        ts: '2026-10-14T08:15:31.500Z',
      },
    ]);
  });

  it('ignore un horodatage de phrase absurde au lieu de planter', async () => {
    const odd = { result: { segments: [{ startedAt: 1e20, endedAt: 1e20, text: 'Bonjour' }] } };
    const { items } = await runSync([list([clip]), transcript(ID_CLIP, odd)]);
    expect(items[0]?.turns[0]?.ts).toBe('2026-10-14T08:15:30.000Z');
  });

  it('chaque date rendue passe la normalisation du socle', async () => {
    const { items } = await runSync(fixtureRoutes());
    expect(items).not.toHaveLength(0);
    for (const item of items) expect(normalizeItem(item, 'claap')).not.toBeNull();
  });

  it('encode l’identifiant dans l’adresse de la transcription', async () => {
    const odd = { ...clip, id: 'a/b?c' };
    const { calls } = await runSync([list([odd]), transcript('a%2Fb%3Fc', transcriptClip)]);
    expect(calls[1]?.url).toBe(`${BASE}/v1/recordings/a%2Fb%3Fc/transcript`);
  });

  it('ne rend rien et ne lit rien quand la liste est vide', async () => {
    const { pages, calls } = await runSync([list([])]);
    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('sync : transcription pas encore là', () => {
  it('ne demande pas la transcription d’un enregistrement qui n’en a pas, et le curseur le dépasse', async () => {
    const { pages, items, calls } = await runSync([list([vide])]);
    expect(items).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(pages).toHaveLength(1);
    expect(cursorOf(pages[0])).toEqual({ after: '2026-10-14T16:02:00.000Z', seen: {} });
  });

  it('le lit au passage suivant, quand sa transcription est arrivée', async () => {
    const first = await runSync([list([vide])]);
    const arrived = { ...vide, transcripts: produit?.transcripts };
    const { items, calls } = await runSync(
      [list([arrived]), transcript(ID_VIDE, transcriptClip)],
      first.pages.at(-1)?.cursor ?? null,
    );
    expect(items.map((item) => item.externalId)).toEqual([`recording:${ID_VIDE}`]);
    expect(calls).toHaveLength(2);
  });

  it('une transcription lue mais vide est définitive : elle n’est pas relue', async () => {
    const empty = { ...vide, transcripts: produit?.transcripts };
    const first = await runSync([list([empty]), transcript(ID_VIDE, transcriptVide)]);
    expect(first.items).toEqual([]);
    expect(Object.keys(cursorOf(first.pages[0]).seen)).toEqual([ID_VIDE]);

    const again = await runSync([list([empty])], first.pages.at(-1)?.cursor ?? null);
    expect(again.calls).toHaveLength(1); // la liste seulement
  });
});

describe('sync : pages et curseur', () => {
  it('suit la page suivante de Claap avec la même date de départ', async () => {
    const { pages, calls } = await runSync(fixtureRoutes());
    expect(pages).toHaveLength(2);
    const lists = calls.filter((call) => !isTranscriptCall(call));
    expect(lists).toHaveLength(2);
    expect(queryOf(lists[1]?.url ?? '')).toEqual({
      sort: 'created_asc',
      limit: '50',
      createdAfter: '2026-10-01T00:00:00.000Z',
      cursor: 'cursor-page-2',
    });
  });

  it('rend des curseurs qui avancent d’une page à l’autre', async () => {
    const { pages } = await runSync(fixtureRoutes());
    expect(cursorOf(pages[0]).after).toBe('2026-10-13T14:30:05.100Z');
    expect(cursorOf(pages[1]).after).toBe('2026-10-14T16:02:00.000Z');
  });

  it('ne garde dans le curseur que les enregistrements des six dernières heures', async () => {
    const { pages } = await runSync(fixtureRoutes());
    expect(Object.keys(cursorOf(pages[0]).seen)).toEqual([ID_DEMO]);
    expect(cursorOf(pages[1]).seen).toEqual({});
  });

  it('repassé à sync, le dernier curseur relit six heures avant, mais aucune transcription', async () => {
    const first = await runSync(fixtureRoutes());
    const cursor = first.pages.at(-1)?.cursor ?? null;
    const { items, calls } = await runSync([list([vide])], cursor);
    expect(items).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(queryOf(calls[0]?.url ?? '').createdAfter).toBe('2026-10-14T10:02:00.000Z');
  });

  it('lit un enregistrement créé avant le curseur mais prêt après, sans reculer le curseur', async () => {
    const first = await runSync(fixtureRoutes());
    const cursor = first.pages.at(-1)?.cursor ?? null;
    const late = { ...clip, id: 'Tw8bN3qKd5Fy2HxM6rJcZ', createdAt: '2026-10-14T11:00:00.000Z' };
    const { pages, items, calls } = await runSync(
      [list([late, vide]), transcript(late.id, transcriptClip)],
      cursor,
    );
    expect(items.map((item) => item.externalId)).toEqual([`recording:${late.id}`]);
    expect(calls).toHaveLength(2); // la liste et la seule transcription nouvelle
    const after = cursorOf(pages[0]);
    expect(after.after).toBe('2026-10-14T16:02:00.000Z');
    expect(Object.keys(after.seen)).toEqual([late.id]);
  });

  it('un curseur illisible repart de « since »', async () => {
    const { calls } = await runSync(fixtureRoutes(), 'pas du json');
    expect(queryOf(calls[0]?.url ?? '').createdAfter).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('sync : cent transcriptions par passage au plus', () => {
  const BASE_TIME = Date.parse('2026-10-14T08:00:00.000Z');
  const recording = (i: number) => ({
    ...clip,
    id: `Rec${String(i).padStart(3, '0')}`,
    createdAt: new Date(BASE_TIME + i * 60_000).toISOString(),
    title: `Réunion ${i}`,
  });
  const slice = (from: number, to: number, nextCursor?: string) =>
    list(
      Array.from({ length: to - from }, (_, i) => recording(from + i)),
      nextCursor,
    );
  const phrase = (i: number) => ({
    result: { transcript: { segments: [{ startedAt: 1, endedAt: 2, text: `Phrase ${i}` }] } },
  });
  const transcripts = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) =>
      transcript(recording(from + i).id, phrase(from + i)),
    );

  it('s’arrête à cent, enregistre le curseur, et reprend au cent unième', async () => {
    const first = await runSync([slice(0, 50, 'c2'), slice(50, 100, 'c3'), ...transcripts(0, 100)]);
    expect(first.items).toHaveLength(100);
    expect(first.pages).toHaveLength(2);
    expect(first.calls.filter(isTranscriptCall)).toHaveLength(100);
    expect(first.calls.filter((call) => !isTranscriptCall(call))).toHaveLength(2);

    const cursor = first.pages.at(-1)?.cursor ?? null;
    const second = await runSync(
      [slice(0, 50, 'c2'), slice(50, 100, 'c3'), slice(100, 130), ...transcripts(100, 130)],
      cursor,
    );
    expect(second.items.map((item) => item.externalId)).toEqual(
      Array.from({ length: 30 }, (_, i) => `recording:${recording(100 + i).id}`),
    );
    expect(second.calls.filter(isTranscriptCall)).toHaveLength(30);
  });

  it('ne dépasse jamais cent, même quand une page en apporterait plus', async () => {
    const { items, pages, calls } = await runSync([
      slice(0, 60, 'c2'),
      slice(60, 120, 'c3'),
      ...transcripts(0, 100),
    ]);
    expect(items).toHaveLength(100);
    expect(pages).toHaveLength(2);
    expect(calls.filter(isTranscriptCall)).toHaveLength(100);
    expect(cursorOf(pages[1]).after).toBe(recording(99).createdAt);
  });
});

describe('sync : erreurs', () => {
  const both = list([produit, demo]);

  it('une transcription introuvable (404) laisse l’enregistrement sans texte, les autres passent', async () => {
    const { items } = await runSync([
      both,
      transcript(ID_PRODUIT, { error: { type: 'not_found', message: 'x' } }, 404),
      transcript(ID_DEMO, transcriptDemo),
    ]);
    expect(items.map((item) => item.externalId)).toEqual([`recording:${ID_DEMO}`]);
  });

  it('une transcription interdite (403) laisse aussi l’enregistrement sans texte', async () => {
    const { items } = await runSync([
      both,
      transcript(ID_PRODUIT, transcriptProduit),
      transcript(ID_DEMO, { error: { type: 'forbidden', message: 'x' } }, 403),
    ]);
    expect(items.map((item) => item.externalId)).toEqual([`recording:${ID_PRODUIT}`]);
  });

  it('une clé refusée (401) sur une transcription remonte', async () => {
    await expect(
      runSync([both, transcript(ID_PRODUIT, { error: { type: 'unauthorized' } }, 401)]),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('une clé refusée (401) sur la liste remonte', async () => {
    const refused: FakeRoute = {
      url: `${BASE}/v1/recordings`,
      status: 401,
      json: { error: { type: 'unauthorized' } },
    };
    await expect(runSync([refused])).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('une transcription de forme inattendue lève une erreur sans reprendre la réponse', async () => {
    const outcome = runSync([
      both,
      transcript(ID_PRODUIT, { result: { texte: 'secret-de-la-reponse' } }),
    ]);
    await expect(outcome).rejects.toBeInstanceOf(ConnectorHttpError);
    await expect(outcome).rejects.toThrow('Réponse inattendue');
    await expect(outcome).rejects.not.toThrow('secret-de-la-reponse');
  });

  it('une liste dont les dates n’ont pas de fuseau lève une erreur au lieu de décaler les faits', async () => {
    const naive = { ...produit, createdAt: '2026-10-12T09:00:12' };
    await expect(runSync([list([naive])])).rejects.toThrow('Réponse inattendue');
  });
});

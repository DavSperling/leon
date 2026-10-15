import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import { normalizeItem } from '@/server/connectors/normalize';
import type { ConnectorItem, SyncPage } from '@/server/connectors/types';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { gongConnector } from './connector';
import calls1 from './fixtures/calls-page-1.json';
import calls2 from './fixtures/calls-page-2.json';
import noCallsError from './fixtures/error-no-calls.json';
import transcripts1 from './fixtures/transcripts-page-1.json';
import transcripts2 from './fixtures/transcripts-page-2.json';

const BASE = 'https://us-12345.api.gong.io';
const EXTENSIVE = `${BASE}/v2/calls/extensive`;
const TRANSCRIPT = `${BASE}/v2/calls/transcript`;
const CONFIG = { baseUrlHost: 'us-12345', accessKey: 'ak-test', accessKeySecret: 'secret-test' };
const BASIC = `Basic ${Buffer.from('ak-test:secret-test').toString('base64')}`;
const SINCE = new Date('2026-09-15T00:00:00Z');
const NOW = new Date('2026-10-15T12:00:00Z');

const CALL_A = '7782342274025937895';
const CALL_B = '7782342274025937896';
const CALL_C = '7782342274025937897';

type Call = (typeof calls1.calls)[number];

const listing = (json: unknown): FakeRoute => ({ method: 'POST', url: EXTENSIVE, json });
const speech = (json: unknown): FakeRoute => ({ method: 'POST', url: TRANSCRIPT, json });
const nothing = (url: string): FakeRoute => ({
  method: 'POST',
  url,
  status: 404,
  json: noCallsError,
});
type Body = {
  cursor?: string;
  filter: { fromDateTime?: string; toDateTime?: string; callIds: string[] };
  contentSelector?: unknown;
};
const bodyOf = (call: { body: unknown } | undefined) => call?.body as Body;

async function run(routes: FakeRoute[], cursor: string | null = null, since = SINCE) {
  const { http, calls } = testHttp(gongConnector, CONFIG, routes);
  const pages = await collect(gongConnector.sync(CONFIG, { cursor, since }, http));
  return { pages, calls };
}

const items = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const walkOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? '{}');
const finalAfter = (pages: SyncPage[]): string => walkOf(pages.at(-1)).after;

// Un appel du jeu d'exemple, avec ses champs modifiés.
function call(overrides: { id: string; started: string } & Record<string, unknown>) {
  const { id, started, ...rest } = overrides;
  const base = calls1.calls[0] as Call;
  return { ...base, metaData: { ...base.metaData, id, started, scheduled: started }, ...rest };
}
const page = (...found: unknown[]) => ({
  records: { currentPageSize: found.length },
  calls: found,
});
const talk = (speakerId: string, start: number, text: string) => ({
  speakerId,
  topic: 'Sujet',
  sentences: [{ start, end: start + 1000, text }],
});
const transcriptOf = (callId: string, ...transcript: unknown[]) => ({
  records: { currentPageSize: 1 },
  callTranscripts: [{ callId, transcript }],
});
const MARIE = '6432345678555530067';
const PAUL = '6432345678555530068';

// La date compte : un appel récent sans texte n'est peut-être pas encore traité par Gong.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('configSchema et hôtes', () => {
  const schema = gongConnector.configSchema;

  it('refuse une config incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ ...CONFIG, accessKey: '  ' }).success).toBe(false);
    expect(schema.safeParse({ ...CONFIG, accessKeySecret: '' }).success).toBe(false);
    expect(schema.safeParse({ ...CONFIG, baseUrlHost: undefined }).success).toBe(false);
  });

  it('refuse un sous-domaine détourné ou mal formé', () => {
    for (const baseUrlHost of [
      'evil.com/x',
      'a.b',
      'a_b',
      '-acme',
      '',
      'https://us-1.api.gong.io',
    ]) {
      expect(schema.safeParse({ ...CONFIG, baseUrlHost }).success, baseUrlHost).toBe(false);
    }
  });

  it('accepte un sous-domaine, en majuscules ou avec des blancs, et le range en minuscules', () => {
    expect(schema.parse({ ...CONFIG, baseUrlHost: 'acme' }).baseUrlHost).toBe('acme');
    expect(schema.parse({ ...CONFIG, baseUrlHost: ' US-12345 ' }).baseUrlHost).toBe('us-12345');
  });

  it('ne parle qu’à <sous-domaine>.api.gong.io, et seul le secret est chiffré', () => {
    expect(gongConnector.hosts(CONFIG)).toEqual(['us-12345.api.gong.io']);
    expect(gongConnector.secretFields).toEqual(['accessKeySecret']);
  });

  it('espace les requêtes de plus d’un tiers de seconde (3 par seconde au plus)', () => {
    expect(gongConnector.minIntervalMs).toBeGreaterThanOrEqual(334);
  });
});

describe('verify', () => {
  it('lit une heure d’appels avec la clé en Basic et rend le sous-domaine', async () => {
    const { http, calls } = testHttp(gongConnector, CONFIG, [listing(calls1)]);

    const { account } = await gongConnector.verify(CONFIG, http);

    expect(account).toBe('Gong (us-12345)');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(EXTENSIVE);
    expect(calls[0]?.headers.authorization).toBe(BASIC);
    expect(bodyOf(calls[0])).toEqual({
      filter: { fromDateTime: '2026-10-15T11:00:00.000Z', toDateTime: '2026-10-15T12:00:00.000Z' },
    });
  });

  it('accepte l’absence d’appel : Gong répond 404 quand la période est vide', async () => {
    const { http } = testHttp(gongConnector, CONFIG, [nothing(EXTENSIVE)]);

    await expect(gongConnector.verify(CONFIG, http)).resolves.toEqual({
      account: 'Gong (us-12345)',
    });
  });

  it('lève ConnectorAuthError sur un 401', async () => {
    const { http } = testHttp(gongConnector, CONFIG, [
      { method: 'POST', url: EXTENSIVE, status: 401, json: { errors: ['Access denied'] } },
    ]);

    await expect(gongConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('sync : premier passage', () => {
  it('demande les appels depuis since, avec les participants et le résumé, puis leurs transcriptions', async () => {
    const { calls } = await run([listing(page())]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBe(BASIC);
    expect(bodyOf(calls[0])).toEqual({
      filter: { fromDateTime: '2026-09-15T00:00:00.000Z', toDateTime: '2026-10-15T12:00:00.000Z' },
      contentSelector: { exposedFields: { parties: true, content: { brief: true } } },
    });
  });

  it('rend une réunion : prises de parole regroupées par locuteur et datées depuis le début de l’appel', async () => {
    const { pages, calls } = await run([
      listing(calls1),
      speech(transcripts1),
      listing(calls2),
      speech(transcripts2),
    ]);

    expect(calls[1]?.url).toBe(TRANSCRIPT);
    expect(bodyOf(calls[1])).toEqual({ filter: { callIds: [CALL_A, CALL_B] } });
    expect(items(pages)[0]).toMatchObject({
      externalId: `call:${CALL_A}`,
      nature: 'reunion',
      title: 'Point produit Acme',
      url: `https://app.gong.io/call?id=${CALL_A}`,
      updatedAt: '2026-10-12T09:02:00.000Z',
      origin: { participants: 'Marie Durand, Paul Martin, jean@dupont.test, Léa Roux' },
    });
    expect(items(pages)[0]?.turns).toEqual([
      {
        externalId: 'utterance:0',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Bonjour à tous, on commence par le calendrier. La livraison est repoussée au 3 novembre.\nPaul, tu peux prévenir le client ?',
        ts: '2026-10-12T09:02:05.000Z',
      },
      {
        externalId: 'utterance:2',
        role: 'participant',
        author: { name: 'Paul Martin', email: 'paul@dupont.test' },
        text: "D'accord, je préviens le client demain.",
        ts: '2026-10-12T09:03:02.000Z',
      },
      {
        externalId: 'utterance:3',
        role: 'participant',
        author: { name: 'Locuteur 1', email: null },
        text: "Je me joins à l'appel en retard.",
        ts: '2026-10-12T09:03:30.000Z',
      },
      {
        externalId: 'utterance:4',
        role: 'participant',
        author: { name: 'jean@dupont.test', email: 'jean@dupont.test' },
        text: 'Même chose de mon côté.',
        ts: '2026-10-12T09:04:00.000Z',
      },
    ]);
  });

  it('sans transcription, rend le résumé de l’outil en un tour document daté de l’appel', async () => {
    const { pages } = await run([
      listing(calls1),
      speech(transcripts1),
      listing(calls2),
      speech(transcripts2),
    ]);

    expect(items(pages)[1]).toMatchObject({
      externalId: `call:${CALL_B}`,
      title: 'Appel client Dupont',
      updatedAt: '2026-10-13T14:30:00.000Z',
      origin: { participants: 'Marie Durand, Jean Dupont' },
    });
    expect(items(pages)[1]?.turns).toEqual([
      {
        externalId: 'summary',
        role: 'document',
        author: { name: null, email: null },
        text: 'Dupont veut une démonstration avant le 20 novembre.',
        ts: '2026-10-13T14:30:00.000Z',
      },
    ]);
  });

  it('ne rend pas un appel sans texte, et lit une date avec millisecondes', async () => {
    const { pages } = await run([
      listing(calls1),
      speech(transcripts1),
      listing(calls2),
      speech(transcripts2),
    ]);

    expect(items(pages).map((item) => item.externalId)).toEqual([
      `call:${CALL_A}`,
      `call:${CALL_B}`,
      `call:${CALL_C}`,
    ]);
    expect(items(pages)[2]).toMatchObject({
      title: 'Revue trimestrielle',
      updatedAt: '2026-10-14T08:00:00.000Z',
      origin: { participants: 'Paul Martin, Marie Durand' },
    });
    expect(items(pages)[2]?.turns[0]?.ts).toBe('2026-10-14T08:00:03.000Z');
  });

  it('garde l’heure d’un appel daté avec un décalage, en UTC', async () => {
    const found = call({ id: '1', started: '2026-10-12T11:02:00+02:00' });
    const { pages } = await run([
      listing(page(found)),
      speech(transcriptOf('1', talk(MARIE, 65_000, 'Bonjour.'))),
    ]);

    expect(items(pages)[0]?.updatedAt).toBe('2026-10-12T09:02:00.000Z');
    expect(items(pages)[0]?.turns[0]?.ts).toBe('2026-10-12T09:03:05.000Z');
  });

  it('donne un libellé distinct à chaque locuteur inconnu', async () => {
    const found = call({ id: '1', started: '2026-10-12T09:00:00Z' });
    const transcript = transcriptOf(
      '1',
      talk('x1', 1000, 'Un.'),
      talk('x2', 2000, 'Deux.'),
      talk('x1', 3000, 'Trois.'),
    );

    const { pages } = await run([listing(page(found)), speech(transcript)]);

    expect(items(pages)[0]?.turns.map((turn) => [turn.author.name, turn.text])).toEqual([
      ['Locuteur 1', 'Un.'],
      ['Locuteur 2', 'Deux.'],
      ['Locuteur 1', 'Trois.'],
    ]);
  });

  it('range les prises de parole dans l’ordre du temps et ignore celles qui sont vides', async () => {
    const found = call({ id: '1', started: '2026-10-12T09:00:00Z' });
    const empty = {
      speakerId: MARIE,
      topic: 'Rien',
      sentences: [{ start: 500, end: 600, text: '  ' }],
    };
    const transcript = transcriptOf(
      '1',
      talk(PAUL, 9000, 'Après.'),
      empty,
      talk(MARIE, 2000, 'Avant.'),
    );

    const { pages } = await run([listing(page(found)), speech(transcript)]);

    expect(items(pages)[0]?.turns.map((turn) => turn.text)).toEqual(['Avant.', 'Après.']);
  });

  it('prend les locuteurs comme participants quand la liste des participants est vide', async () => {
    const found = call({ id: '1', started: '2026-10-12T09:00:00Z', parties: [] });
    const transcript = transcriptOf('1', talk('x1', 1000, 'Un.'));

    const { pages } = await run([listing(page(found)), speech(transcript)]);

    expect(items(pages)[0]?.origin).toEqual({ participants: 'Locuteur 1' });
  });

  it('passe chaque élément rendu par la normalisation du socle', async () => {
    const { pages } = await run([
      listing(calls1),
      speech(transcripts1),
      listing(calls2),
      speech(transcripts2),
    ]);

    expect(items(pages)).toHaveLength(3);
    for (const item of items(pages)) {
      const normalized = normalizeItem(item, 'gong');
      expect(normalized?.turns.length, item.externalId).toBeGreaterThan(0);
    }
  });

  it('rend une page vide quand Gong répond 404 faute d’appel sur la période', async () => {
    const { pages, calls } = await run([nothing(EXTENSIVE)]);

    expect(calls).toHaveLength(1);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toEqual([]);
    expect(finalAfter(pages)).toBe('2026-09-15T00:00:00.000Z');
  });
});

describe('sync : transcriptions', () => {
  it('les demande par lots de 50 identifiants', async () => {
    const found = Array.from({ length: 120 }, (_, i) =>
      call({ id: String(1000 + i), started: '2026-10-01T09:00:00Z' }),
    );
    const empty = { records: {}, callTranscripts: [] };

    const { calls } = await run([
      listing(page(...found)),
      speech(empty),
      speech(empty),
      speech(empty),
    ]);

    const sizes = calls.slice(1).map((c) => bodyOf(c).filter.callIds.length);
    expect(sizes).toEqual([50, 50, 20]);
  });

  it('suit le curseur de la réponse tant qu’il en reste', async () => {
    const both = page(calls1.calls[0], calls2.calls[0]);
    const first = { ...transcripts1, records: { cursor: 'suite-t' } };

    const { pages, calls } = await run([listing(both), speech(first), speech(transcripts2)]);

    expect(bodyOf(calls[2])).toEqual({
      cursor: 'suite-t',
      filter: { callIds: [CALL_A, CALL_C] },
    });
    expect(items(pages).map((item) => item.turns[0]?.role)).toEqual(['participant', 'participant']);
  });

  it('rend le résumé quand la transcription n’existe pas encore (404), sans passer devant l’appel', async () => {
    const recent = call({
      id: '1',
      started: '2026-10-15T10:00:00Z',
      content: { brief: 'Résumé déjà prêt.' },
    });

    const { pages } = await run([listing(page(recent)), nothing(TRANSCRIPT)]);

    expect(items(pages)[0]?.turns.map((turn) => turn.role)).toEqual(['document']);
    expect(finalAfter(pages)).toBe('2026-10-15T06:00:00.000Z');
  });

  it('lève ConnectorAuthError quand la clé n’a pas le droit de lire les transcriptions', async () => {
    const forbidden: FakeRoute = {
      method: 'POST',
      url: TRANSCRIPT,
      status: 403,
      json: { errors: ['x'] },
    };

    await expect(run([listing(calls1), forbidden])).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lève une erreur propre, sans le texte de Gong, sur une réponse inattendue', async () => {
    const odd = {
      method: 'POST' as const,
      url: EXTENSIVE,
      json: { calls: [{ metaData: { id: 7 } }] },
    };

    const failure = await run([odd]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
  });
});

describe('sync : pages et curseur', () => {
  const both = () => [listing(calls1), speech(transcripts1), listing(calls2), speech(transcripts2)];

  it('suit le curseur des appels : deux pages, la seconde sur la même période', async () => {
    const { pages, calls } = await run(both());

    expect(pages.map((p) => p.items.length)).toEqual([2, 1]);
    expect(calls.map((c) => c.url)).toEqual([EXTENSIVE, TRANSCRIPT, EXTENSIVE, TRANSCRIPT]);
    const [first, second] = [bodyOf(calls[0]), bodyOf(calls[2])];
    expect(first.cursor).toBeUndefined();
    expect(second.cursor).toBe(calls1.records.cursor);
    expect(second.filter).toEqual(first.filter);
    expect(second.contentSelector).toEqual(first.contentSelector);
  });

  it('reprend au milieu du parcours avec le curseur de la première page, sur la même période', async () => {
    const first = await run(both());
    vi.setSystemTime(new Date('2026-10-15T13:30:00Z'));

    const { pages, calls } = await run(
      [listing(calls2), speech(transcripts2)],
      first.pages[0]?.cursor,
    );

    expect(pages).toHaveLength(1);
    expect(bodyOf(calls[0]).cursor).toBe(calls1.records.cursor);
    expect(bodyOf(calls[0]).filter).toEqual({
      fromDateTime: '2026-09-15T00:00:00.000Z',
      toDateTime: '2026-10-15T12:00:00.000Z',
    });
  });

  it('quand l’appel le plus récent date de plus de six heures, le curseur final repart juste après lui, sans refaire la première page', async () => {
    const first = await run(both());
    expect(finalAfter(first.pages)).toBe('2026-10-14T16:00:00.001Z');
    vi.setSystemTime(new Date('2026-10-15T12:15:00Z'));

    const { calls } = await run([nothing(EXTENSIVE)], first.pages.at(-1)?.cursor);

    expect(bodyOf(calls[0]).cursor).toBeUndefined();
    expect(bodyOf(calls[0]).filter).toEqual({
      fromDateTime: '2026-10-14T16:00:00.001Z',
      toDateTime: '2026-10-15T12:15:00.000Z',
    });
  });

  it('repart de since si le curseur est illisible', async () => {
    const { calls } = await run([nothing(EXTENSIVE)], 'pas du json');

    expect(bodyOf(calls[0]).filter.fromDateTime).toBe('2026-09-15T00:00:00.000Z');
    expect(bodyOf(calls[0]).cursor).toBeUndefined();
  });

  it('ne dépasse pas le parcours tant qu’il n’est pas fini, quel que soit l’ordre de la liste', async () => {
    // Gong ne documente pas l'ordre de la liste : la page la plus récente peut venir d'abord.
    const newest = { ...calls2, records: { cursor: 'suite' } };
    const oldest = page(calls1.calls[0]);

    const { pages } = await run([
      listing(newest),
      speech(transcripts2),
      listing(oldest),
      speech(transcripts1),
    ]);

    expect(walkOf(pages[0])).toMatchObject({ after: '2026-09-15T00:00:00.000Z', next: 'suite' });
    expect(finalAfter(pages)).toBe('2026-10-14T16:00:00.001Z');
  });
});

describe('sync : appel listé en retard', () => {
  // A (10h00 à 11h00) est traité par Gong après B (10h30 à 10h45, plus court) : le passage de
  // midi ne voit que B. Gong filtre sur l'heure de début, donc A n'est relu que si le départ
  // du passage suivant reste plus tôt que lui.
  const early = () => call({ id: 'B', started: '2026-10-15T10:30:00Z' });
  const late = () => call({ id: 'A', started: '2026-10-15T10:00:00Z' });
  const spokenBy = (callId: string, text: string) => ({
    callId,
    transcript: [talk(MARIE, 2000, text)],
  });

  it('relit les six heures qui précèdent la fin du parcours : un appel plus ancien que le plus récent, listé au passage suivant, est rendu', async () => {
    const first = await run([
      listing(page(early())),
      speech(transcriptOf('B', talk(PAUL, 1000, 'B.'))),
    ]);
    expect(finalAfter(first.pages)).toBe('2026-10-15T06:00:00.000Z');
    vi.setSystemTime(new Date('2026-10-15T12:15:00Z'));

    const { pages, calls } = await run(
      [
        listing(page(early(), late())),
        speech({
          records: {},
          callTranscripts: [spokenBy('B', 'Déjà vu.'), spokenBy('A', 'Enfin listé.')],
        }),
      ],
      first.pages.at(-1)?.cursor,
    );

    const from = bodyOf(calls[0]).filter.fromDateTime ?? '';
    expect(Date.parse(from)).toBeLessThanOrEqual(Date.parse(late().metaData.started));
    expect(items(pages).map((item) => item.externalId)).toContain('call:A');
    expect(finalAfter(pages)).toBe('2026-10-15T06:15:00.000Z');
  });

  it('ne recule jamais avant since', async () => {
    const since = new Date('2026-10-15T09:00:00Z');
    const spoken = speech(transcriptOf('B', talk(PAUL, 1000, 'B.')));

    const { pages } = await run([listing(page(early())), spoken], null, since);

    expect(finalAfter(pages)).toBe('2026-10-15T09:00:00.000Z');
  });
});

describe('sync : appel pas encore traité', () => {
  const pending = () => call({ id: '99', started: '2026-10-15T10:00:00Z', content: {} });
  const spoken = () => transcriptOf('99', talk(MARIE, 4000, 'Enfin le texte.'));

  it('garde un appel récent sans texte dans la fenêtre de relecture, pour le relire plus tard', async () => {
    const { pages } = await run([listing(page(calls1.calls[0], pending())), speech(transcripts1)]);

    expect(items(pages).map((item) => item.externalId)).toEqual([`call:${CALL_A}`]);
    expect(finalAfter(pages)).toBe('2026-10-15T06:00:00.000Z');
  });

  it('le rend au passage suivant, quand son texte est arrivé', async () => {
    const first = await run([listing(page(pending())), nothing(TRANSCRIPT)]);
    vi.setSystemTime(new Date('2026-10-15T12:15:00Z'));

    const { pages, calls } = await run(
      [listing(page(pending())), speech(spoken())],
      first.pages.at(-1)?.cursor,
    );

    expect(bodyOf(calls[0]).filter.fromDateTime).toBe('2026-10-15T06:00:00.000Z');
    expect(items(pages).map((item) => item.externalId)).toEqual(['call:99']);
    expect(finalAfter(pages)).toBe('2026-10-15T06:15:00.000Z');
  });

  it('cesse de le relire quand il sort de la fenêtre des six heures, toujours sans texte', async () => {
    const first = await run([listing(page(pending())), nothing(TRANSCRIPT)]);
    vi.setSystemTime(new Date('2026-10-15T16:15:00Z'));

    const { pages, calls } = await run(
      [listing(page(pending())), nothing(TRANSCRIPT)],
      first.pages.at(-1)?.cursor,
    );

    expect(bodyOf(calls[0]).filter.fromDateTime).toBe('2026-10-15T06:00:00.000Z');
    expect(items(pages)).toEqual([]);
    expect(finalAfter(pages)).toBe('2026-10-15T10:00:00.001Z');
  });

  it('abandonne un appel resté sans texte plus de six heures', async () => {
    const stale = call({ id: '98', started: '2026-10-15T05:59:00Z', content: {} });

    const { pages } = await run([listing(page(stale)), nothing(TRANSCRIPT)]);

    expect(items(pages)).toEqual([]);
    expect(finalAfter(pages)).toBe('2026-10-15T05:59:00.001Z');
  });
});

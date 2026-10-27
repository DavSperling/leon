import { describe, expect, it } from 'vitest';
import { collect, type FakeCall, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import type { ConnectorItem, SyncPage } from '../types';
import { leexiConnector as connector } from './connector';
import callsOne from './fixtures/calls-one.json';
import callsPage1 from './fixtures/calls-page-1.json';
import callsPage2 from './fixtures/calls-page-2.json';

const BASE = 'https://public-api.leexi.ai/v1';
const config = { keyId: 'key_test_id_123', keySecret: 'secret_test_456' };
const BASIC = `Basic ${Buffer.from('key_test_id_123:secret_test_456').toString('base64')}`;
const SINCE = new Date('2026-10-01T00:00:00.000Z');

const ID_OLD = '0c1d2e3f-4a5b-4c6d-8e7f-a0b1c2d3e4f5'; // modifié avant « since »
const ID_INITECH = '1a2b3c4d-5e6f-4a7b-8c9d-e0f1a2b3c4d5'; // résumé seulement
const ID_EMPTY = '2b3c4d5e-6f7a-4b8c-9d0e-f1a2b3c4d5e6'; // ni transcription ni résumé
const ID_BUDGET = '3c4d5e6f-7a8b-4c9d-8e1f-a2b3c4d5e6f7'; // transcription, locuteur sans adresse
const ID_PRODUCT = '4d5e6f7a-8b9c-4d0e-9f2a-b3c4d5e6f7a8'; // transcription, la plus récente

const listRoute = (json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${BASE}/calls`,
  json,
  ...extra,
});
const fixtureRoutes = (): FakeRoute[] => [listRoute(callsPage1), listRoute(callsPage2)];

const query = (call: FakeCall | undefined) =>
  new URL(call?.url ?? 'https://absent.test').searchParams;

async function runSync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(connector, config, routes);
  const pages = await collect(connector.sync(config, { cursor, since: SINCE }, http));
  return { pages, items: pages.flatMap((page) => page.items), calls };
}

const byId = (items: ConnectorItem[], id: string) =>
  items.find((item) => item.externalId === `call:${id}`);

// Un appel minimal, modifié `second` secondes après minuit le 2 octobre, avec une prise de parole.
function bareCall(index: number, extra: Record<string, unknown> = {}) {
  const stamp = new Date(Date.UTC(2026, 9, 2, 0, 0, index)).toISOString();
  return {
    uuid: `call-${String(index).padStart(3, '0')}`,
    title: `Appel ${index}`,
    created_at: stamp,
    performed_at: stamp,
    updated_at: stamp,
    simple_transcript: 'Marie Durand (00:00 - 00:05)\nBonjour',
    ...extra,
  };
}
const pageOf = (calls: unknown[], page: number, pages: number) => ({
  data: calls,
  pagination: { count: 60, items: 25, page, pages },
});

describe('configSchema et hôtes', () => {
  it('refuse une config incomplète ou une clé mal formée', () => {
    const schema = connector.configSchema;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ keyId: 'abc' }).success).toBe(false);
    expect(schema.safeParse({ keySecret: 'def' }).success).toBe(false);
    expect(schema.safeParse({ keyId: '', keySecret: 'def' }).success).toBe(false);
    expect(schema.safeParse({ keyId: 'abc', keySecret: '' }).success).toBe(false);
    expect(schema.safeParse({ keyId: 'a b', keySecret: 'def' }).success).toBe(false);
    expect(schema.safeParse({ keyId: 'abc', keySecret: 'de\nf' }).success).toBe(false);
  });

  it('refuse un identifiant qui contient « : », que Basic couperait au mauvais endroit', () => {
    expect(connector.configSchema.safeParse({ keyId: 'a:b', keySecret: 'def' }).success).toBe(
      false,
    );
  });

  it('accepte un secret qui contient « : » et retire les espaces autour', () => {
    expect(connector.configSchema.parse({ keyId: ' abc ', keySecret: ' d:e:f ' })).toEqual({
      keyId: 'abc',
      keySecret: 'd:e:f',
    });
  });

  it('déclare l’hôte exact, la paire de la clé à chiffrer (le secret d’abord) et l’écart entre requêtes', () => {
    expect(connector.id).toBe('leexi');
    expect(connector.hosts(config)).toEqual(['public-api.leexi.ai']);
    expect(connector.secretFields).toEqual(['keySecret', 'keyId']);
    // 50 requêtes par minute par clé.
    expect(connector.minIntervalMs).toBeGreaterThanOrEqual(1200);
  });
});

describe('verify', () => {
  it('lit un seul appel avec Basic identifiant:secret et rend un compte lisible', async () => {
    const { http, calls } = testHttp(connector, config, [listRoute(callsOne)]);
    const result = await connector.verify(config, http);
    expect(result.account).toContain('Leexi');
    expect(result.account).toContain('42');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url.startsWith(`${BASE}/calls?`)).toBe(true);
    expect(query(calls[0]).get('items')).toBe('1');
    expect(calls[0]?.headers.authorization).toBe(BASIC);
  });

  it('lève ConnectorAuthError sur un 401', async () => {
    const { http } = testHttp(connector, config, [
      listRoute({ success: false, message: 'Unauthorized' }, { status: 401 }),
    ]);
    await expect(connector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lève ConnectorAuthError sur un 403 (plan sans API ou permission manquante)', async () => {
    const { http } = testHttp(connector, config, [
      listRoute({ success: false, message: 'Forbidden' }, { status: 403 }),
    ]);
    await expect(connector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('dit qu’un abonnement inactif (402) n’est pas un problème de clé', async () => {
    const { http } = testHttp(connector, config, [
      listRoute({ success: false, message: 'Payment required' }, { status: 402 }),
    ]);
    const error = await connector.verify(config, http).catch((caught) => caught);
    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect(error).not.toBeInstanceOf(ConnectorAuthError);
    expect(error.status).toBe(402);
    expect(error.message).toBe('Leexi subscription inactive');
  });
});

describe('sync : premier passage', () => {
  it('demande les appels modifiés depuis « since », du plus ancien au plus récent, avec la transcription', async () => {
    const { calls } = await runSync(fixtureRoutes());
    const first = query(calls[0]);
    expect(calls[0]?.url.startsWith(`${BASE}/calls?`)).toBe(true);
    expect(calls[0]?.headers.authorization).toBe(BASIC);
    expect(first.get('date_filter')).toBe('updated_at');
    expect(first.get('order')).toBe('updated_at asc');
    expect(first.get('from')).toBe('2026-10-01T00:00:00.000Z');
    expect(first.get('with_simple_transcript')).toBe('true');
    expect(first.get('page')).toBe('1');
    expect(Number(first.get('items'))).toBeLessThanOrEqual(100);
  });

  it('lit la page suivante tant que la réponse en annonce, avec le même filtre', async () => {
    const { calls } = await runSync(fixtureRoutes());
    expect(calls).toHaveLength(2);
    const second = query(calls[1]);
    expect(second.get('page')).toBe('2');
    expect(second.get('from')).toBe('2026-10-01T00:00:00.000Z');
    expect(second.get('order')).toBe('updated_at asc');
    expect(calls[1]?.headers.authorization).toBe(BASIC);
  });

  it('rend une page par page de la liste, avec le curseur de son dernier appel', async () => {
    const { pages, items } = await runSync(fixtureRoutes());
    expect(pages.map((page) => page.items.length)).toEqual([2, 1]);
    expect(pages.map((page) => page.cursor)).toEqual([
      '2026-10-13T17:20:00.000Z',
      '2026-10-14T10:05:30.120Z',
    ]);
    expect(items.map((item) => item.externalId)).toEqual([
      `call:${ID_INITECH}`,
      `call:${ID_BUDGET}`,
      `call:${ID_PRODUCT}`,
    ]);
  });

  it('écarte ce qui est modifié avant « since », même si la liste le rend', async () => {
    const { items } = await runSync(fixtureRoutes());
    expect(byId(items, ID_OLD)).toBeUndefined();
    expect(JSON.stringify(items)).not.toContain('vieux message');
  });

  it('range une réunion en tours de locuteurs regroupés, datés du début plus l’horodatage', async () => {
    const { items } = await runSync(fixtureRoutes());
    const meeting = byId(items, ID_PRODUCT);
    expect(meeting).toMatchObject({
      nature: 'reunion',
      title: 'Point produit Acme',
      url: `https://app.leexi.ai/fr/calls/${ID_PRODUCT}`,
      updatedAt: '2026-10-14T10:05:30.120Z',
      origin: { participants: 'Marie Durand, Paul Martin, invite@acme.test' },
    });
    expect(meeting?.turns).toEqual([
      {
        externalId: 'utterance:0',
        role: 'participant',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: 'Bonjour Paul, on commence par la feuille de route ?\nJe propose de livrer l’export CSV avant la fin du mois.\nEt de le présenter vendredi.',
        ts: '2026-10-14T09:00:00.000Z',
      },
      {
        externalId: 'utterance:2',
        role: 'participant',
        author: { name: 'Paul Martin', email: 'paul@acme.test' },
        text: 'D’accord, je m’engage à préparer la maquette d’ici jeudi.',
        ts: '2026-10-14T09:00:14.000Z',
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

  it('ne met aucun tour document quand il y a une transcription, ni les chapitres', async () => {
    const { items } = await runSync(fixtureRoutes());
    for (const id of [ID_PRODUCT, ID_BUDGET]) {
      expect(byId(items, id)?.turns.every((turn) => turn.role === 'participant')).toBe(true);
    }
    expect(JSON.stringify(items)).not.toContain('Ne doit pas être lu');
    expect(JSON.stringify(items)).not.toContain('ignoré quand la transcription existe');
  });

  it('garde un nom à parenthèses et ne devine aucune adresse', async () => {
    const { items } = await runSync(fixtureRoutes());
    const meeting = byId(items, ID_BUDGET);
    expect(meeting?.url).toBeNull();
    expect(meeting?.origin).toEqual({ participants: 'Marie Durand, Sophie Bernard (Initech)' });
    expect(meeting?.turns.map((turn) => [turn.author, turn.ts])).toEqual([
      [{ name: 'Sophie Bernard (Initech)', email: null }, '2026-10-13T16:30:00.000Z'],
      [{ name: 'Marie Durand', email: 'marie@acme.test' }, '2026-10-13T16:30:13.000Z'],
    ]);
  });

  it('sans transcription, rend le résumé en un tour document daté de la modification', async () => {
    const { items } = await runSync(fixtureRoutes());
    const meeting = byId(items, ID_INITECH);
    expect(meeting?.origin).toEqual({ participants: 'Marie Durand, Sophie Bernard' });
    expect(meeting?.turns).toEqual([
      {
        externalId: 'summary',
        role: 'document',
        author: { name: null, email: null },
        text: 'Initech veut un devis pour 40 postes avant le 30 octobre.\n\nMarie envoie le devis lundi.',
        ts: '2026-10-13T15:02:11.450Z',
      },
    ]);
    expect(JSON.stringify(meeting)).not.toContain('Ne doit pas être lu comme résumé');
  });

  it('lit le résumé du champ « summary » quand la réponse le donne', async () => {
    const call = {
      ...callsPage1.data[1],
      simple_transcript: null,
      prompts: [],
      summary: 'Devis à envoyer.',
    };
    const { items } = await runSync([listRoute({ data: [call], pagination: { pages: 1 } })]);
    expect(items[0]?.turns.map((turn) => turn.text)).toEqual(['Devis à envoyer.']);
  });

  it('ne rend pas un appel sans texte (ni transcription ni résumé)', async () => {
    const { items } = await runSync(fixtureRoutes());
    expect(byId(items, ID_EMPTY)).toBeUndefined();
  });

  it('rend des éléments que le socle accepte, avec des dates exactes', async () => {
    const { items } = await runSync(fixtureRoutes());
    expect(items).toHaveLength(3);
    for (const item of items) expect(normalizeItem(item, 'leexi')).not.toBeNull();
    const normalized = normalizeItem(byId(items, ID_PRODUCT) as ConnectorItem, 'leexi');
    expect(normalized?.turns[1]?.ts.toISOString()).toBe('2026-10-14T09:00:14.000Z');
    expect(JSON.stringify(items)).not.toContain(config.keySecret);
  });
});

describe('sync : transcription', () => {
  const one = (call: Record<string, unknown>) =>
    runSync([listRoute({ data: [call], pagination: { pages: 1 } })]);

  it('lit les minutes au-delà de 59 et les heures, sous les deux écritures', async () => {
    const call = bareCall(1, {
      performed_at: '2026-10-14T09:00:00.000Z',
      simple_transcript:
        'Marie Durand (75:30 - 75:40)\nA\nPaul Martin (01:15:50 - 01:16:00)\nB\nMarie Durand (2:00:05 - 2:00:09)\nC',
    });
    const { items } = await one(call);
    expect(items[0]?.turns.map((turn) => turn.ts)).toEqual([
      '2026-10-14T10:15:30.000Z',
      '2026-10-14T10:15:50.000Z',
      '2026-10-14T11:00:05.000Z',
    ]);
  });

  it('date les prises de parole d’une réunion annoncée avec un décalage horaire', async () => {
    const call = bareCall(1, {
      performed_at: '2026-10-14T11:00:00.000+02:00',
      updated_at: '2026-10-14T12:05:00.000+02:00',
      simple_transcript: 'Marie Durand (01:00 - 01:05)\nBonjour',
    });
    const { items, pages } = await one(call);
    expect(items[0]?.updatedAt).toBe('2026-10-14T12:05:00.000+02:00');
    expect(items[0]?.turns[0]?.ts).toBe('2026-10-14T09:01:00.000Z');
    expect(pages[0]?.cursor).toBe('2026-10-14T10:05:00.000Z');
  });

  it('garde un texte sans aucun en-tête de locuteur comme un tour sans auteur', async () => {
    const { items } = await one(
      bareCall(1, { simple_transcript: 'Texte sans en-tête\nsur deux lignes' }),
    );
    expect(items[0]?.turns).toEqual([
      {
        externalId: 'utterance:0',
        role: 'participant',
        author: { name: null, email: null },
        text: 'Texte sans en-tête\nsur deux lignes',
        ts: '2026-10-02T00:00:01.000Z',
      },
    ]);
  });

  it('ignore une prise de parole vide', async () => {
    const { items } = await one(
      bareCall(1, {
        simple_transcript: 'Marie Durand (00:00 - 00:05)\n\nPaul Martin (00:06 - 00:09)\nSalut',
      }),
    );
    expect(items[0]?.turns.map((turn) => [turn.author.name, turn.text])).toEqual([
      ['Paul Martin', 'Salut'],
    ]);
  });

  it('tolère les champs absents ou nuls, sans titre ni dates de remplacement inventées', async () => {
    const call = {
      uuid: 'call-nu',
      title: null,
      performed_at: null,
      created_at: '2026-10-05T08:00:00.000Z',
      updated_at: '2026-10-05T09:00:00.000Z',
      leexi_url: null,
      owner: null,
      participating_users: null,
      customers: null,
      speakers: null,
      prompts: null,
      simple_transcript: 'Marie Durand (00:10 - 00:15)\nBonjour',
    };
    const { items } = await one(call);
    expect(items[0]).toMatchObject({
      externalId: 'call:call-nu',
      title: 'Appel ou réunion sans titre',
      url: null,
      origin: { participants: 'Marie Durand' },
    });
    // Sans date de début, la création sert de repère.
    expect(items[0]?.turns[0]?.ts).toBe('2026-10-05T08:00:10.000Z');
  });

  it('n’emploie un lien vers l’original que s’il est en https', async () => {
    const { items } = await one(bareCall(1, { leexi_url: 'javascript:alert(1)' }));
    expect(items[0]?.url).toBeNull();
  });
});

describe('sync : pages et curseur', () => {
  const sizes = (pages: SyncPage[]) => pages.map((page) => page.items.length);
  const calls60 = Array.from({ length: 60 }, (_, index) => bareCall(index));
  const sixtyRoutes = (): FakeRoute[] => [
    listRoute(pageOf(calls60.slice(0, 25), 1, 3)),
    listRoute(pageOf(calls60.slice(25, 50), 2, 3)),
    listRoute(pageOf(calls60.slice(50), 3, 3)),
  ];

  it('rend des pages de 100 éléments au plus, avec le curseur de la dernière', async () => {
    const { pages, calls } = await runSync(sixtyRoutes());
    expect(sizes(pages)).toEqual([25, 25, 10]);
    expect(pages.map((page) => page.cursor)).toEqual([
      '2026-10-02T00:00:24.000Z',
      '2026-10-02T00:00:49.000Z',
      '2026-10-02T00:00:59.000Z',
    ]);
    expect(calls.map((call) => query(call).get('page'))).toEqual(['1', '2', '3']);
  });

  it('s’arrête dès la dernière page annoncée, sans demander la suivante', async () => {
    const { calls } = await runSync([listRoute(pageOf([bareCall(1)], 1, 1))]);
    expect(calls).toHaveLength(1);
  });

  it('s’arrête sur une liste vide', async () => {
    const { pages, calls } = await runSync([listRoute({ data: [], pagination: { pages: 0 } })]);
    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('reprend juste après le curseur : « from » le porte et la première page repart de 1', async () => {
    const first = await runSync(sixtyRoutes());
    const cursor = first.pages[0]?.cursor ?? null;
    const rest = calls60.slice(24); // le serveur rend le dernier appel déjà vu, puis la suite
    const resumed = await runSync(
      [listRoute(pageOf(rest.slice(0, 25), 1, 2)), listRoute(pageOf(rest.slice(25), 2, 2))],
      cursor,
    );
    expect(query(resumed.calls[0]).get('from')).toBe('2026-10-02T00:00:24.000Z');
    expect(query(resumed.calls[0]).get('page')).toBe('1');
    const ids = [...first.pages.slice(0, 1), ...resumed.pages].flatMap((page) =>
      page.items.map((item) => item.externalId),
    );
    expect(ids).toEqual(calls60.map((call) => `call:${call.uuid}`));
  });

  it('avec le dernier curseur rendu, ne rend rien (le serveur redonne l’appel du curseur)', async () => {
    const first = await runSync(fixtureRoutes());
    const last = first.pages.at(-1)?.cursor ?? null;
    const again = await runSync(
      [listRoute({ data: callsPage2.data, pagination: { pages: 1 } })],
      last,
    );
    expect(again.pages).toEqual([]);
    expect(again.calls).toHaveLength(1);
    expect(query(again.calls[0]).get('from')).toBe('2026-10-14T10:05:30.120Z');
  });

  it('garde « since » quand le curseur est plus ancien, et le reprend s’il est illisible', async () => {
    const older = await runSync(fixtureRoutes(), '2026-09-01T00:00:00.000Z');
    expect(query(older.calls[0]).get('from')).toBe('2026-10-01T00:00:00.000Z');
    const broken = await runSync(fixtureRoutes(), 'pas-une-date');
    expect(query(broken.calls[0]).get('from')).toBe('2026-10-01T00:00:00.000Z');
    expect(broken.items).toHaveLength(3);
  });

  it('avance le curseur même quand la page ne contient aucun appel avec du texte', async () => {
    const empty = bareCall(7, { simple_transcript: '', prompts: [] });
    const { pages } = await runSync([listRoute(pageOf([empty], 1, 1))]);
    expect(pages).toEqual([{ items: [], cursor: '2026-10-02T00:00:07.000Z' }]);
  });
});

describe('sync : erreurs', () => {
  it('remonte un 401 sur la liste comme une clé refusée', async () => {
    await expect(
      runSync([listRoute({ success: false, message: 'Unauthorized' }, { status: 401 })]),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte un 401 au milieu du parcours, après avoir rendu la première page', async () => {
    const { http } = testHttp(connector, config, [
      listRoute(callsPage1),
      listRoute({ success: false, message: 'Unauthorized' }, { status: 401 }),
    ]);
    const seen: SyncPage[] = [];
    const run = async () => {
      for await (const page of connector.sync(config, { cursor: null, since: SINCE }, http)) {
        seen.push(page);
      }
    };
    await expect(run()).rejects.toBeInstanceOf(ConnectorAuthError);
    expect(seen).toHaveLength(1);
  });

  it('lève une erreur propre sur un abonnement inactif, sans reprendre le corps', async () => {
    const error = await runSync([
      listRoute({ success: false, message: 'texte-secret-xyz' }, { status: 402 }),
    ]).catch((caught) => caught);
    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect(error.message).toBe('Leexi subscription inactive');
  });

  it('lève une erreur propre sur une réponse qui n’est pas du JSON', async () => {
    const error = await runSync([
      { url: `${BASE}/calls`, text: '<html>texte-secret-xyz</html>' },
    ]).catch((caught) => caught);
    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect(error.message).toBe('Unreadable response');
    expect(error.message).not.toContain('texte-secret-xyz');
  });

  it('lève une erreur propre sur une réponse d’une autre forme', async () => {
    const error = await runSync([listRoute({ data: 'rien', pagination: {} })]).catch((c) => c);
    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect(error.message).toBe('Unexpected response');
  });
});

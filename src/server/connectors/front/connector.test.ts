import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, type FakeCall, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { frontConnector } from './connector';
import comments1a1 from './fixtures/comments-cnv_1a1.json';
import comments2b2 from './fixtures/comments-cnv_2b2.json';
import events1 from './fixtures/events-1.json';
import events2 from './fixtures/events-2.json';
import me from './fixtures/me.json';
import messages1a1Page1 from './fixtures/messages-cnv_1a1-1.json';
import messages1a1Page2 from './fixtures/messages-cnv_1a1-2.json';
import messages2b2 from './fixtures/messages-cnv_2b2.json';
import messages3c3 from './fixtures/messages-cnv_3c3.json';

const API = 'https://api2.frontapp.com';
const EVENTS = `${API}/events`;
const messagesOf = (id: string) => `${API}/conversations/${id}/messages`;
const commentsOf = (id: string) => `${API}/conversations/${id}/comments`;
const TOKEN = 'jeton-de-test-0123456789';
const config = { token: TOKEN };
const NOW = '2026-10-15T12:00:00Z';
const SINCE = new Date('2026-09-15T00:00:00Z');
const SINCE_SECONDS = '1789430398.000'; // since, moins les deux secondes de chevauchement

// Toutes les routes d'un premier passage : deux pages d'événements ; la conversation 1a1 (deux
// pages de messages, des commentaires), 2b2, puis 3c3 dont les commentaires sont refusés (403). Le
// dernier événement, sur 1a1, ne relit rien : la conversation a déjà été lue.
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: EVENTS, json: events1 },
    { url: messagesOf('cnv_1a1'), json: messages1a1Page1 },
    { url: messagesOf('cnv_1a1'), json: messages1a1Page2 },
    { url: commentsOf('cnv_1a1'), json: comments1a1 },
    { url: messagesOf('cnv_2b2'), json: messages2b2 },
    { url: commentsOf('cnv_2b2'), json: comments2b2 },
    { url: EVENTS, json: events2 },
    { url: messagesOf('cnv_3c3'), json: messages3c3 },
    { url: commentsOf('cnv_3c3'), status: 403 },
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(frontConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(frontConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const itemOf = (pages: SyncPage[], id: string) =>
  itemsOf(pages).find((item) => item.externalId === id);
const paramsOf = (call: FakeCall | undefined) => new URL(call?.url ?? '').searchParams;
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const urlsOf = (calls: FakeCall[]) => calls.map((call) => call.url.split('?')[0]);

// Des réponses réduites à ce que Leon lit, pour les cas où le détail ne compte pas.
const conversation = (id: string, subject: string | null = 'Sujet') => ({ id, subject });
const event = (id: string, at: number, conv: ReturnType<typeof conversation> | null) => ({
  id,
  type: 'inbound',
  emitted_at: at,
  conversation: conv,
});
const eventsPage = (events: unknown[], next: string | null = null) => ({
  _pagination: { next },
  _results: events,
});
const message = (id: string, createdAt: number, text: string | null) => ({
  id,
  type: 'email',
  is_inbound: true,
  draft_mode: null,
  created_at: createdAt,
  author: null,
  recipients: [{ handle: 'julie@client.test', role: 'from', name: 'Julie Lefevre' }],
  body: text === null ? null : `<p>${text}</p>`,
  text,
});
const messagesPage = (messages: unknown[]) => ({ _pagination: { next: null }, _results: messages });
const noComments = { _results: [] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('front : configuration', () => {
  const schema = frontConnector.configSchema;

  it('accepte un jeton, sans les espaces autour', () => {
    expect(schema.parse({ token: `  ${TOKEN} ` })).toEqual({ token: TOKEN });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ token: '   ' }).success).toBe(false);
    expect(schema.safeParse({ token: 'a'.repeat(4001) }).success).toBe(false);
  });

  it('fixe l’hôte, le champ à chiffrer et l’écart entre deux requêtes (50 par minute au plus bas forfait)', () => {
    expect(frontConnector.hosts(config)).toEqual(['api2.frontapp.com']);
    expect(frontConnector.secretFields).toEqual(['token']);
    expect(frontConnector.minIntervalMs).toBe(1500);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('front')).toBe(frontConnector);
    expect(listCatalog('fr').find((item) => item.id === 'front')?.available).toBe(true);
  });
});

describe('front : verify', () => {
  it('lit l’entreprise avec le jeton en Bearer, puis essaie la liste des événements', async () => {
    const { http, calls } = testHttp(frontConnector, config, [
      { url: `${API}/me`, json: me },
      { url: EVENTS, json: eventsPage([]) },
    ]);

    const result = await frontConnector.verify(config, http);

    expect(result).toEqual({ account: 'Acme' });
    expect(calls[0]?.url).toBe(`${API}/me`);
    expect(calls[0]?.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` });
    expect(calls[1]?.url.split('?')[0]).toBe(EVENTS);
    expect(paramsOf(calls[1]).get('limit')).toBe('1');
    expect(calls).toHaveLength(2);
  });

  it('refuse un jeton rejeté (401)', async () => {
    const { http } = testHttp(frontConnector, config, [{ url: `${API}/me`, status: 401 }]);

    await expect(frontConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse un jeton qui n’a pas le droit de lire les événements (403)', async () => {
    const { http } = testHttp(frontConnector, config, [
      { url: `${API}/me`, json: me },
      { url: EVENTS, status: 403 },
    ]);

    await expect(frontConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('front : sync, premier passage', () => {
  it('demande les événements de messages et de commentaires depuis since, du plus ancien au plus récent', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const params = paramsOf(calls[0]);
    expect(calls[0]?.url.split('?')[0]).toBe(EVENTS);
    expect(params.get('q[after]')).toBe(SINCE_SECONDS);
    expect(params.getAll('q[types]')).toEqual(['inbound', 'outbound', 'out_reply', 'comment']);
    expect(params.get('limit')).toBe('15');
    expect(params.get('sort_by')).toBe('created_at');
    expect(params.get('sort_order')).toBe('asc');
  });

  it('envoie le jeton en Bearer à chaque requête, et lit chaque conversation une seule fois', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(9);
    for (const call of calls) {
      expect(call.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` });
    }
    expect(urlsOf(calls).filter((url) => url === messagesOf('cnv_1a1'))).toHaveLength(2); // 2 pages
  });

  it('rend une page par page d’événements, une conversation par élément', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(2);
    expect(pages[0]?.items.map((item) => item.externalId)).toEqual([
      'conversation:cnv_1a1',
      'conversation:cnv_2b2',
    ]);
    expect(pages[1]?.items.map((item) => item.externalId)).toEqual(['conversation:cnv_3c3']);
  });

  it('rend les messages et les notes internes d’une conversation, par date, sans les brouillons', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 'conversation:cnv_1a1')).toEqual({
      externalId: 'conversation:cnv_1a1',
      nature: 'fil',
      title: 'Livraison de la commande 4512',
      url: 'https://app.frontapp.com/open/cnv_1a1',
      updatedAt: '2026-10-12T09:09:00.000Z',
      origin: {},
      turns: [
        {
          externalId: 'message:msg_1a11',
          role: 'participant',
          author: { name: 'Julie Lefevre', email: 'julie@client.test' },
          side: 'external',
          internalNote: false,
          text: "Bonjour,\n\nMa commande 4512 devait arriver hier et je n'ai rien reçu. Pouvez-vous me dire où elle est ?\n\nJulie Lefevre",
          ts: '2026-10-12T09:00:00.000Z',
        },
        {
          externalId: 'message:msg_1a14',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          side: 'team',
          internalNote: false,
          text: 'Bonjour Julie,\n\nLe transporteur a un jour de retard. Votre colis arrive demain avant midi. Nous vous remboursons les frais de port.\n\nMarie',
          ts: '2026-10-12T09:03:30.000Z',
        },
        {
          externalId: 'comment:com_1a21',
          role: 'participant',
          author: { name: 'David Roux', email: 'david@acme.test' },
          side: 'team',
          internalNote: true,
          text: "Remboursement des frais de port accordé à Julie (commande 4512), à saisir dans l'outil de facturation.",
          ts: '2026-10-12T09:05:00.500Z',
        },
        {
          externalId: 'message:msg_1a13',
          role: 'participant',
          author: { name: 'Julie Lefevre', email: 'julie@client.test' },
          side: 'external',
          internalNote: false,
          text: 'Merci beaucoup !\n\nEt pour la prochaine commande, avez-vous une remise ?',
          ts: '2026-10-12T09:07:00.000Z',
        },
        {
          externalId: 'comment:com_1a22',
          role: 'participant',
          author: { name: null, email: null },
          internalNote: true,
          text: 'Relancer jeudi si pas de nouvelles.',
          ts: '2026-10-12T09:09:00.000Z',
        },
      ],
    });
  });

  // Le côté vient de Front (un équipier est l'`author` d'un message sortant, un message reçu n'en a pas),
  // pas du nom de l'en-tête « From » : il se choisit, une adresse pirate peut porter le nom d'un collègue.
  it('marque extérieur un message reçu au nom d’un collègue, et l’équipe un message avec un auteur', async () => {
    const spoofed = {
      ...message('msg_s1', 1791795600, 'Accord : remboursement intégral'),
      recipients: [{ handle: 'x@pirate.test', role: 'from', name: 'David Koskas' }],
    };
    const reply = {
      ...message('msg_s2', 1791795700, 'Bien reçu'),
      is_inbound: false,
      author: { first_name: 'Marie', last_name: 'Durand', email: 'marie@acme.test' },
    };
    const noAuthorOutbound = {
      ...message('msg_s3', 1791795800, 'Envoi automatique'),
      is_inbound: false,
    };
    const { pages } = await runSync([
      { url: EVENTS, json: eventsPage([event('evt_s1', 1791795800, conversation('cnv_s1'))]) },
      {
        url: messagesOf('cnv_s1'),
        json: messagesPage([spoofed, reply, noAuthorOutbound]),
      },
      { url: commentsOf('cnv_s1'), json: noComments },
    ]);

    const turns = itemsOf(pages)[0]?.turns;
    expect(turns?.map((turn) => [turn.author.name, turn.side])).toEqual([
      ['David Koskas', 'external'],
      ['Marie Durand', 'team'],
      ['Julie Lefevre', undefined], // ni auteur ni message reçu : l'outil ne dit pas le côté
    ]);
  });

  it('prend l’expéditeur d’un message dans ses destinataires quand il n’a pas d’auteur, le numéro faute de nom', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 'conversation:cnv_3c3')).toMatchObject({
      title: 'Conversation sans objet',
      updatedAt: '2026-10-13T14:00:00.000Z',
      turns: [
        {
          externalId: 'message:msg_3c11',
          role: 'participant',
          author: { name: '+33600000000', email: null },
          side: 'external',
          text: "Bonjour, mon colis n'est toujours pas arrivé & personne ne me répond < 48 h",
        },
      ],
    });
  });

  it('rend la conversation sans notes quand les commentaires sont refusés (403)', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 'conversation:cnv_3c3')?.turns).toHaveLength(1);
  });

  it('passe la normalisation du socle pour chaque élément', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(3);
    for (const item of itemsOf(pages)) {
      expect(normalizeItem(item, 'front')).not.toBeNull();
    }
  });

  it('convertit les dates en secondes de Front (exemple de la doc : 1701292639)', async () => {
    const { pages } = await runSync([
      { url: EVENTS, json: eventsPage([event('evt_x1', 1701292639, conversation('cnv_x1'))]) },
      { url: messagesOf('cnv_x1'), json: messagesPage([message('msg_x1', 1701292639, 'Bonjour')]) },
      { url: commentsOf('cnv_x1'), json: noComments },
    ]);

    expect(itemsOf(pages)[0]?.updatedAt).toBe('2023-11-29T21:17:19.000Z');
    expect(itemsOf(pages)[0]?.turns[0]?.ts).toBe('2023-11-29T21:17:19.000Z');
  });
});

describe('front : sync, pages et curseur', () => {
  it('suit la page suivante des événements sur api2, avec les mêmes filtres', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const second = calls.find((call) => paramsOf(call).get('page_token') === 'tok_events_2');
    expect(second?.url.startsWith(`${EVENTS}?`)).toBe(true);
    expect(paramsOf(second).get('q[after]')).toBe('1791795598.000');
    expect(paramsOf(second).getAll('q[types]')).toHaveLength(4);
  });

  it('refuse de sortir d’api2 : une page suivante sur un autre hôte est demandée sur api2', async () => {
    const other = 'https://evil.test/events?page_token=tok_evil&limit=15';
    const { calls } = await runSync([
      { url: EVENTS, json: eventsPage([event('evt_x1', 1791795600, null)], other) },
      { url: EVENTS, json: eventsPage([]) },
    ]);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe(`${EVENTS}?page_token=tok_evil&limit=15`);
  });

  it('suit la page suivante des messages d’une conversation', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const messageCalls = calls.filter((call) => call.url.startsWith(messagesOf('cnv_1a1')));
    expect(paramsOf(messageCalls[0]).get('limit')).toBe('50');
    expect(paramsOf(messageCalls[1]).get('page_token')).toBe('tok_messages_2');
  });

  it('enregistre après chaque page le dernier événement lu et ceux qui sont tout près de lui', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({
      at: 1791796200000,
      seen: [['evt_2b01', 1791796200000]],
    });
    expect(cursorOf(pages[1])).toEqual({
      at: 1791900120250,
      seen: [['evt_1a03', 1791900120250]],
    });
  });

  it('reprend depuis le dernier curseur : rien de neuf, une seule requête, aucune page', async () => {
    const cursor = JSON.stringify({ at: 1791900120250, seen: [['evt_1a03', 1791900120250]] });
    const { pages, calls } = await runSync(
      [
        {
          url: EVENTS,
          json: eventsPage([event('evt_1a03', 1791900120.25, conversation('cnv_1a1'))]),
        },
      ],
      { cursor },
    );

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(paramsOf(calls[0]).get('q[after]')).toBe('1791900118.250');
  });

  it('reprend depuis le dernier curseur : une activité nouvelle relit sa conversation entière', async () => {
    const cursor = JSON.stringify({ at: 1791900120250, seen: [['evt_1a03', 1791900120250]] });
    const { pages, calls } = await runSync(
      [
        {
          url: EVENTS,
          json: eventsPage([
            event('evt_1a03', 1791900120.25, conversation('cnv_1a1', 'Livraison')),
            event('evt_1a04', 1792000000, conversation('cnv_1a1', 'Livraison')),
          ]),
        },
        { url: messagesOf('cnv_1a1'), json: messages1a1Page1 },
        { url: messagesOf('cnv_1a1'), json: messages1a1Page2 },
        { url: commentsOf('cnv_1a1'), json: comments1a1 },
      ],
      { cursor },
    );

    expect(idsOf(pages)).toEqual(['conversation:cnv_1a1']);
    expect(itemOf(pages, 'conversation:cnv_1a1')?.turns).toHaveLength(5);
    expect(calls).toHaveLength(4);
    expect(cursorOf(pages[0])).toEqual({ at: 1792000000000, seen: [['evt_1a04', 1792000000000]] });
  });

  it('relit une conversation si un événement est postérieur à sa lecture, pas s’il est antérieur', async () => {
    const justBefore = Date.parse(NOW) / 1000 - 1; // une seconde avant la lecture : peut-être pas vu
    const { pages, calls } = await runSync([
      {
        url: EVENTS,
        json: eventsPage(
          [
            event('evt_y1', 1791800000, conversation('cnv_2b2')),
            event('evt_y2', 1791800100, conversation('cnv_3c3')),
          ],
          `${API}/events?page_token=tok_y2`,
        ),
      },
      { url: messagesOf('cnv_2b2'), json: messages2b2 },
      { url: commentsOf('cnv_2b2'), json: comments2b2 },
      { url: messagesOf('cnv_3c3'), json: messages3c3 },
      { url: commentsOf('cnv_3c3'), json: noComments },
      {
        url: EVENTS,
        json: eventsPage([
          event('evt_y3', 1791950000, conversation('cnv_2b2')), // bien avant la lecture : déjà vu
          event('evt_y4', justBefore, conversation('cnv_2b2')),
          event('evt_y5', 1791950100, conversation('cnv_3c3')), // déjà vu
        ]),
      },
      { url: messagesOf('cnv_2b2'), json: messages2b2 },
      { url: commentsOf('cnv_2b2'), json: comments2b2 },
    ]);

    expect(pages.map((page) => page.items.map((item) => item.externalId))).toEqual([
      ['conversation:cnv_2b2', 'conversation:cnv_3c3'],
      ['conversation:cnv_2b2'],
    ]);
    expect(calls).toHaveLength(8);
  });
});

describe('front : sync, entrées inattendues', () => {
  it('saute une conversation refusée (403), introuvable (404) ou fusionnée (301), et lit les autres', async () => {
    const { pages } = await runSync([
      {
        url: EVENTS,
        json: eventsPage([
          event('evt_z1', 1791795600, conversation('cnv_z1')),
          event('evt_z2', 1791795700, conversation('cnv_z2')),
          event('evt_z3', 1791795800, conversation('cnv_z3')),
          event('evt_z4', 1791795900, conversation('cnv_z4')),
        ]),
      },
      { url: messagesOf('cnv_z1'), status: 403 },
      { url: messagesOf('cnv_z2'), status: 404 },
      {
        url: messagesOf('cnv_z3'),
        status: 301,
        headers: { location: `${API}/conversations/cnv_z4` },
      },
      { url: messagesOf('cnv_z4'), json: messagesPage([message('msg_z4', 1791795900, 'Bonjour')]) },
      { url: commentsOf('cnv_z4'), json: noComments },
    ]);

    expect(idsOf(pages)).toEqual(['conversation:cnv_z4']);
    expect(cursorOf(pages[0]).at).toBe(1791795900000); // le curseur avance quand même
  });

  it('remonte une clé refusée (401) sur les messages', async () => {
    await expect(
      runSync([
        { url: EVENTS, json: eventsPage([event('evt_z1', 1791795600, conversation('cnv_z1'))]) },
        { url: messagesOf('cnv_z1'), status: 401 },
      ]),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte une clé refusée (403) sur la liste des événements', async () => {
    await expect(runSync([{ url: EVENTS, status: 403 }])).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('ne rend pas une conversation sans texte, mais avance le curseur', async () => {
    const { pages } = await runSync([
      { url: EVENTS, json: eventsPage([event('evt_z1', 1791795600, conversation('cnv_z1'))]) },
      {
        url: messagesOf('cnv_z1'),
        json: messagesPage([
          message('msg_z1', 1791795600, null),
          message('msg_z2', 1791795700, '  '),
        ]),
      },
      { url: commentsOf('cnv_z1'), json: noComments },
    ]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toEqual([]);
    expect(cursorOf(pages[0]).at).toBe(1791795600000);
  });

  it('ignore un événement sans conversation, mais avance le curseur', async () => {
    const { pages, calls } = await runSync([
      { url: EVENTS, json: eventsPage([event('evt_z1', 1791795600, null)]) },
    ]);

    expect(calls).toHaveLength(1);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toEqual([]);
    expect(cursorOf(pages[0]).at).toBe(1791795600000);
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync([{ url: EVENTS, json: eventsPage([]) }], {
      cursor: 'pas du json',
    });

    expect(paramsOf(calls[0]).get('q[after]')).toBe(SINCE_SECONDS);
  });
});

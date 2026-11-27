import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { AnyConnector, SyncPage } from '../types';
import { teamsChatsConnector, teamsConnector } from './connector';
import { transcriptItem } from './map';
import { teamsChatsOAuth, teamsOAuth } from './oauth';

// Un jeton généré à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const ACCESS = `eyJ.${randomBytes(12).toString('hex')}`;
const config = {
  authMode: 'oauth',
  accessToken: ACCESS,
  refreshToken: 'jeton',
  expiresAt: null,
} as const;
const SINCE = new Date('2026-10-01T00:00:00Z');
const NOW = '2026-10-15T08:00:00Z';
const LATER = '2026-10-16T08:30:00Z'; // plus de 24 h après NOW

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TEAM = 'fbe2bf47-16c8-47cf-b4a5-4b9b187c508b';
const PRIVATE_TEAM = '02bd9fd6-8f93-4758-87c3-1fb73740a315';
const GENERAL = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';
const DEVIS = '19:7d8f2b0c9e3a4f1b8c6d5e4f3a2b1c0d@thread.tacv2';
const IN = (team: string, channel: string) =>
  `${GRAPH}/teams/${team}/channels/${encodeURIComponent(channel)}`;
const MESSAGES = (channel: string, team = TEAM) => `${IN(team, channel)}/messages`;
const GROUP = '19:2a247d5dadc24f408d009e4ae84502cf@thread.v2';
const ONE =
  '19:8ea0e38b-efb3-4757-924a-5f94061cf8c2_ef1c916a-3135-4417-ba27-8eb7bd084193@unq.gbl.spaces';
const CHAT = (chat: string) => `${GRAPH}/chats/${encodeURIComponent(chat)}/messages`;
const CALENDAR = `${GRAPH}/me/calendarView`;

// Un message de Graph, sur le modèle des exemples de la doc.
const message = (id: string, at: string, content: string, over: Record<string, unknown> = {}) => ({
  id,
  replyToId: null,
  etag: id,
  messageType: 'message',
  createdDateTime: at,
  lastModifiedDateTime: at,
  lastEditedDateTime: null,
  deletedDateTime: null,
  subject: null,
  from: { application: null, device: null, user: { id: 'u-1', displayName: 'Robin Kline' } },
  body: { contentType: 'html', content },
  webUrl: `https://teams.microsoft.com/l/message/x/${id}`,
  attachments: [],
  ...over,
});
const deleted = (id: string, at: string, removedAt: string) =>
  message(id, at, '', { deletedDateTime: removedAt, lastModifiedDateTime: removedAt });
const system = (id: string, at: string) =>
  message(id, at, '<systemEventMessage/>', { messageType: 'systemEventMessage', from: null });

const param = (url: string | undefined, name: string) => new URL(url ?? '').searchParams.get(name);
const cursorOf = (pages: SyncPage[]) => JSON.parse(pages.at(-1)?.cursor ?? 'null');
const ids = (pages: SyncPage[]) => pages.flatMap((page) => page.items.map((i) => i.externalId));

async function run(connector: AnyConnector, routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(connector, config, routes);
  const pages = await collect(connector.sync(config, { cursor, since: SINCE }, http));
  return { pages, calls, paths: calls.map((call) => call.url.split('?')[0]) };
}

// Une équipe publique (ses canaux standard) et une équipe privée encore sans canal ; aucune autre équipe associée.
const TEAMS = {
  value: [
    { id: TEAM, displayName: 'Atelier Lebrun', isArchived: false },
    { id: PRIVATE_TEAM, displayName: 'Direction', isArchived: false },
  ],
};
const listing = (channels = [GENERAL]): FakeRoute[] => [
  { url: `${GRAPH}/me/joinedTeams`, json: TEAMS },
  { url: `${GRAPH}/me/teamwork/associatedTeams`, json: TEAMS },
  {
    url: `${GRAPH}/teams/${TEAM}/allChannels`,
    json: {
      value: channels.map((id) => ({
        id,
        displayName: id === GENERAL ? 'Général' : 'Devis',
        membershipType: 'standard',
      })),
    },
  },
  { url: `${GRAPH}/teams/${TEAM}`, json: { visibility: 'public' } },
  { url: `${GRAPH}/teams/${PRIVATE_TEAM}/allChannels`, json: { value: [] } },
  { url: `${GRAPH}/teams/${PRIVATE_TEAM}`, json: { visibility: 'private' } },
];

const REPLIES_NEXT = `${MESSAGES(GENERAL)}/1760430000000/replies?$skiptoken=MSwwLDE2`;
// Du fil le plus récemment animé au moins récent, comme l'exemple de la doc.
const generalPage = (next?: string) => ({
  value: [
    {
      ...message(
        '1760430000000',
        '2026-10-14T08:20:00Z',
        '<p>Le devis Dubois part <b>demain</b>.</p>',
      ),
      replies: [
        deleted('1760432000000', '2026-10-14T08:53:20Z', '2026-10-14T09:00:00Z'),
        message('1760431000000', '2026-10-14T08:36:40Z', 'Je relis ce soir.', {
          replyToId: '1760430000000',
          from: { user: { displayName: 'Marie Durand' } },
        }),
      ],
      'replies@odata.nextLink': REPLIES_NEXT,
    },
    {
      ...deleted('1760000000000', '2026-10-09T08:53:20Z', '2026-10-12T10:00:00Z'),
      subject: 'Planning',
      replies: [message('1760001000000', '2026-10-09T09:10:00Z', 'Lundi pour moi.')],
    },
    { ...system('1759900000000', '2026-10-08T05:06:40Z'), replies: [] },
    { ...message('1758000000000', '2026-09-16T05:20:00Z', 'Ancien fil.'), replies: [] },
    { ...message('1757000000000', '2026-09-04T15:33:20Z', 'Encore plus ancien.'), replies: [] },
  ],
  ...(next ? { '@odata.nextLink': next } : {}),
});
const NEXT_PAGE = `${MESSAGES(GENERAL)}?$skiptoken=page2`;
const firstPass = (): FakeRoute[] => [
  ...listing(),
  { url: MESSAGES(GENERAL), json: generalPage(NEXT_PAGE) },
  {
    url: REPLIES_NEXT,
    json: { value: [message('1760430500000', '2026-10-14T08:28:20Z', 'Première réponse.')] },
  },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

describe('Teams et Teams Chat : configuration', () => {
  it.each([
    ['teams', teamsConnector, teamsOAuth],
    ['teamschats', teamsChatsConnector, teamsChatsOAuth],
  ] as const)(
    '%s : rangé dans le registre, bouton seul, Microsoft Graph seulement',
    (id, connector, oauth) => {
      expect(getConnector(id)).toBe(connector);
      expect(connector.oauth).toBe(oauth);
      expect(connector.secretFields).toEqual([]);
      expect(connector.hosts(config)).toEqual(['graph.microsoft.com']);
      expect(connector.configSchema.safeParse({ accessToken: ACCESS }).success).toBe(false);
    },
  );

  it('passe par l’appli Microsoft commune, en compte d’entreprise, avec tous les droits de chaque outil', () => {
    for (const oauth of [teamsOAuth, teamsChatsOAuth]) {
      expect(oauth.appKey).toBe('MICROSOFT');
      expect(oauth.authorizeUrl).toBe(
        'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
      );
      expect(oauth.tokenUrl).toBe(
        'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
      );
      expect(oauth.extraTokenParams?.refresh?.scope).toBe(oauth.scopes.join(' '));
    }
    expect(teamsOAuth.scopes).toEqual([
      'offline_access',
      'User.Read',
      'Team.ReadBasic.All',
      'Channel.ReadBasic.All',
      'ChannelMember.Read.All',
      'ChannelMessage.Read.All',
      'ChannelMessage.Send',
    ]);
    expect(teamsChatsOAuth.scopes).toEqual([
      'offline_access',
      'User.Read',
      'Chat.ReadWrite',
      'ChatMessage.Send',
      'Calendars.ReadWrite',
      'OnlineMeetings.ReadWrite',
      'OnlineMeetingTranscript.Read.All',
      'OnlineMeetingRecording.Read.All',
      'OnlineMeetingArtifact.Read.All',
    ]);
  });

  it.each([
    ['teams', teamsOAuth],
    ['teamschats', teamsChatsOAuth],
  ] as const)(
    '%s : le lien d’accord de l’administrateur ne porte que les droits de l’outil',
    (id, oauth) => {
      const link = new URL(oauth.adminConsent?.url('client-1', 'https://leon.test/retour') ?? '');

      expect(`${link.origin}${link.pathname}`).toBe(
        'https://login.microsoftonline.com/organizations/v2.0/adminconsent',
      );
      const graph = oauth.scopes.slice(1).map((name) => `https://graph.microsoft.com/${name}`);
      expect(link.searchParams.get('scope')).toBe(['offline_access', ...graph].join(' '));
      expect(link.searchParams.get('state')).toBe(`/connections?outil=${id}`);
    },
  );

  it('rend chaque canal, conversation ou transcription visible de ses membres, sans partage de la connexion', () => {
    expect(teamsConnector.memberAccess).toBe(true);
    expect(teamsChatsConnector.memberAccess).toBe(true);
    const catalog = listCatalog('fr');
    for (const id of ['teams', 'teamschats']) {
      const item = catalog.find((entry) => entry.id === id);
      expect(item?.memberAccess).toBe(true);
      expect(item?.warning).toContain('Comme dans Teams');
    }
  });

  it('nomme le compte d’après /me', async () => {
    const { http, calls } = testHttp(teamsConnector, config, [
      {
        url: `${GRAPH}/me`,
        json: { id: 'id-1', displayName: 'Marie Durand', mail: 'marie@acme.test' },
      },
    ]);
    await expect(teamsConnector.verify(config, http)).resolves.toEqual({
      account: 'Marie Durand (marie@acme.test)',
      accountKey: 'id-1',
    });
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${ACCESS}`);
  });
});

describe('teamsConnector.sync : premier passage', () => {
  it('lit les équipes, leurs canaux et leur visibilité, puis chaque canal', async () => {
    const { paths, calls, pages } = await run(teamsConnector, firstPass());

    expect(paths).toEqual([
      `${GRAPH}/me/joinedTeams`,
      `${GRAPH}/me/teamwork/associatedTeams`,
      `${GRAPH}/teams/${TEAM}/allChannels`,
      `${GRAPH}/teams/${TEAM}`,
      `${GRAPH}/teams/${PRIVATE_TEAM}/allChannels`,
      `${GRAPH}/teams/${PRIVATE_TEAM}`,
      MESSAGES(GENERAL),
      REPLIES_NEXT.split('?')[0],
    ]);
    expect(calls[2]?.headers.prefer).toBe('include-unknown-enum-members');
    expect(param(calls[3]?.url, '$select')).toBe('visibility');
    expect(param(calls[6]?.url, '$top')).toBe('50');
    expect(param(calls[6]?.url, '$expand')).toBe('replies');
    expect(calls[7]?.url).toBe(REPLIES_NEXT);
    // Le canal standard d'une équipe publique : toute l'équipe, sans lire ses membres.
    expect(pages.flatMap((page) => page.audiences ?? [])).toEqual([{ key: GENERAL, team: true }]);
  });

  it('fait un fil par message de canal, avec ses réponses dans l’ordre, et retire les messages supprimés', async () => {
    const { pages } = await run(teamsConnector, firstPass());

    expect(ids(pages)).toEqual([
      `thread:${GENERAL}/1760430000000`,
      `thread:${GENERAL}/1760000000000`,
    ]);
    const [devis, planning] = pages.flatMap((page) => page.items);
    expect(devis).toMatchObject({
      nature: 'fil',
      title: 'Le devis Dubois part demain.',
      url: 'https://teams.microsoft.com/l/message/x/1760430000000',
      updatedAt: '2026-10-14T08:36:40.000Z',
      origin: { team: 'Atelier Lebrun', channel: 'Général' },
      audience: GENERAL,
    });
    expect(devis?.turns.map((turn) => [turn.externalId, turn.author.name, turn.text])).toEqual([
      [`message:${GENERAL}/1760430000000`, 'Robin Kline', 'Le devis Dubois part demain.'],
      [`message:${GENERAL}/1760430500000`, 'Robin Kline', 'Première réponse.'],
      [`message:${GENERAL}/1760431000000`, 'Marie Durand', 'Je relis ce soir.'],
    ]);
    // Le message d'ouverture supprimé : le fil garde sa réponse et le sujet du message pour titre.
    expect(planning?.title).toBe('Planning');
    expect(planning?.turns.map((turn) => turn.text)).toEqual(['Lundi pour moi.']);
    expect(pages.flatMap((page) => page.removedTurns ?? [])).toEqual([
      `message:${GENERAL}/1760432000000`,
      `message:${GENERAL}/1760000000000`,
    ]);
  });

  it('s’arrête au premier fil plus ancien que la période, sans lire la page suivante', async () => {
    const { calls } = await run(teamsConnector, firstPass());

    expect(calls.some((call) => call.url.includes('page2'))).toBe(false);
  });

  it('suit la page suivante quand tous les fils sont récents', async () => {
    const recent = generalPage(NEXT_PAGE);
    recent.value = recent.value.slice(0, 1);
    const { calls, pages } = await run(teamsConnector, [
      ...listing(),
      { url: MESSAGES(GENERAL), json: recent },
      { url: REPLIES_NEXT, json: { value: [] } },
      { url: NEXT_PAGE, json: { value: [] } },
    ]);

    expect(calls.at(-1)?.url).toBe(NEXT_PAGE);
    expect(cursorOf(pages).pending).toBeNull();
  });

  it('rend des éléments que le socle accepte', async () => {
    const { pages } = await run(teamsConnector, firstPass());

    for (const item of pages.flatMap((page) => page.items))
      expect(normalizeItem(item, 'teams')).not.toBeNull();
  });
});

describe('teamsConnector.sync : une lecture par jour au plus', () => {
  it('ne fait aucune requête dans les 24 h qui suivent', async () => {
    const first = await run(teamsConnector, firstPass());
    vi.setSystemTime(new Date('2026-10-16T07:59:00Z'));

    const { calls, pages } = await run(teamsConnector, [], first.pages.at(-1)?.cursor);

    expect(calls).toEqual([]);
    expect(pages).toEqual([]);
  });

  it('le lendemain, relit la liste et chaque canal depuis la lecture de la veille', async () => {
    const first = await run(teamsConnector, firstPass());
    vi.setSystemTime(new Date(LATER));
    const page = generalPage(NEXT_PAGE);
    page.value = [
      { ...message('1760600000000', '2026-10-16T07:33:20Z', 'Nouveau fil.'), replies: [] },
      ...page.value,
    ];

    const { pages, paths } = await run(
      teamsConnector,
      [
        ...listing(),
        { url: MESSAGES(GENERAL), json: page },
        { url: REPLIES_NEXT, json: { value: [] } },
      ],
      first.pages.at(-1)?.cursor,
    );

    expect(paths[0]).toBe(`${GRAPH}/me/joinedTeams`);
    // Lu la veille à 8 h : le fil du 14/10 est plus ancien, la lecture s'arrête avant lui.
    expect(ids(pages)).toEqual([`thread:${GENERAL}/1760600000000`]);
    expect(cursorOf(pages).read[GENERAL]).toBe('2026-10-16T08:30:00.000Z');
  });

  it('ne relit plus le canal d’une équipe quittée', async () => {
    const first = await run(teamsConnector, firstPass());
    vi.setSystemTime(new Date(LATER));

    const { paths, pages } = await run(
      teamsConnector,
      [
        { url: `${GRAPH}/me/joinedTeams`, json: { value: [] } },
        { url: `${GRAPH}/me/teamwork/associatedTeams`, json: { value: [] } },
      ],
      first.pages.at(-1)?.cursor,
    );

    expect(paths).toEqual([`${GRAPH}/me/joinedTeams`, `${GRAPH}/me/teamwork/associatedTeams`]);
    expect(cursorOf(pages)).toMatchObject({ places: [], read: {} });
  });

  it('reprend une lecture coupée à sa page suivante, sans relire la liste', async () => {
    const first = await run(teamsConnector, [
      ...listing(),
      { url: MESSAGES(GENERAL), json: { value: [], '@odata.nextLink': NEXT_PAGE } },
      { url: NEXT_PAGE, json: { value: [] } },
    ]);
    // Le curseur de la page qui porte la page suivante : là où un passage arrêté à 200 éléments a laissé la lecture.
    const cut = first.pages.find((page) => JSON.parse(page.cursor).pending !== null)?.cursor;
    expect(JSON.parse(cut ?? 'null').pending).toMatchObject({ key: GENERAL, link: NEXT_PAGE });

    const { calls, pages } = await run(
      teamsConnector,
      [{ url: NEXT_PAGE, json: { value: [] } }],
      cut,
    );

    expect(calls.map((call) => call.url)).toEqual([NEXT_PAGE]);
    expect(cursorOf(pages).read[GENERAL]).toBe('2026-10-15T08:00:00.000Z');
  });

  it('passe un canal supprimé depuis la liste du jour et lit les autres', async () => {
    const { pages, paths } = await run(teamsConnector, [
      ...listing([GENERAL, DEVIS]),
      { url: MESSAGES(GENERAL), status: 404, json: { error: { code: 'NotFound' } } },
      { url: MESSAGES(DEVIS), json: { value: [] } },
    ]);

    expect(paths.slice(-2)).toEqual([MESSAGES(GENERAL), MESSAGES(DEVIS)]);
    expect(Object.keys(cursorOf(pages).read).sort()).toEqual([DEVIS, GENERAL].sort());
  });
});

describe('teamsConnector.sync : canaux privés et partagés, et qui en est membre', () => {
  const HOST = '6f1c2b8e-0d4a-4c3b-9e5f-7a8b9c0d1e2f'; // l'équipe d'une autre entreprise
  const PAIE = '19:paie@thread.tacv2';
  const DIRECTION = '19:direction@thread.tacv2';
  const PARTAGE = '19:partage@thread.tacv2';
  const COMMANDES = '19:commandes@thread.tacv2';
  const AUTRE = '19:autre@thread.tacv2';
  const MEMBERS = (team: string, channel: string) => `${IN(team, channel)}/allMembers`;
  // L'adresse d'un canal dans allChannels, qui nomme l'équipe qui l'héberge (exemple de la doc).
  const at = (team: string, channel: string) =>
    `https://graph.microsoft.com/v1.0/tenants/b3246f44-b4gb-4627-96c6-25b18fa2c910/teams/${team}/channels/${channel}`;
  const channel = (id: string, name: string, type: string, host = TEAM) => ({
    '@odata.id': at(host, id),
    id,
    displayName: name,
    membershipType: type,
  });
  const marie = { displayName: 'Marie Durand', email: 'marie@acme.test', userId: 'u-marie' };
  const paul = { displayName: 'Paul Lambert', email: 'Paul@Acme.test', userId: 'u-paul' };
  const lea = { displayName: 'Léa Roux', email: 'lea@fournisseur.test', userId: 'u-lea' };
  const empty = { value: [] };

  const routes = (paie: FakeRoute = { url: MEMBERS(TEAM, PAIE), json: { value: [marie] } }) => [
    { url: `${GRAPH}/me/joinedTeams`, json: TEAMS },
    {
      url: `${GRAPH}/me/teamwork/associatedTeams`,
      json: { value: [...TEAMS.value, { id: HOST, displayName: 'Fournisseur' }] },
    },
    {
      url: `${GRAPH}/teams/${TEAM}/allChannels`,
      json: {
        value: [
          channel(GENERAL, 'Général', 'standard'),
          channel(PAIE, 'Paie', 'private'),
          channel(PARTAGE, 'Livraisons', 'shared', HOST), // partagé avec l'équipe par l'autre entreprise
        ],
      },
    },
    { url: `${GRAPH}/teams/${TEAM}`, json: { visibility: 'public' } },
    paie,
    { url: MEMBERS(HOST, PARTAGE), json: { value: [marie, paul, lea] } },
    {
      url: `${GRAPH}/teams/${PRIVATE_TEAM}/allChannels`,
      json: { value: [channel(DIRECTION, 'Général', 'standard', PRIVATE_TEAM)] },
    },
    { url: `${GRAPH}/teams/${PRIVATE_TEAM}`, json: { visibility: 'private' } },
    { url: MEMBERS(PRIVATE_TEAM, DIRECTION), json: { value: [marie, paul] } },
    {
      url: `${GRAPH}/teams/${HOST}/allChannels`,
      json: {
        value: [
          channel(PARTAGE, 'Livraisons', 'shared', HOST), // déjà vu par l'équipe
          channel(AUTRE, 'Interne', 'standard', HOST), // pas un canal partagé : jamais lu
          channel(COMMANDES, 'Commandes', 'shared', HOST), // la personne en est membre directe
        ],
      },
    },
    { url: MEMBERS(HOST, COMMANDES), json: { value: [paul, lea] } },
    { url: MESSAGES(GENERAL), json: empty },
    { url: MESSAGES(PAIE), json: empty },
    { url: MESSAGES(PARTAGE, HOST), json: empty },
    { url: MESSAGES(DIRECTION, PRIVATE_TEAM), json: empty },
    { url: MESSAGES(COMMANDES, HOST), json: empty },
  ];

  it('lit les canaux privés et partagés, et ceux qu’une autre entreprise partage, dans l’équipe qui les héberge', async () => {
    const { paths, pages } = await run(teamsConnector, routes());

    expect(paths).toEqual([
      `${GRAPH}/me/joinedTeams`,
      `${GRAPH}/me/teamwork/associatedTeams`,
      `${GRAPH}/teams/${TEAM}/allChannels`,
      `${GRAPH}/teams/${TEAM}`,
      MEMBERS(TEAM, PAIE),
      MEMBERS(HOST, PARTAGE),
      `${GRAPH}/teams/${PRIVATE_TEAM}/allChannels`,
      `${GRAPH}/teams/${PRIVATE_TEAM}`,
      MEMBERS(PRIVATE_TEAM, DIRECTION),
      `${GRAPH}/teams/${HOST}/allChannels`,
      MEMBERS(HOST, COMMANDES),
      MESSAGES(GENERAL),
      MESSAGES(PAIE),
      MESSAGES(PARTAGE, HOST),
      MESSAGES(DIRECTION, PRIVATE_TEAM),
      MESSAGES(COMMANDES, HOST),
    ]);
    expect(cursorOf(pages).places).toEqual([
      {
        key: GENERAL,
        parent: TEAM,
        name: 'Général',
        origin: { team: 'Atelier Lebrun', channel: 'Général' },
      },
      {
        key: PAIE,
        parent: TEAM,
        name: 'Paie',
        origin: { team: 'Atelier Lebrun', channel: 'Paie' },
      },
      { key: PARTAGE, parent: HOST, name: 'Livraisons', origin: { channel: 'Livraisons' } },
      {
        key: DIRECTION,
        parent: PRIVATE_TEAM,
        name: 'Général',
        origin: { team: 'Direction', channel: 'Général' },
      },
      {
        key: COMMANDES,
        parent: HOST,
        name: 'Commandes',
        origin: { team: 'Fournisseur', channel: 'Commandes' },
      },
    ]);
  });

  it('dit qui est membre de chaque canal, sauf le canal standard d’une équipe publique, à toute l’équipe', async () => {
    const { pages } = await run(teamsConnector, routes());

    const who = (...people: (typeof marie)[]) =>
      people.map((person) => ({ email: person.email, id: person.userId, since: null }));
    expect(pages.flatMap((page) => page.audiences ?? [])).toEqual([
      { key: GENERAL, team: true },
      { key: PAIE, members: who(marie) },
      { key: PARTAGE, members: who(marie, paul, lea) },
      { key: DIRECTION, members: who(marie, paul) },
      { key: COMMANDES, members: who(paul, lea) },
    ]);
    // Qui est dans chaque lieu passe avant tout message : une page sans élément.
    expect(pages[0]?.items).toEqual([]);
  });

  it('passe un canal dont Microsoft refuse les membres, et lit les autres', async () => {
    const refused = {
      url: MEMBERS(TEAM, PAIE),
      status: 403,
      json: { error: { code: 'Forbidden' } },
    };
    const { paths, pages } = await run(
      teamsConnector,
      routes(refused).filter((route) => route.url !== MESSAGES(PAIE)),
    );

    expect(paths).not.toContain(MESSAGES(PAIE));
    expect(pages.flatMap((page) => page.audiences ?? []).map((a) => a.key)).toEqual([
      GENERAL,
      PARTAGE,
      DIRECTION,
      COMMANDES,
    ]);
  });
});

describe('teamsChatsConnector.sync', () => {
  const chats: FakeRoute = {
    url: `${GRAPH}/me/chats`,
    json: {
      value: [
        { id: GROUP, topic: 'Chantier Dubois', chatType: 'group', members: [] },
        {
          id: ONE,
          topic: null,
          chatType: 'oneOnOne',
          members: [
            { displayName: 'Marie Durand', email: 'marie@acme.test', userId: 'u-marie' },
            { displayName: 'Paul Lambert', email: 'paul@acme.test', userId: 'u-paul' },
          ],
        },
      ],
    },
  };
  const groupPage = {
    value: [
      message('1760436000000', '2026-10-14T10:00:00Z', 'On commande le carrelage ?'),
      deleted('1760435000000', '2026-10-14T09:43:20Z', '2026-10-14T09:50:00Z'),
      system('1760400000000', '2026-10-14T00:00:00Z'),
      message('1760300000000', '2026-10-12T20:13:20Z', 'Photos du chantier envoyées.', {
        webUrl: null,
      }),
    ],
  };
  // Les membres d'une conversation de groupe, avec le début de l'historique de chacun (Paul, ajouté sans le passé).
  const groupMembers: FakeRoute = {
    url: `${GRAPH}/chats/${encodeURIComponent(GROUP)}/members`,
    json: {
      value: [
        {
          displayName: 'Marie Durand',
          email: 'marie@acme.test',
          userId: 'u-marie',
          visibleHistoryStartDateTime: '0001-01-01T00:00:00Z',
        },
        {
          displayName: 'Paul Lambert',
          email: 'paul@acme.test',
          userId: 'u-paul',
          visibleHistoryStartDateTime: '2026-10-13T00:00:00Z',
        },
      ],
    },
  };
  const routes = (): FakeRoute[] => [
    chats,
    groupMembers,
    { url: CHAT(GROUP), json: groupPage },
    {
      url: CHAT(ONE),
      json: { value: [message('1760100000000', '2026-10-10T12:40:00Z', 'Merci !')] },
    },
    { url: CALENDAR, json: { value: [] } },
  ];

  it('lit chaque conversation par le filtre sur la date de modification, depuis la période choisie', async () => {
    const { calls, paths } = await run(teamsChatsConnector, routes());

    expect(paths).toEqual([
      `${GRAPH}/me/chats`,
      groupMembers.url,
      CHAT(GROUP),
      CHAT(ONE),
      CALENDAR,
    ]);
    expect(param(calls[0]?.url, '$expand')).toBe('members');
    expect(param(calls[2]?.url, '$orderby')).toBe('lastModifiedDateTime desc');
    expect(param(calls[2]?.url, '$filter')).toBe('lastModifiedDateTime gt 2026-10-01T00:00:00Z');
    expect(param(calls[2]?.url, '$top')).toBe('50');
  });

  it('dit qui est dans chaque conversation : les membres lus avec la liste pour un tête-à-tête, à part sinon', async () => {
    const { pages } = await run(teamsChatsConnector, routes());

    expect(pages.flatMap((page) => page.audiences ?? [])).toEqual([
      {
        key: GROUP,
        members: [
          { email: 'marie@acme.test', id: 'u-marie', since: '0001-01-01T00:00:00Z' },
          { email: 'paul@acme.test', id: 'u-paul', since: '2026-10-13T00:00:00Z' },
        ],
      },
      {
        key: ONE,
        members: [
          { email: 'marie@acme.test', id: 'u-marie', since: null },
          { email: 'paul@acme.test', id: 'u-paul', since: null },
        ],
      },
    ]);
  });

  it('passe une conversation dont Microsoft refuse les membres, et lit les autres', async () => {
    const { paths, pages } = await run(teamsChatsConnector, [
      chats,
      { ...groupMembers, status: 403, json: { error: { code: 'Forbidden' } } },
      { url: CHAT(ONE), json: { value: [] } },
      { url: CALENDAR, json: { value: [] } },
    ]);

    expect(paths).not.toContain(CHAT(GROUP));
    expect(pages.flatMap((page) => page.audiences ?? []).map((a) => a.key)).toEqual([ONE]);
  });

  it('fait un élément par conversation et par jour, et retire les messages supprimés', async () => {
    const { pages } = await run(teamsChatsConnector, routes());

    const items = pages.flatMap((page) => page.items);
    expect(items.map((item) => [item.externalId, item.title, item.turns.length])).toEqual([
      [`chat:${GROUP}:2026-10-12`, 'Chantier Dubois, 12/10/2026', 1],
      [`chat:${GROUP}:2026-10-14`, 'Chantier Dubois, 14/10/2026', 1],
      [`chat:${ONE}:2026-10-10`, 'Marie Durand, Paul Lambert, 10/10/2026', 1],
    ]);
    expect(items[0]).toMatchObject({
      nature: 'fil',
      url: null,
      origin: { chat: 'Chantier Dubois' },
    });
    expect(items.map((item) => item.audience)).toEqual([GROUP, GROUP, ONE]);
    expect(items[1]?.turns[0]?.externalId).toBe(`message:${GROUP}/1760436000000`);
    expect(pages.flatMap((page) => page.removedTurns ?? [])).toEqual([
      `message:${GROUP}/1760435000000`,
    ]);
    for (const item of items) expect(normalizeItem(item, 'teamschats')).not.toBeNull();
  });

  it('ne relit rien dans les 24 h, puis repart de la lecture de la veille', async () => {
    const first = await run(teamsChatsConnector, routes());
    const cursor = first.pages.at(-1)?.cursor;
    expect((await run(teamsChatsConnector, [], cursor)).calls).toEqual([]);

    vi.setSystemTime(new Date(LATER));
    const { calls } = await run(
      teamsChatsConnector,
      [
        chats,
        groupMembers,
        { url: CHAT(GROUP), json: { value: [] } },
        { url: CHAT(ONE), json: { value: [] } },
        { url: CALENDAR, json: { value: [] } },
      ],
      cursor,
    );

    expect(param(calls[2]?.url, '$filter')).toBe('lastModifiedDateTime gt 2026-10-15T07:55:00Z');
    // L'agenda repart un jour plus tôt : une transcription prête après la lecture de la veille.
    expect(param(calls[4]?.url, 'startDateTime')).toBe('2026-10-14T07:55:00Z');
  });
});

describe('teamsChatsConnector.sync : transcriptions des réunions', () => {
  const LINK =
    'https://teams.microsoft.com/l/meetup-join/19%3ameeting_NTg0@thread.v2/0?context=%7b%22Tid%22%3a%22t-1%22%7d';
  const MEETING = 'MSo1N2Y5ZGFjYy03MWJm';
  const TRANSCRIPT = 'MSMjMCMjZDAwYWU3NjUt';
  const MEETINGS = `${GRAPH}/me/onlineMeetings`;
  const TRANSCRIPTS = (meeting = MEETING) => `${MEETINGS}/${meeting}/transcripts`;
  const CONTENT = (id = TRANSCRIPT) => `${TRANSCRIPTS()}/${id}/content`;
  const noChats: FakeRoute = { url: `${GRAPH}/me/chats`, json: { value: [] } };
  const found = (id = MEETING): FakeRoute => ({ url: MEETINGS, json: { value: [{ id }] } });

  // Un événement de l'agenda et une transcription, sur le modèle des exemples de la doc.
  const event = (over: Record<string, unknown> = {}) => ({
    id: 'AAMkAGI1',
    subject: 'Point chantier Dubois',
    isCancelled: false,
    sensitivity: 'normal',
    onlineMeetingProvider: 'teamsForBusiness',
    onlineMeeting: { joinUrl: LINK },
    webLink: 'https://outlook.office365.com/owa/?itemid=AAMkAGI1',
    organizer: { emailAddress: { name: 'Marie Durand', address: 'marie@acme.test' } },
    attendees: [
      { type: 'required', emailAddress: { name: 'Robin Kline', address: 'robin@acme.test' } },
    ],
    ...over,
  });
  const transcript = (id = TRANSCRIPT, at = '2026-10-14T09:00:00Z') => ({
    id,
    meetingId: MEETING,
    createdDateTime: at,
    endDateTime: '2026-10-14T09:30:00Z',
  });
  const VTT = [
    'WEBVTT',
    '',
    '00:00:16.246 --> 00:00:17.726',
    '<v Marie Durand>Bonjour à tous.</v>',
    '',
    '00:00:18.000 --> 00:00:20.500',
    '<v Marie Durand>On commence par le devis.</v>',
    '',
    '01:02:03.004 --> 01:02:05.000',
    '<v Robin Kline>Il part demain.</v>',
    '',
  ].join('\n');

  it('lit les transcriptions des réunions Teams de l’agenda, depuis la veille de la période choisie', async () => {
    const { pages, calls, paths } = await run(teamsChatsConnector, [
      noChats,
      { url: CALENDAR, json: { value: [event()] } },
      found(),
      { url: TRANSCRIPTS(), json: { value: [transcript()] } },
      { url: CONTENT(), text: VTT, headers: { 'content-type': 'text/vtt' } },
    ]);

    expect(paths).toEqual([`${GRAPH}/me/chats`, CALENDAR, MEETINGS, TRANSCRIPTS(), CONTENT()]);
    expect(param(calls[1]?.url, 'startDateTime')).toBe('2026-09-30T00:00:00Z');
    expect(param(calls[1]?.url, 'endDateTime')).toBe('2026-10-15T08:00:00Z');
    expect(param(calls[1]?.url, '$select')).toContain('onlineMeeting');
    expect(param(calls[2]?.url, '$filter')).toBe(`JoinWebUrl eq '${LINK}'`);
    expect(calls[4]?.headers.accept).toBe('text/vtt');
    const items = pages.flatMap((page) => page.items);
    expect(items).toEqual([
      {
        externalId: `transcript:${TRANSCRIPT}`,
        nature: 'reunion',
        title: 'Point chantier Dubois',
        url: 'https://outlook.office365.com/owa/?itemid=AAMkAGI1',
        updatedAt: '2026-10-14T09:30:00.000Z',
        origin: { participants: 'Marie Durand, Robin Kline' },
        turns: [
          {
            externalId: 'speech:0',
            role: 'participant',
            author: { name: 'Marie Durand', email: 'marie@acme.test' },
            text: 'Bonjour à tous.\nOn commence par le devis.',
            ts: '2026-10-14T09:00:16.246Z',
          },
          {
            externalId: 'speech:2',
            role: 'participant',
            author: { name: 'Robin Kline', email: 'robin@acme.test' },
            text: 'Il part demain.',
            ts: '2026-10-14T10:02:03.004Z',
          },
        ],
        audience: `transcript:${TRANSCRIPT}`,
      },
    ]);
    for (const item of items) expect(normalizeItem(item, 'teamschats')).not.toBeNull();
    // Une transcription est visible des invités de la réunion : l'organisateur et les participants.
    expect(pages.flatMap((page) => page.audiences ?? [])).toEqual([
      {
        key: `transcript:${TRANSCRIPT}`,
        members: [
          { email: 'marie@acme.test', id: null },
          { email: 'robin@acme.test', id: null },
        ],
      },
    ]);
  });

  it('passe les réunions annulées, hors Teams ou privées, et ne lit qu’une fois le lien d’une série', async () => {
    const other = 'https://teams.microsoft.com/l/meetup-join/autre';
    const { paths, pages } = await run(teamsChatsConnector, [
      noChats,
      {
        url: CALENDAR,
        json: {
          value: [
            event({ isCancelled: true, onlineMeeting: { joinUrl: `${other}/1` } }),
            event({
              onlineMeetingProvider: 'skypeForBusiness',
              onlineMeeting: { joinUrl: `${other}/2` },
            }),
            event({ sensitivity: 'private', onlineMeeting: { joinUrl: `${other}/3` } }),
            event({ onlineMeetingProvider: 'unknown', onlineMeeting: null }),
            event(),
            event({ id: 'AAMkAGI2' }), // l'occurrence suivante de la série
          ],
        },
      },
      found(),
      { url: TRANSCRIPTS(), json: { value: [] } },
    ]);

    expect(paths).toEqual([`${GRAPH}/me/chats`, CALENDAR, MEETINGS, TRANSCRIPTS()]);
    expect(cursorOf(pages).read.reunions).toBe('2026-10-15T08:00:00.000Z');
  });

  it('passe une réunion fermée à Graph et les transcriptions déjà lues, sans arrêter la lecture', async () => {
    const closed = 'https://teams.microsoft.com/l/meetup-join/fermee';
    const { pages, paths } = await run(teamsChatsConnector, [
      noChats,
      { url: CALENDAR, json: { value: [event({ onlineMeeting: { joinUrl: closed } }), event()] } },
      found('fermee'),
      {
        url: TRANSCRIPTS('fermee'),
        status: 403,
        json: { error: { code: 'Forbidden', message: 'GraphAccessToTranscriptsDisabled' } },
      },
      found(),
      {
        url: TRANSCRIPTS(),
        json: { value: [transcript('ancienne', '2026-09-29T09:00:00Z'), transcript()] },
      },
      { url: CONTENT(), text: VTT },
    ]);

    expect(paths).not.toContain(CONTENT('ancienne'));
    expect(ids(pages)).toEqual([`transcript:${TRANSCRIPT}`]);
    expect(cursorOf(pages).read.reunions).toBe('2026-10-15T08:00:00.000Z');
  });

  it('relit une transcription sans les noms quand l’administrateur les a retirés', async () => {
    const { pages, calls } = await run(teamsChatsConnector, [
      noChats,
      { url: CALENDAR, json: { value: [event()] } },
      found(),
      { url: TRANSCRIPTS(), json: { value: [transcript()] } },
      { url: CONTENT(), status: 403, json: { error: { code: 'SpeakerAttributionNotAllowed' } } },
      {
        url: CONTENT(),
        text: 'WEBVTT\n\n00:00:16.246 --> 00:00:17.726\nBonjour à tous.\n\n00:00:21.000 --> 00:00:23.000\nIl part demain.\n',
      },
    ]);

    expect(calls.slice(-2).map((call) => call.headers.accept)).toEqual([
      'text/vtt',
      'application/vnd.microsoft.graph.transcript+text',
    ]);
    expect(pages.flatMap((page) => page.items)[0]?.turns).toEqual([
      {
        externalId: 'speech:0',
        role: 'participant',
        author: { name: null, email: null },
        text: 'Bonjour à tous.\nIl part demain.',
        ts: '2026-10-14T09:00:16.246Z',
      },
    ]);
  });

  it('garde d’un bloc un texte sans prise de parole datée, et rien d’un WebVTT vide', () => {
    const item = transcriptItem(event(), transcript(), 'Bonjour à tous. Il part demain.');

    expect(item?.turns).toEqual([
      {
        externalId: 'texte',
        role: 'participant',
        author: { name: null, email: null },
        text: 'Bonjour à tous. Il part demain.',
        ts: '2026-10-14T09:00:00.000Z',
      },
    ]);
    expect(transcriptItem(event(), transcript(), 'WEBVTT\n\n')).toBeNull();
  });
});

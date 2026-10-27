import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { intercomConnector } from './connector';
import conversation1001 from './fixtures/conversation-1001.json';
import conversation1002 from './fixtures/conversation-1002.json';
import conversation1003 from './fixtures/conversation-1003.json';
import conversation1004 from './fixtures/conversation-1004.json';
import conversation1005 from './fixtures/conversation-1005.json';
import me from './fixtures/me.json';
import searchPage1 from './fixtures/search-page-1.json';
import searchPage2 from './fixtures/search-page-2.json';

const HOST = 'api.eu.intercom.io';
const API = `https://${HOST}`;
const SEARCH = `${API}/conversations/search`;
const TOKEN = 'TOKENDETEST0123456789abcdefghijklmnop';
const config = { token: TOKEN, region: HOST } as const;
const SINCE = new Date('2026-09-15T00:00:00Z');
const SINCE_UNIX = 1789430400;
const NEXT = searchPage1.pages.next.starting_after;

type SearchBody = {
  query: { field: string; operator: string; value: number };
  sort: { field: string; order: string };
  pagination: { per_page: number; starting_after?: string };
};

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const bodyOf = (call: { body: unknown } | undefined) => call?.body as SearchBody;

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(intercomConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(intercomConnector.sync(config, state, http));
  return { pages, calls };
}

const search = (json: unknown): FakeRoute => ({ method: 'POST', url: SEARCH, json });
const detail = (id: string | number, json: unknown, status?: number): FakeRoute => ({
  url: `${API}/conversations/${id}`,
  json,
  status,
});

// Les deux pages de la fixture, puis le détail de chacune des cinq conversations.
function firstPassRoutes(): FakeRoute[] {
  return [
    search(searchPage1),
    search(searchPage2),
    detail(1001, conversation1001),
    detail(1002, conversation1002),
    detail(1003, conversation1003),
    detail(1004, conversation1004),
    detail(1005, conversation1005),
  ];
}

// Une conversation telle que la rend la recherche (sans les parties), pour les cas limites.
function searched(id: string, updatedAt: number, extra: Record<string, unknown> = {}) {
  return {
    type: 'conversation',
    id,
    title: `Sujet ${id}`,
    created_at: updatedAt - 600,
    updated_at: updatedAt,
    team_assignee_id: null,
    source: {
      type: 'conversation',
      body: `<p>Texte de ${id}</p>`,
      author: { type: 'user', id: 'c1', name: 'Claire Dubois', email: 'claire@dubois.test' },
    },
    ...extra,
  };
}

const list = (conversations: unknown[], next?: string) => ({
  type: 'conversation.list',
  conversations,
  total_count: conversations.length,
  pages: next
    ? { type: 'pages', next: { per_page: 100, starting_after: next } }
    : { type: 'pages' },
});

describe('Intercom : configuration', () => {
  const schema = intercomConnector.configSchema;

  it('accepte le jeton sans les espaces autour et une des trois régions', () => {
    expect(schema.parse({ token: `  ${TOKEN} `, region: 'api.au.intercom.io' })).toEqual({
      token: TOKEN,
      region: 'api.au.intercom.io',
    });
    expect(schema.safeParse({ token: TOKEN, region: 'api.intercom.io' }).success).toBe(true);
  });

  it('refuse une configuration incomplète ou une région qui n’est pas dans la liste', () => {
    expect(schema.safeParse({ region: HOST }).success).toBe(false);
    expect(schema.safeParse({ token: '   ', region: HOST }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN }).success).toBe(false);
    for (const region of ['evil.com', 'evil.com/x', 'api.eu.intercom.io.evil.com', '']) {
      expect(schema.safeParse({ token: TOKEN, region }).success, region).toBe(false);
    }
  });

  it('fixe l’hôte sur la région choisie et le champ à chiffrer sur le jeton', () => {
    for (const region of ['api.intercom.io', 'api.eu.intercom.io', 'api.au.intercom.io'] as const) {
      expect(intercomConnector.hosts({ token: TOKEN, region })).toEqual([region]);
    }
    expect(intercomConnector.secretFields).toEqual(['token']);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('intercom')).toBe(intercomConnector);
    const entry = listCatalog('fr').find((item) => item.id === 'intercom');
    expect(entry?.available).toBe(true);
    expect(entry?.fields.map((field) => field.name)).toEqual(['token', 'region']);
    expect(
      entry?.fields.find((field) => field.name === 'region')?.options?.map((o) => o.value),
    ).toEqual(['api.intercom.io', 'api.eu.intercom.io', 'api.au.intercom.io']);
  });
});

describe('Intercom : verify', () => {
  const searchRoute = search(list([]));

  it('lit l’administrateur du jeton, puis essaie la recherche, avec le jeton en Bearer et la version épinglée', async () => {
    const { http, calls } = testHttp(intercomConnector, config, [
      { url: `${API}/me`, json: me },
      searchRoute,
    ]);

    const result = await intercomConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (Acme)' });
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe(`${API}/me`);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers['intercom-version']).toBe('2.14');
    // La recherche prouve que le jeton a la permission de lire les conversations.
    expect(calls[1]?.method).toBe('POST');
    expect(calls[1]?.url).toBe(SEARCH);
    expect(bodyOf(calls[1]).pagination.per_page).toBe(1);
    expect(calls[1]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('appelle l’hôte de la région choisie', async () => {
    const australia = { token: TOKEN, region: 'api.au.intercom.io' } as const;
    const { http, calls } = testHttp(intercomConnector, australia, [
      { url: 'https://api.au.intercom.io/me', json: me },
      { method: 'POST', url: 'https://api.au.intercom.io/conversations/search', json: list([]) },
    ]);

    await intercomConnector.verify(australia, http);

    expect(calls.map((call) => new URL(call.url).host)).toEqual([
      'api.au.intercom.io',
      'api.au.intercom.io',
    ]);
  });

  it('refuse un jeton rejeté, sans le reprendre dans le message', async () => {
    const { http } = testHttp(intercomConnector, config, [
      {
        url: `${API}/me`,
        status: 401,
        json: { type: 'error.list', errors: [{ code: 'unauthorized' }] },
      },
    ]);

    const failure = await intercomConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
    expect((failure as Error).message).not.toContain(TOKEN);
  });

  it('se contente d’un compte générique quand le jeton ne peut pas lire les administrateurs', async () => {
    const { http } = testHttp(intercomConnector, config, [
      { url: `${API}/me`, status: 403 },
      searchRoute,
    ]);

    const result = await intercomConnector.verify(config, http);

    expect(result).toEqual({ account: 'Intercom' });
  });

  it('refuse un jeton qui ne peut pas lire les conversations', async () => {
    const { http } = testHttp(intercomConnector, config, [
      { url: `${API}/me`, json: me },
      { method: 'POST', url: SEARCH, status: 403 },
    ]);

    const failure = await intercomConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });
});

describe('Intercom : sync, premier passage', () => {
  it('cherche les conversations modifiées depuis since, de la plus ancienne à la plus récente, 100 par page', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(SEARCH);
    expect(bodyOf(calls[0])).toEqual({
      query: { field: 'updated_at', operator: '>', value: SINCE_UNIX },
      sort: { field: 'updated_at', order: 'ascending' },
      pagination: { per_page: 100 },
    });
  });

  it('envoie le jeton et la version de l’API dans les en-têtes seulement', async () => {
    const { calls } = await runSync(firstPassRoutes());

    for (const call of calls) {
      expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(call.headers['intercom-version']).toBe('2.14');
      expect(call.url).not.toContain(TOKEN);
    }
  });

  it('passe à la page suivante avec le curseur de la recherche, sans changer le filtre', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const searches = calls.filter((call) => call.method === 'POST');
    expect(searches).toHaveLength(2);
    expect(bodyOf(searches[1])).toEqual({
      ...bodyOf(searches[0]),
      pagination: { per_page: 100, starting_after: NEXT },
    });
  });

  it('lit le détail de chaque conversation, une fois', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.filter((call) => call.method === 'GET').map((call) => call.url)).toEqual(
      [1001, 1002, 1003, 1004, 1005].map((id) => `${API}/conversations/${id}`),
    );
  });

  it('rend une page par page de la recherche, dans l’ordre des modifications', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages.map((page) => page.items.length)).toEqual([3, 2]);
    expect(idsOf(pages)).toEqual([
      'conversation:1001',
      'conversation:1002',
      'conversation:1003',
      'conversation:1004',
      'conversation:1005',
    ]);
  });

  it('range la conversation en un tour par message, signé et daté, notes internes comprises', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)[0]).toEqual({
      externalId: 'conversation:1001',
      nature: 'fil',
      title: 'Conversation Intercom #1001',
      url: null,
      updatedAt: '2026-10-10T09:20:00.000Z',
      origin: { channel: 'conversation', team: '5017691' },
      turns: [
        {
          externalId: 'source',
          role: 'participant',
          author: { name: 'Claire Dubois (client)', email: 'claire@dubois.test' },
          side: 'external',
          internalNote: false,
          text: "Bonjour, je n'arrive plus à exporter mes factures en PDF.",
          ts: '2026-10-10T09:00:00.000Z',
        },
        {
          externalId: 'part:9001',
          role: 'participant',
          author: { name: 'Marie Durand (équipe)', email: 'marie@acme.test' },
          side: 'team',
          internalNote: false,
          text: 'Bonjour Claire, nous regardons ça tout de suite.\n\nQuel navigateur utilisez-vous ?',
          ts: '2026-10-10T09:05:00.000Z',
        },
        {
          externalId: 'part:9002',
          role: 'participant',
          author: { name: 'Marie Durand (équipe)', email: 'marie@acme.test' },
          side: 'team',
          internalNote: true,
          text: 'Bug connu côté export, ticket interne ouvert.',
          ts: '2026-10-10T09:12:00.000Z',
        },
        {
          externalId: 'part:9003',
          role: 'participant',
          author: { name: 'Claire Dubois (client)', email: 'claire@dubois.test' },
          side: 'external',
          internalNote: false,
          text: 'Chrome, version 141. Merci !',
          ts: '2026-10-10T09:14:00.000Z',
        },
      ],
    });
  });

  it('ne rend ni les affectations et fermetures, ni un message expurgé', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const ids = itemsOf(pages)[0]?.turns.map((turn) => turn.externalId);
    expect(ids).not.toContain('part:9004'); // affectation
    expect(ids).not.toContain('part:9005'); // fermeture
    expect(ids).not.toContain('part:9006'); // expurgé
  });

  it('passe le HTML d’un e-mail en texte, avec le sujet pour titre', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages)[1];
    expect(item?.title).toBe('Devis formation');
    expect(item?.origin).toEqual({ channel: 'email' });
    expect(item?.updatedAt).toBe('2026-10-12T14:30:00.000Z');
    expect(item?.turns.map((turn) => turn.text)).toEqual([
      'Bonjour,\nPouvez-vous nous envoyer le devis pour la formation de 5 personnes ?\n\n- Dates : 20 et 21 novembre\n- Lieu : Lyon',
      "Bonjour Luc, voici le devis : 4 800 € HT pour 5 personnes.\n\nJe vous l'envoie par e-mail avant jeudi.",
    ]);
    expect(item?.turns[1]?.author).toEqual({
      name: 'David Martin (équipe)',
      email: 'david@acme.test',
    });
    expect(item?.turns[1]?.ts).toBe('2026-10-12T14:30:00.000Z');
  });

  it('rend une conversation sans aucun texte sans tours (le socle l’écarte)', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages)[2];
    expect(item?.externalId).toBe('conversation:1003');
    expect(item?.turns).toEqual([]);
  });

  it('dit qui parle quand le nom manque : l’assistant automatique, ou l’équipe', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages)[3];
    expect(item?.turns.map((turn) => turn.author)).toEqual([
      { name: 'Sophie Bernard (client)', email: 'sophie@bernard.test' },
      { name: 'Fin (assistant automatique)', email: null },
      { name: 'Marie Durand (équipe)', email: 'marie@acme.test' },
      { name: 'Équipe', email: null },
    ]);
  });

  it('enregistre le curseur après chaque page : l’instant de la dernière conversation et ses numéros', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({ at: 1791880800, seen: ['1003'] });
    expect(cursorOf(pages[1])).toEqual({ at: 1791992700, seen: ['1005'] });
  });

  it('rend des dates que le socle accepte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of itemsOf(pages)) {
      // Une conversation sans texte est écartée par le socle, pour cette raison seulement.
      const accepted = normalizeItem(item, 'intercom') !== null;
      expect(accepted, item.externalId).toBe(item.turns.length > 0);
    }
  });

  it('ne rend aucune page quand rien n’a changé', async () => {
    const { pages, calls } = await runSync([search(list([]))]);

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('Intercom : sync, reprise et cas limites', () => {
  const T = 1791992700;

  it('reprend après le curseur : relit une seconde avant, écarte les conversations déjà rendues, garde les autres du même instant', async () => {
    const mark = { at: T, seen: ['2002'] };
    const routes = [
      search(
        list([
          searched('2001', T - 1),
          searched('2002', T),
          searched('2003', T),
          searched('2004', T + 60),
        ]),
      ),
      detail(2003, searched('2003', T)),
      detail(2004, searched('2004', T + 60)),
    ];

    const { pages, calls } = await runSync(routes, { cursor: JSON.stringify(mark) });

    expect(bodyOf(calls[0]).query.value).toBe(T - 1);
    expect(idsOf(pages)).toEqual(['conversation:2003', 'conversation:2004']);
    expect(cursorOf(pages.at(-1))).toEqual({ at: T + 60, seen: ['2004'] });
  });

  it('ne refait pas la première page quand on repasse le dernier curseur rendu', async () => {
    const first = await runSync(firstPassRoutes());
    const last = first.pages.at(-1)?.cursor ?? null;

    const { pages, calls } = await runSync([search(list([searched('1005', T)]))], { cursor: last });

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1); // aucun détail relu
    expect(bodyOf(calls[0]).query.value).toBe(T - 1);
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync([search(list([]))], { cursor: 'pas du JSON' });

    expect(bodyOf(calls[0]).query.value).toBe(SINCE_UNIX);
  });

  it('range par numéro les conversations modifiées à la même seconde', async () => {
    const routes = [
      search(list([searched('2010', T), searched('2009', T)])),
      detail(2009, searched('2009', T)),
      detail(2010, searched('2010', T)),
    ];

    const { pages } = await runSync(routes);

    expect(idsOf(pages)).toEqual(['conversation:2009', 'conversation:2010']);
    expect(cursorOf(pages[0])).toEqual({ at: T, seen: ['2009', '2010'] });
  });

  it('ne rend jamais deux fois la même conversation quand la recherche la répète', async () => {
    const routes = [
      search(list([searched('2020', T)], 'page-2')),
      search(list([searched('2020', T), searched('2021', T + 5)])),
      detail(2020, searched('2020', T)),
      detail(2021, searched('2021', T + 5)),
    ];

    const { pages } = await runSync(routes);

    expect(idsOf(pages)).toEqual(['conversation:2020', 'conversation:2021']);
  });

  it('ne tourne pas en rond quand la recherche rend toujours le même curseur', async () => {
    const routes = [
      search(list([searched('2030', T)], 'toujours-le-meme')),
      search(list([searched('2031', T + 5)], 'toujours-le-meme')),
      detail(2030, searched('2030', T)),
      detail(2031, searched('2031', T + 5)),
    ];

    const { pages, calls } = await runSync(routes);

    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(2);
    expect(idsOf(pages)).toEqual(['conversation:2030', 'conversation:2031']);
  });

  it('range par date les messages, quel que soit l’ordre de la réponse', async () => {
    const part = (id: string, at: number) => ({
      id,
      part_type: 'comment',
      body: `<p>Message ${id}</p>`,
      created_at: at,
      author: { type: 'admin', id: '7', name: 'David Martin' },
    });
    const full = searched('2040', T, {
      conversation_parts: { conversation_parts: [part('b', T - 100), part('a', T - 200)] },
    });

    const { pages } = await runSync([search(list([searched('2040', T)])), detail(2040, full)]);

    expect(itemsOf(pages)[0]?.turns.map((turn) => turn.externalId)).toEqual([
      'source',
      'part:a',
      'part:b',
    ]);
  });

  it('ne prend pour des messages que les réponses et les notes, même si un autre type porte du texte', async () => {
    const full = searched('2050', T, {
      conversation_parts: {
        conversation_parts: [
          { id: '1', part_type: 'assignment', body: '<p>Affectée à Marie</p>', created_at: T - 90 },
          { id: '2', part_type: 'note_and_reopen', body: '<p>À reprendre</p>', created_at: T - 60 },
          { id: '3', part_type: 'comment', body: '<p></p>', created_at: T - 30 },
        ],
      },
    });

    const { pages } = await runSync([search(list([searched('2050', T)])), detail(2050, full)]);

    expect(
      itemsOf(pages)[0]?.turns.map((turn) => [turn.externalId, turn.text, turn.internalNote]),
    ).toEqual([
      ['source', 'Texte de 2050', false],
      ['part:2', 'À reprendre', true],
    ]);
  });

  it('reconnaît l’assistant automatique à l’indicateur de l’outil, et lit des numéros donnés en nombres', async () => {
    const bot = searched('3001', T, {
      id: 3001,
      source: {
        type: 'conversation',
        body: '<p>Bonjour, comment puis-je vous aider ?</p>',
        author: { type: 'admin', id: 7, name: 'Fin', from_ai_agent: true },
      },
    });

    const { pages } = await runSync([search(list([bot])), detail(3001, bot)]);

    expect(itemsOf(pages)[0]?.externalId).toBe('conversation:3001');
    expect(itemsOf(pages)[0]?.turns[0]?.author).toEqual({
      name: 'Fin (assistant automatique)',
      email: null,
    });
    // L'assistant automatique n'est ni l'équipe ni un client : pas de côté.
    expect(itemsOf(pages)[0]?.turns[0]?.side).toBeUndefined();
  });

  it('tolère les champs en plus et sans titre ni sujet donne un titre par défaut', async () => {
    const odd = searched('2060', T, { title: null, nouveauChamp: { a: 1 } });

    const { pages } = await runSync([search(list([odd])), detail(2060, odd)]);

    expect(itemsOf(pages)[0]?.title).toBe('Conversation Intercom #2060');
    expect(itemsOf(pages)[0]?.origin).toEqual({ channel: 'conversation' });
  });
});

describe('Intercom : ressources secondaires', () => {
  const T = 1791992700;
  const one = () => [search(list([searched('2100', T)]))];

  it.each([403, 404])(
    'rend la conversation avec son seul premier message quand le détail répond %i',
    async (status) => {
      const { pages } = await runSync([...one(), detail(2100, undefined, status)]);

      const item = itemsOf(pages)[0];
      expect(item?.externalId).toBe('conversation:2100');
      expect(item?.turns.map((turn) => turn.externalId)).toEqual(['source']);
      expect(item?.turns[0]?.author).toEqual({
        name: 'Claire Dubois (client)',
        email: 'claire@dubois.test',
      });
    },
  );

  it('remonte un 401 sur le détail comme une clé refusée', async () => {
    const failure = await runSync([...one(), detail(2100, undefined, 401)]).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });
});

describe('Intercom : erreurs', () => {
  it.each([401, 403])('remonte un %i sur la recherche comme une clé refusée', async (status) => {
    const failure = await runSync([{ method: 'POST', url: SEARCH, status }]).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });

  it('garde la première page quand le jeton est retiré au milieu du passage', async () => {
    const { http } = testHttp(intercomConnector, config, [
      search(searchPage1),
      detail(1001, conversation1001),
      detail(1002, conversation1002),
      detail(1003, conversation1003),
      { method: 'POST', url: SEARCH, status: 401 },
    ]);
    const pages: SyncPage[] = [];
    let failure: unknown;

    try {
      for await (const page of intercomConnector.sync(
        config,
        { cursor: null, since: SINCE },
        http,
      )) {
        pages.push(page);
      }
    } catch (error) {
      failure = error;
    }

    expect(pages).toHaveLength(1);
    expect(cursorOf(pages[0])).toEqual({ at: 1791880800, seen: ['1003'] });
    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse une réponse qui n’est pas du JSON, sans en reprendre le texte', async () => {
    const failure = await runSync([
      { method: 'POST', url: SEARCH, text: `<html>erreur ${TOKEN}</html>` },
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Unreadable response');
  });

  it('refuse une réponse qui n’a pas la forme attendue, sans en reprendre le texte', async () => {
    const failure = await runSync([search({ conversations: 'secret', echo: TOKEN })]).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Unexpected response');
    expect((failure as Error).message).not.toContain(TOKEN);
  });
});

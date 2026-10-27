import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { freshdeskConnector } from './connector';
import agentMe from './fixtures/agent-me.json';
import agents from './fixtures/agents.json';
import conversations101 from './fixtures/conversations-101.json';
import conversations1031 from './fixtures/conversations-103-1.json';
import conversations1032 from './fixtures/conversations-103-2.json';
import conversations104 from './fixtures/conversations-104.json';
import tickets1 from './fixtures/tickets-1.json';
import tickets2 from './fixtures/tickets-2.json';

const BASE = 'https://acme.freshdesk.com/api/v2';
const ME = `${BASE}/agents/me`;
const AGENTS = `${BASE}/agents`;
const TICKETS = `${BASE}/tickets`;
const conversationsOf = (id: number) => `${TICKETS}/${id}/conversations`;
const KEY = 'cle-de-test-0123456789';
const config = { domain: 'acme', apiKey: KEY };
const BASIC = `Basic ${Buffer.from(`${KEY}:X`).toString('base64')}`;
const SINCE = new Date('2026-09-15T00:00:00Z');
const FROM_SINCE = '2026-09-14T23:59:59Z'; // une seconde avant since
const NEXT_TICKETS = `${TICKETS}?updated_since=${encodeURIComponent(FROM_SINCE)}&order_by=updated_at&order_type=asc&include=requester%2Cdescription&per_page=50&page=2`;
const NEXT_CONVERSATIONS = `${conversationsOf(103)}?page=2`;
const link = (url: string) => ({ link: `<${url}>; rel="next"` });

// Toutes les routes d'un premier passage : deux pages de tickets, l'annuaire des agents (une fois),
// et les conversations de chaque ticket (celles du 103 sur deux pages).
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: TICKETS, json: tickets1, headers: link(NEXT_TICKETS) },
    { url: AGENTS, json: agents },
    { url: conversationsOf(101), json: conversations101 },
    { url: conversationsOf(102), json: [] },
    { url: conversationsOf(103), json: conversations1031, headers: link(NEXT_CONVERSATIONS) },
    { url: conversationsOf(103), json: conversations1032 },
    { url: TICKETS, json: tickets2 },
    { url: conversationsOf(104), json: conversations104 },
    { url: conversationsOf(105), json: [] },
  ];
}

async function runSync(routes: FakeRoute[], overrides: { cursor?: string | null } = {}) {
  const { http, calls } = testHttp(freshdeskConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: SINCE };
  const pages = await collect(freshdeskConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) => new URL(url ?? '').searchParams;
const turnIds = (item: ConnectorItem | undefined) => item?.turns.map((turn) => turn.externalId);
const ticket = (id: number) => [...tickets1, ...tickets2].find((row) => row.id === id);

describe('freshdesk : configuration', () => {
  const schema = freshdeskConnector.configSchema;

  it('accepte un domaine et une clé, sans les espaces autour, avec le domaine en minuscules', () => {
    const parsed = schema.parse({ domain: ' Acme ', apiKey: ` ${KEY} ` });

    expect(parsed).toEqual(config);
  });

  it('refuse un domaine qui n’est pas un sous-domaine simple', () => {
    const invalid = ['evil.com/x', 'a.b', 'a_b', '-acme', '', 'acme.freshdesk.com', 'a b'];
    for (const domain of invalid) {
      expect(schema.safeParse({ ...config, domain }).success, domain).toBe(false);
    }
  });

  it('refuse une configuration incomplète ou une clé vide', () => {
    expect(schema.safeParse({ apiKey: KEY }).success).toBe(false);
    expect(schema.safeParse({ domain: 'acme' }).success).toBe(false);
    expect(schema.safeParse({ ...config, apiKey: '   ' }).success).toBe(false);
  });

  it('fixe l’hôte d’après le domaine, le champ à chiffrer et l’écart entre deux requêtes', () => {
    expect(freshdeskConnector.hosts(config)).toEqual(['acme.freshdesk.com']);
    expect(freshdeskConnector.secretFields).toEqual(['apiKey']);
    expect(freshdeskConnector.minIntervalMs).toBe(1000);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('freshdesk')).toBe(freshdeskConnector);
    const entry = listCatalog('fr').find((item) => item.id === 'freshdesk');
    expect(entry?.available).toBe(true);
    expect(entry?.triedForReal).toBe(false);
  });
});

describe('freshdesk : verify', () => {
  it('lit l’agent de la clé avec l’authentification de base (clé:X) et nomme le domaine', async () => {
    const { http, calls } = testHttp(freshdeskConnector, config, [{ url: ME, json: agentMe }]);

    const result = await freshdeskConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (acme)' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(ME);
    expect(calls[0]?.headers).toMatchObject({ authorization: BASIC, accept: 'application/json' });
  });

  it('se rabat sur l’adresse, puis sur le domaine, quand l’agent n’a pas de nom', async () => {
    const noName = { ...agentMe, contact: { ...agentMe.contact, name: null } };
    const noContact = { id: 1 };
    for (const [answer, expected] of [
      [noName, 'marie@acme.test (acme)'],
      [noContact, 'acme'],
    ] as const) {
      const { http } = testHttp(freshdeskConnector, config, [{ url: ME, json: answer }]);

      const result = await freshdeskConnector.verify(config, http);

      expect(result.account).toBe(expected);
    }
  });

  it('refuse une clé rejetée (401) ou une API fermée au plan (403)', async () => {
    for (const status of [401, 403]) {
      const { http } = testHttp(freshdeskConnector, config, [{ url: ME, status }]);

      await expect(freshdeskConnector.verify(config, http), String(status)).rejects.toBeInstanceOf(
        ConnectorAuthError,
      );
    }
  });

  it('dit que le domaine est introuvable quand Freshdesk répond 404 ou redirige', async () => {
    for (const status of [404, 302]) {
      const { http } = testHttp(freshdeskConnector, config, [{ url: ME, status }]);

      const failure = await freshdeskConnector
        .verify(config, http)
        .catch((error: unknown) => error);

      expect(failure, String(status)).toBeInstanceOf(ConnectorHttpError);
      expect((failure as Error).message).toBe('Freshdesk domain not found: check the domain name');
    }
  });
});

describe('freshdesk : sync, premier passage', () => {
  it('demande les tickets modifiés depuis since, du plus ancien au plus récent, avec description et demandeur', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const first = new URL(calls[0]?.url ?? '');
    expect(first.origin + first.pathname).toBe(TICKETS);
    expect(Object.fromEntries(first.searchParams)).toEqual({
      updated_since: FROM_SINCE,
      order_by: 'updated_at',
      order_type: 'asc',
      include: 'requester,description',
      per_page: '50',
    });
  });

  it('envoie l’authentification de base à chaque requête, pages suivantes comprises', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(9);
    for (const call of calls) expect(call.headers).toMatchObject({ authorization: BASIC });
  });

  it('suit le lien de la page suivante des tickets, et celui des conversations', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const urls = calls.map((call) => call.url);
    expect(urls.filter((url) => url.startsWith(`${TICKETS}?`))).toEqual([
      calls[0]?.url,
      NEXT_TICKETS,
    ]);
    expect(urls).toContain(NEXT_CONVERSATIONS);
  });

  it('rend deux pages : celle des tickets, puis la suivante', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(2);
    expect(idsOf(pages.slice(0, 1))).toEqual(['ticket:101', 'ticket:102', 'ticket:103']);
    expect(idsOf(pages.slice(1))).toEqual(['ticket:104', 'ticket:105']);
  });

  it('rend un ticket avec sa description, puis ses conversations, notes internes marquées', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[0]?.items[0]).toEqual({
      externalId: 'ticket:101',
      nature: 'fil',
      title: "#101 Facture en double sur l'abonnement",
      url: 'https://acme.freshdesk.com/a/tickets/101',
      updatedAt: '2026-10-09T10:15:00Z',
      origin: { domain: 'acme', group: '2', company: '7' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Claire Bernard', email: 'claire@client.test' },
          side: 'external',
          text: "Bonjour,\n\nNous avons été facturés deux fois pour l'abonnement d'octobre (facture n° 2026-1042).\nPouvez-vous régulariser ?",
          ts: '2026-10-09T10:15:00Z',
        },
        {
          externalId: 'conversation:9001',
          role: 'participant',
          author: { name: 'Claire Bernard', email: 'claire@client.test' },
          side: 'external',
          internalNote: false,
          text: 'Bonjour, je précise que la deuxième facture date du 3 octobre.',
          ts: '2026-10-08T14:00:00Z',
        },
        {
          externalId: 'conversation:9002',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          side: 'team',
          internalNote: false,
          text: "Bonjour Claire,\n\nC'est bien une erreur de notre côté. Nous remboursons la facture du 3 octobre d'ici vendredi.",
          ts: '2026-10-09T09:00:00Z',
        },
        {
          externalId: 'conversation:9003',
          role: 'participant',
          author: { name: 'Paul Martin', email: 'paul@acme.test' },
          side: 'team',
          internalNote: true,
          text: 'Le remboursement est validé par la comptabilité, à faire partir lundi.',
          ts: '2026-10-09T10:15:00Z',
        },
      ],
    });
  });

  it('rend un ticket sans texte sans tours, pour que le curseur avance', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const empty = pages[0]?.items[1];
    expect(empty?.title).toBe('#102 Appel manqué');
    expect(empty?.origin).toEqual({ domain: 'acme' });
    expect(empty?.turns).toEqual([]);
  });

  it('passe le HTML en texte quand le texte brut manque, pour la description comme pour les conversations', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = pages[0]?.items[2];
    expect(item?.turns[0]?.text).toBe(
      'Le tableau de bord ne charge plus depuis ce matin.\n\n- Chrome\n- Firefox',
    );
    expect(item?.turns[1]?.text).toBe(
      'Même problème sur un autre poste :\nle tableau de bord reste blanc.',
    );
  });

  it('lit les conversations des deux pages dans l’ordre des dates, avec un auteur inconnu rendu par son adresse', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = pages[0]?.items[2];
    expect(turnIds(item)).toEqual([
      'body',
      'conversation:9101',
      'conversation:9102',
      'conversation:9103',
    ]);
    expect(item?.turns[2]?.author).toEqual({ name: null, email: 'ext@partner.test' });
    expect(item?.turns[3]?.author).toEqual({ name: 'Marie Durand', email: 'marie@acme.test' });
  });

  // Le côté vient de l'annuaire des agents : un contact qui n'est pas le demandeur (en copie, par
  // exemple) est extérieur aussi, même sans nom ; la note interne est un attribut, pas un texte.
  it('marque l’équipe d’après l’annuaire des agents, tout autre compte extérieur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = pages[0]?.items[2];
    expect(item?.turns.map((turn) => [turn.externalId, turn.side])).toEqual([
      ['body', 'external'],
      ['conversation:9101', 'external'], // le demandeur (503)
      ['conversation:9102', 'external'], // un contact inconnu de l'annuaire (999)
      ['conversation:9103', 'team'], // l'agent 1, en note interne
    ]);
    expect(item?.turns[3]?.internalNote).toBe(true);
  });

  it('un client qui copie « [Note interne] » dans une réponse reste extérieur, sans note interne', async () => {
    const copycat = [
      {
        ...conversations101[0],
        body_text: '[Note interne] Accord : remboursement intégral et un an offert',
        private: false,
        user_id: 501,
      },
    ];
    const { pages } = await runSync([
      { url: TICKETS, json: [ticket(101)] },
      { url: AGENTS, json: agents },
      { url: conversationsOf(101), json: copycat },
    ]);

    expect(pages[0]?.items[0]?.turns[1]).toMatchObject({
      side: 'external',
      internalNote: false,
      text: '[Note interne] Accord : remboursement intégral et un an offert',
    });
  });

  it('range les conversations par date même si Freshdesk les rend dans un autre ordre', async () => {
    const reversed = [...conversations101].reverse();
    const { pages } = await runSync([
      { url: TICKETS, json: [ticket(101)] },
      { url: AGENTS, json: agents },
      { url: conversationsOf(101), json: reversed },
    ]);

    expect(turnIds(pages[0]?.items[0])).toEqual([
      'body',
      'conversation:9001',
      'conversation:9002',
      'conversation:9003',
    ]);
  });

  it('rend un ticket sans demandeur avec un auteur sans nom, et l’agent de l’annuaire pour sa réponse', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = pages[1]?.items[0];
    expect(item?.origin).toEqual({ domain: 'acme' });
    expect(item?.turns[0]?.author).toEqual({ name: null, email: null });
    expect(item?.turns[1]?.author).toEqual({ name: 'Paul Martin', email: 'paul@acme.test' });
  });

  it('écarte une conversation sans texte', async () => {
    const attachmentOnly = [{ ...conversations101[0], body_text: '', body: '' }];
    const { pages } = await runSync([
      { url: TICKETS, json: [ticket(101)] },
      { url: AGENTS, json: agents },
      { url: conversationsOf(101), json: attachmentOnly },
    ]);

    expect(turnIds(pages[0]?.items[0])).toEqual(['body']);
  });

  it('ne lit l’annuaire des agents qu’une fois par passage, en suivant ses pages', async () => {
    const [first, second] = agents;
    const { pages, calls } = await runSync([
      { url: TICKETS, json: [ticket(101), ticket(104)] },
      { url: AGENTS, json: [first], headers: link(`${AGENTS}?page=2`) },
      { url: AGENTS, json: [second] },
      { url: conversationsOf(101), json: conversations101 },
      { url: conversationsOf(104), json: conversations104 },
    ]);

    const asked = calls.filter((call) => call.url.startsWith(AGENTS));
    expect(asked.map((call) => paramsOf(call.url).get('page'))).toEqual([null, '2']);
    expect(pages[0]?.items[1]?.turns[1]?.author.name).toBe('Paul Martin');
  });

  it('rend des éléments que le socle accepte, avec des dates ISO canoniques', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(5);
    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'freshdesk');
      if (item.turns.length === 0) {
        expect(normalized, item.externalId).toBeNull();
      } else {
        expect(normalized, item.externalId).not.toBeNull();
        expect(normalized?.updatedAt).toBe(new Date(item.updatedAt).toISOString());
      }
    }
    const first = normalizeItem(itemsOf(pages)[0] as ConnectorItem, 'freshdesk');
    expect(first?.turns.map((turn) => turn.ts.toISOString())).toEqual([
      '2026-10-09T10:15:00.000Z',
      '2026-10-08T14:00:00.000Z',
      '2026-10-09T09:00:00.000Z',
      '2026-10-09T10:15:00.000Z',
    ]);
  });
});

describe('freshdesk : sync, ressources secondaires et erreurs', () => {
  it('rend le ticket avec sa seule description quand Freshdesk refuse ses conversations (403)', async () => {
    const { pages } = await runSync([
      { url: TICKETS, json: [ticket(101)] },
      { url: AGENTS, json: agents },
      { url: conversationsOf(101), status: 403 },
    ]);

    expect(turnIds(pages[0]?.items[0])).toEqual(['body']);
  });

  it('rend le ticket sans conversations quand il a disparu entre la liste et la lecture (404)', async () => {
    const { pages } = await runSync([
      { url: TICKETS, json: [ticket(101)] },
      { url: AGENTS, json: agents },
      { url: conversationsOf(101), status: 404 },
    ]);

    expect(turnIds(pages[0]?.items[0])).toEqual(['body']);
  });

  it('rend des auteurs sans nom quand Freshdesk refuse la liste des agents (403)', async () => {
    const { pages } = await runSync([
      { url: TICKETS, json: [ticket(101)] },
      { url: AGENTS, status: 403 },
      { url: conversationsOf(101), json: conversations101 },
    ]);

    const turns = pages[0]?.items[0]?.turns ?? [];
    expect(turns[1]?.author).toEqual({ name: 'Claire Bernard', email: 'claire@client.test' });
    expect(turns[2]?.author).toEqual({ name: null, email: 'support@acme.freshdesk.com' });
    expect(turns[3]?.author).toEqual({ name: null, email: null });
    // Sans annuaire, seul le demandeur a un côté connu.
    expect(turns.map((turn) => turn.side)).toEqual(['external', 'external', undefined, undefined]);
  });

  it('remonte une clé rejetée (401) sur les conversations', async () => {
    const run = runSync([
      { url: TICKETS, json: [ticket(101)] },
      { url: AGENTS, json: agents },
      { url: conversationsOf(101), status: 401 },
    ]);

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('remonte une clé rejetée (401) sur la liste des tickets', async () => {
    const run = runSync([{ url: TICKETS, status: 401 }]);

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse une date sans fuseau dans un ticket, sans reprendre le texte reçu', async () => {
    const odd = [{ ...ticket(101), updated_at: '2026-10-09 10:15:00' }];

    const failure = await runSync([{ url: TICKETS, json: odd }]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Unexpected response');
  });

  it('refuse un lien de page suivante qui pointe vers un autre hôte', async () => {
    const run = runSync([
      {
        url: TICKETS,
        json: [ticket(102)],
        headers: link('https://evil.example/api/v2/tickets?page=2'),
      },
      { url: AGENTS, json: agents },
      { url: conversationsOf(102), json: [] },
    ]);

    const failure = await run.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Address not allowed');
  });
});

describe('freshdesk : sync, reprise', () => {
  const cursorAfterFirstPage = JSON.stringify({ at: '2026-10-10T07:00:00Z', seen: [102, 103] });
  const cursorAfterLastPage = JSON.stringify({ at: '2026-10-12T14:00:00Z', seen: [105] });

  it('écrit les curseurs : l’instant du dernier ticket et les tickets lus à cet instant', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({ at: '2026-10-10T07:00:00Z', seen: [102, 103] });
    expect(cursorOf(pages[1])).toEqual({ at: '2026-10-12T14:00:00Z', seen: [105] });
  });

  it('reprend une seconde avant le curseur et ne rend que les tickets pas encore lus', async () => {
    const { pages, calls } = await runSync(
      [
        { url: TICKETS, json: [ticket(102), ticket(103), ...tickets2] },
        { url: AGENTS, json: agents },
        { url: conversationsOf(104), json: conversations104 },
        { url: conversationsOf(105), json: [] },
      ],
      { cursor: cursorAfterFirstPage },
    );

    expect(paramsOf(calls[0]?.url).get('updated_since')).toBe('2026-10-10T06:59:59Z');
    expect(idsOf(pages)).toEqual(['ticket:104', 'ticket:105']);
  });

  it('ne refait pas la première page avec le dernier curseur', async () => {
    const { pages, calls } = await runSync([{ url: TICKETS, json: [ticket(105)] }], {
      cursor: cursorAfterLastPage,
    });

    expect(paramsOf(calls[0]?.url).get('updated_since')).toBe('2026-10-12T13:59:59Z');
    expect(calls).toHaveLength(1);
    expect(pages).toEqual([]);
  });

  it('ignore le ticket déjà rendu au même instant, et rend l’autre', async () => {
    const cursor = JSON.stringify({ at: '2026-10-10T07:00:00Z', seen: [102] });

    const { pages } = await runSync(
      [
        { url: TICKETS, json: [ticket(102), ticket(103)] },
        { url: AGENTS, json: agents },
        { url: conversationsOf(103), json: conversations1031 },
      ],
      { cursor },
    );

    expect(idsOf(pages)).toEqual(['ticket:103']);
    expect(cursorOf(pages[0])).toEqual({ at: '2026-10-10T07:00:00Z', seen: [102, 103] });
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync([{ url: TICKETS, json: [] }], { cursor: 'pas du json' });

    expect(paramsOf(calls[0]?.url).get('updated_since')).toBe(FROM_SINCE);
  });
});

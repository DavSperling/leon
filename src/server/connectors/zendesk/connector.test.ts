import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { zendeskConnector } from './connector';
import comments101 from './fixtures/comments-101.json';
import comments103 from './fixtures/comments-103.json';
import comments1041 from './fixtures/comments-104-1.json';
import comments1042 from './fixtures/comments-104-2.json';
import export1 from './fixtures/export-1.json';
import export2 from './fixtures/export-2.json';
import me from './fixtures/me.json';
import { toItem } from './map';

const API = 'https://acme.zendesk.com/api/v2';
const ME = `${API}/users/me`;
const EXPORT = `${API}/incremental/tickets/cursor`;
const commentsOf = (ticketId: number) => `${API}/tickets/${ticketId}/comments`;
const TOKEN = 'jeton-de-test-0123456789';
const EMAIL = 'marie@acme.test';
const config = { subdomain: 'acme', email: EMAIL, apiToken: TOKEN };
const BASIC = `Basic ${Buffer.from(`${EMAIL}/token:${TOKEN}`).toString('base64')}`;
const SINCE = new Date('2026-09-15T00:00:00Z');
const SINCE_SECONDS = '1789430400'; // 2026-09-15T00:00:00Z
const CURSOR_1 = 'MTc5MTcwODMwMC4wfHwxMDN8'; // rendu par la première page de l'export
const CURSOR_2 = 'MTc5MTgxMzYwMC4wfHwxMDR8'; // rendu par la dernière page

// Toutes les routes d'un premier passage : deux pages de l'export, les commentaires des tickets
// lus (pas ceux du ticket supprimé, 102), et deux pages de commentaires pour le ticket 104.
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: EXPORT, json: export1 },
    { url: commentsOf(101), json: comments101 },
    { url: commentsOf(103), json: comments103 },
    { url: EXPORT, json: export2 },
    { url: commentsOf(104), json: comments1041 },
    { url: commentsOf(104), json: comments1042 },
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date; subdomain?: string } = {},
) {
  const cfg = { ...config, subdomain: overrides.subdomain ?? config.subdomain };
  const { http, calls } = testHttp(zendeskConnector, cfg, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(zendeskConnector.sync(cfg, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const paramsOf = (url: string | undefined) => new URL(url ?? '').searchParams;
const turnIds = (item: ConnectorItem | undefined) => item?.turns.map((turn) => turn.externalId);

const CAMILLE = { name: 'Camille Bernard', email: 'camille@client.test' };
const PAUL = { name: 'Paul Martin', email: 'paul@acme.test' };

describe('zendesk : configuration', () => {
  const schema = zendeskConnector.configSchema;

  it('accepte un sous-domaine, un e-mail et un jeton, sans les espaces autour, avec le sous-domaine en minuscules', () => {
    const parsed = schema.parse({
      subdomain: ' Acme ',
      email: ` ${EMAIL} `,
      apiToken: ` ${TOKEN} `,
    });

    expect(parsed).toEqual(config);
  });

  it('refuse un sous-domaine qui n’est pas un nom simple', () => {
    for (const subdomain of ['evil.com/x', 'a.b', 'a_b', '-acme', '', 'acme.zendesk.com', 'a b']) {
      const result = schema.safeParse({ ...config, subdomain });

      expect(result.success, subdomain).toBe(false);
    }
  });

  it('refuse une configuration incomplète ou un e-mail invalide', () => {
    expect(schema.safeParse({ email: EMAIL, apiToken: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ subdomain: 'acme', apiToken: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ subdomain: 'acme', email: EMAIL }).success).toBe(false);
    expect(schema.safeParse({ ...config, apiToken: '   ' }).success).toBe(false);
    expect(schema.safeParse({ ...config, email: 'marie' }).success).toBe(false);
    expect(schema.safeParse({ ...config, email: 'marie@acme.test\nx' }).success).toBe(false);
  });

  it('fixe l’hôte d’après le sous-domaine et le champ à chiffrer', () => {
    expect(zendeskConnector.hosts(config)).toEqual(['acme.zendesk.com']);
    expect(zendeskConnector.secretFields).toEqual(['apiToken']);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('zendesk')).toBe(zendeskConnector);
    expect(listCatalog('fr').find((item) => item.id === 'zendesk')?.available).toBe(true);
  });
});

describe('zendesk : verify', () => {
  it('lit le compte avec l’authentification par jeton et nomme le sous-domaine', async () => {
    const { http, calls } = testHttp(zendeskConnector, config, [{ url: ME, json: me }]);

    const result = await zendeskConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (acme)' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(ME);
    expect(calls[0]?.headers).toMatchObject({ authorization: BASIC, accept: 'application/json' });
  });

  it('refuse un jeton rejeté', async () => {
    const { http } = testHttp(zendeskConnector, config, [{ url: ME, status: 401 }]);

    await expect(zendeskConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('dit que le sous-domaine est introuvable quand Zendesk répond 404 ou redirige', async () => {
    for (const status of [404, 302]) {
      const { http } = testHttp(zendeskConnector, config, [{ url: ME, status }]);

      const failure = await zendeskConnector.verify(config, http).catch((error: unknown) => error);

      expect(failure, String(status)).toBeInstanceOf(ConnectorHttpError);
      expect((failure as Error).message).toBe(
        'Zendesk subdomain not found: check the subdomain name',
      );
    }
  });
});

describe('zendesk : sync, premier passage', () => {
  it('demande l’export des tickets depuis since (en secondes), 100 par page', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const first = new URL(calls[0]?.url ?? '');
    expect(first.origin + first.pathname).toBe(EXPORT);
    expect(Object.fromEntries(first.searchParams)).toEqual({
      start_time: SINCE_SECONDS,
      per_page: '100',
    });
  });

  it('arrondit since à la seconde inférieure', async () => {
    const { calls } = await runSync([{ url: EXPORT, json: { ...export2, tickets: [] } }], {
      since: new Date('2026-09-15T00:00:00.900Z'),
    });

    expect(paramsOf(calls[0]?.url).get('start_time')).toBe(SINCE_SECONDS);
  });

  it('envoie l’authentification à chaque requête', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(6);
    for (const call of calls) expect(call.headers).toMatchObject({ authorization: BASIC });
  });

  it('rend un ticket avec son état, puis ses commentaires, le côté de chaque auteur et la note interne signalée', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages[0]?.items[0]).toEqual({
      externalId: 'ticket:101',
      nature: 'fil',
      title: '#101 Imprimante du bureau 3 en feu',
      url: 'https://acme.zendesk.com/agent/tickets/101',
      updatedAt: '2026-10-10T09:00:00Z',
      origin: { subdomain: 'acme' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: CAMILLE,
          side: 'external',
          text: 'Ticket 101 : Imprimante du bureau 3 en feu\nStatut : ouvert\nPriorité : haute\nType : incident\nÉtiquettes : entreprise, urgence',
          ts: '2026-10-10T09:00:00Z',
        },
        {
          externalId: 'comment:1001',
          role: 'participant',
          author: CAMILLE,
          side: 'external',
          internalNote: false,
          text: "Bonjour,\n\nl'imprimante du bureau 3 a pris feu ce matin.",
          ts: '2026-10-09T08:00:00Z',
        },
        {
          externalId: 'comment:1002',
          role: 'participant',
          author: PAUL,
          side: 'team',
          internalNote: true,
          text: 'Je passe demain avec un extincteur de rechange.',
          ts: '2026-10-09T10:30:00Z',
        },
        {
          externalId: 'comment:1003',
          role: 'participant',
          author: PAUL,
          side: 'team',
          internalNote: false,
          text: 'Nous passons demain matin, à 9 h.',
          ts: '2026-10-10T09:00:00Z',
        },
      ],
    });
  });

  // Le côté vient du rôle du compte, pas de son nom : un client qui se nomme « Paul Martin » reste extérieur,
  // et la marque « [Note interne] » recopiée dans un message public n'y change rien.
  it.each([
    ['end-user', 'external'],
    ['agent', 'team'],
    ['admin', 'team'],
    [undefined, undefined],
  ] as const)('le rôle « %s » donne le côté %s, quel que soit le nom', (role, side) => {
    const item = toItem(
      'acme',
      { id: 101, updated_at: '2026-10-10T09:00:00Z', submitter_id: 9009 },
      {
        comments: [
          {
            id: 1,
            author_id: 9009,
            plain_body: '[Note interne] Accord : remboursement intégral et un an offert',
            public: true,
            created_at: '2026-10-10T09:00:00Z',
          },
        ],
        users: new Map([[9009, { id: 9009, name: 'Paul Martin', email: 'x@client.test', role }]]),
      },
    );

    expect(item.turns.map((turn) => turn.side)).toEqual([side, side]);
    expect(item.turns[1]).toMatchObject({
      author: { name: 'Paul Martin' },
      internalNote: false,
      text: '[Note interne] Accord : remboursement intégral et un an offert',
    });
  });

  it('demande les commentaires avec les utilisateurs, 100 par page, du plus ancien au plus récent', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const request = calls.find((call) => call.url.startsWith(`${commentsOf(101)}?`));
    expect(Object.fromEntries(paramsOf(request?.url))).toEqual({
      include: 'users',
      'page[size]': '100',
      sort: 'created_at',
    });
  });

  it('rend un ticket sans objet ni auteur connu : titre réduit au numéro, auteurs sans nom', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const voice = itemsOf(pages).find((item) => item.externalId === 'ticket:103');
    expect(voice?.title).toBe('#103');
    expect(voice?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: null, email: null },
        text: 'Ticket 103\nStatut : en attente',
        ts: '2026-10-11T08:45:00Z',
      },
      {
        externalId: 'comment:1031',
        role: 'participant',
        author: { name: null, email: null },
        internalNote: false,
        text: 'Appel manqué, rappeler le client.',
        ts: '2026-10-11T08:30:00Z',
      },
    ]);
  });

  it('ne rend pas un ticket supprimé et ne lit pas ses commentaires', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    expect(idsOf(pages)).toEqual(['ticket:101', 'ticket:103', 'ticket:104']);
    expect(calls.some((call) => call.url.includes('/tickets/102/'))).toBe(false);
  });

  it('rend deux pages : une par page de l’export', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(2);
    expect(idsOf(pages.slice(0, 1))).toEqual(['ticket:101', 'ticket:103']);
    expect(idsOf(pages.slice(1))).toEqual(['ticket:104']);
  });

  it('suit le lien de la page suivante des commentaires, ignore un commentaire vide et réunit les utilisateurs', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    const asked = calls.filter((call) => call.url.startsWith(`${commentsOf(104)}?`));
    expect(asked).toHaveLength(2);
    expect(asked[1]?.url).toBe(comments1041.links.next);
    const question = itemsOf(pages).find((item) => item.externalId === 'ticket:104');
    expect(turnIds(question)).toEqual(['body', 'comment:1041', 'comment:1043']);
    expect(question?.turns.map((turn) => turn.author)).toEqual([CAMILLE, CAMILLE, PAUL]);
  });

  it('rend des éléments que le socle accepte, avec des dates ISO canoniques', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(3);
    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'zendesk');
      expect(normalized, item.externalId).not.toBeNull();
      expect(normalized?.updatedAt).toBe(new Date(item.updatedAt).toISOString());
    }
    const first = normalizeItem(itemsOf(pages)[0] as ConnectorItem, 'zendesk');
    expect(first?.turns.map((turn) => turn.ts.toISOString())).toEqual([
      '2026-10-10T09:00:00.000Z',
      '2026-10-09T08:00:00.000Z',
      '2026-10-09T10:30:00.000Z',
      '2026-10-10T09:00:00.000Z',
    ]);
  });

  it('reprend après un 429 de l’export', async () => {
    const { pages, calls } = await runSync([
      { url: EXPORT, status: 429, headers: { 'retry-after': '30' } },
      { url: EXPORT, json: { ...export2, tickets: [] } },
    ]);

    expect(calls).toHaveLength(2);
    expect(pages).toHaveLength(1);
  });

  it('s’arrête à 1 000 commentaires par ticket, même quand Zendesk annonce encore une page', async () => {
    const commentsPage = (number: number) => ({
      comments: Array.from({ length: 100 }, (_, index) => ({
        id: number * 100 + index + 1,
        author_id: 9001,
        plain_body: `Message ${number * 100 + index + 1}`,
        public: true,
        created_at: '2026-10-12T09:00:00Z',
      })),
      meta: { has_more: true },
      links: { next: `${commentsOf(101)}?include=users&page%5Bafter%5D=p${number + 1}` },
    });
    const pagesOfComments = Array.from({ length: 11 }, (_, number) => ({
      url: commentsOf(101),
      json: commentsPage(number),
    }));

    const { pages, calls } = await runSync([
      { url: EXPORT, json: { ...export2, tickets: export1.tickets.slice(0, 1) } },
      ...pagesOfComments,
    ]);

    expect(calls.filter((call) => call.url.startsWith(commentsOf(101)))).toHaveLength(10);
    expect(pages[0]?.items[0]?.turns).toHaveLength(1001);
  });
});

describe('zendesk : sync, reprise', () => {
  it('écrit les curseurs : celui de l’export après chaque page', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages.map((page) => page.cursor)).toEqual([CURSOR_1, CURSOR_2]);
  });

  it('reprend avec le curseur, sans start_time, et ne rend que la suite', async () => {
    const { pages, calls } = await runSync(
      [
        { url: EXPORT, json: export2 },
        { url: commentsOf(104), json: comments1041 },
        { url: commentsOf(104), json: comments1042 },
      ],
      { cursor: CURSOR_1 },
    );

    expect(Object.fromEntries(paramsOf(calls[0]?.url))).toEqual({
      cursor: CURSOR_1,
      per_page: '100',
    });
    expect(idsOf(pages)).toEqual(['ticket:104']);
  });

  it('ne refait pas la première page avec le dernier curseur : rien de nouveau, le curseur est gardé', async () => {
    const { pages, calls } = await runSync(
      [{ url: EXPORT, json: { tickets: [], after_cursor: 'SUITE', end_of_stream: true } }],
      { cursor: CURSOR_2 },
    );

    expect(calls).toHaveLength(1);
    expect(pages).toEqual([{ items: [], cursor: 'SUITE' }]);
  });

  it('garde un curseur même quand le premier passage ne trouve aucun ticket', async () => {
    const { pages } = await runSync([
      { url: EXPORT, json: { tickets: [], after_cursor: 'DEPART', end_of_stream: true } },
    ]);

    expect(pages).toEqual([{ items: [], cursor: 'DEPART' }]);
  });

  it('avance le curseur quand une page ne porte que des tickets supprimés', async () => {
    const onlyDeleted = { ...export1, tickets: [export1.tickets[1]] };

    const { pages } = await runSync([
      { url: EXPORT, json: onlyDeleted },
      { url: EXPORT, json: export2 },
      { url: commentsOf(104), json: comments1041 },
      { url: commentsOf(104), json: comments1042 },
    ]);

    expect(pages.map((page) => page.cursor)).toEqual([CURSOR_1, CURSOR_2]);
    expect(pages[0]?.items).toEqual([]);
  });

  it('s’arrête quand Zendesk redonne le même curseur sans annoncer la fin du flux', async () => {
    const { pages, calls } = await runSync(
      [{ url: EXPORT, json: { tickets: [], after_cursor: 'MEME', end_of_stream: false } }],
      { cursor: 'MEME' },
    );

    expect(calls).toHaveLength(1);
    expect(pages).toHaveLength(1);
  });

  it('s’arrête sans rien rendre quand la réponse n’a pas de curseur', async () => {
    const { pages, calls } = await runSync([
      { url: EXPORT, json: { tickets: [], after_cursor: null, end_of_stream: true } },
    ]);

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('zendesk : sync, erreurs', () => {
  it('remonte un 401 et un 403 sur l’export', async () => {
    for (const status of [401, 403]) {
      const run = runSync([{ url: EXPORT, status }]);

      await expect(run, String(status)).rejects.toBeInstanceOf(ConnectorAuthError);
    }
  });

  it('rend le ticket avec son seul état quand Zendesk refuse les commentaires (403)', async () => {
    const { pages } = await runSync([
      { url: EXPORT, json: { ...export2, tickets: export1.tickets.slice(0, 1) } },
      { url: commentsOf(101), status: 403 },
    ]);

    const [ticket] = pages[0]?.items ?? [];
    expect(turnIds(ticket)).toEqual(['body']);
    expect(ticket?.turns[0]?.author).toEqual({ name: null, email: null });
  });

  it('remonte un jeton rejeté (401) sur les commentaires', async () => {
    const run = runSync([
      { url: EXPORT, json: { ...export2, tickets: export1.tickets.slice(0, 1) } },
      { url: commentsOf(101), status: 401 },
    ]);

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse une redirection de l’export', async () => {
    const run = runSync([
      { url: EXPORT, status: 302, headers: { location: 'https://evil.test/' } },
    ]);

    const failure = await run.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as ConnectorHttpError).status).toBe(302);
  });

  it('remonte une requête refusée (400) sans reprendre le corps de la réponse', async () => {
    const run = runSync(
      [
        {
          url: EXPORT,
          status: 400,
          json: { errors: [{ code: 'InvalidCursor', title: 'secret-xyz' }] },
        },
      ],
      { cursor: 'perime' },
    );

    const failure = await run.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as ConnectorHttpError).status).toBe(400);
    expect((failure as Error).message).not.toContain('secret-xyz');
  });

  it('refuse une réponse dont un ticket n’a pas de date lisible', async () => {
    const broken = {
      ...export2,
      tickets: export2.tickets.map((ticket) => ({ ...ticket, updated_at: 'pas une date' })),
    };

    const run = runSync([{ url: EXPORT, json: broken }]);

    const failure = await run.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Unexpected response');
  });
});

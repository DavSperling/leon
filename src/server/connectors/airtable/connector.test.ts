import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { airtableConnector } from './connector';
import bases from './fixtures/bases.json';
import commentsKf from './fixtures/comments-recKfM3xQ8wTn2PzA.json';
import commentsQd from './fixtures/comments-recQd9vHb2nXk5RtB.json';
import clientsPage1 from './fixtures/records-clients-page-1.json';
import clientsPage2 from './fixtures/records-clients-page-2.json';
import reunions from './fixtures/records-reunions.json';
import tables from './fixtures/tables-appLkNDICXNqxSDhG.json';
import whoami from './fixtures/whoami.json';

const API = 'https://api.airtable.com/v0';
const BASE = 'appLkNDICXNqxSDhG';
const OTHER_BASE = 'appSW9R5uCNmRmfl6';
const CLIENTS = 'tblClients00000001';
const REUNIONS = 'tblReunions0000001';
const TOKEN = 'patTESTjeton0123456789.abcdef0123456789abcdef0123456789';
const OAUTH_TOKEN = 'JETONOAUTHDETEST0123456789';
const config = { authMode: 'key' as const, token: TOKEN, bases: [BASE] };
const oauthConfig = {
  authMode: 'oauth' as const,
  accessToken: OAUTH_TOKEN,
  refreshToken: 'REFRESHDETEST0123456789',
  expiresAt: '2026-10-15T13:00:00.000Z',
  bases: [] as string[],
};

const NOW = new Date('2026-10-15T12:00:00.000Z');
const SINCE = new Date('2026-10-10T00:00:00.000Z'); // une seule fenêtre de 7 jours
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const KF = 'recKfM3xQ8wTn2PzA';
const QD = 'recQd9vHb2nXk5RtB';
const TE = 'recTe6yUg1mJp8SoC';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const basesRoute: FakeRoute = { url: `${API}/meta/bases`, json: bases };
const tablesRoute = (json: unknown = tables, base = BASE): FakeRoute => ({
  url: `${API}/meta/bases/${base}/tables`,
  json,
});
const recordsRoute = (table: string, json: unknown, base = BASE): FakeRoute => ({
  method: 'POST',
  url: `${API}/${base}/${table}/listRecords`,
  json,
});
const commentsRoute = (
  table: string,
  record: string,
  json?: unknown,
  extra: Partial<FakeRoute> = {},
): FakeRoute => ({ url: `${API}/${BASE}/${table}/${record}/comments`, json, ...extra });

// Un premier passage sur les deux tables : Clients (deux pages de 2 enregistrements, dont un vide)
// et Réunions. Les commentaires ne sont lus que pour les enregistrements qui en annoncent.
function firstPassRoutes(): FakeRoute[] {
  return [
    basesRoute,
    tablesRoute(),
    recordsRoute(CLIENTS, clientsPage1),
    recordsRoute(CLIENTS, clientsPage2),
    commentsRoute(CLIENTS, KF, commentsKf),
    commentsRoute(CLIENTS, QD, commentsQd),
    recordsRoute(REUNIONS, reunions),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: {
    cursor?: string | null;
    since?: Date;
    config?: typeof config | typeof oauthConfig;
  } = {},
) {
  const used = overrides.config ?? config;
  const { http, calls } = testHttp(airtableConnector, used, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(airtableConnector.sync(used, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const recordCalls = (calls: Array<{ method: string; url: string; body: unknown }>) =>
  calls.filter((call) => call.method === 'POST');
const bodyOf = (call: { body: unknown } | undefined) => call?.body as Record<string, unknown>;
const formula = (from: Date | number, to: Date | number) =>
  `AND(IS_AFTER(LAST_MODIFIED_TIME(), "${new Date(from).toISOString()}"), NOT(IS_AFTER(LAST_MODIFIED_TIME(), "${new Date(to).toISOString()}")))`;
const recordUrl = (table: string, record: string) =>
  `https://airtable.com/${BASE}/${table}/${record}`;

describe('airtable : configuration', () => {
  const schema = airtableConnector.configSchema;

  it('accepte un jeton et des bases, sans les espaces autour', () => {
    expect(schema.parse({ token: `  ${TOKEN} `, bases: [` ${BASE} `] })).toEqual({
      authMode: 'key',
      token: TOKEN,
      bases: [BASE],
    });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({ token: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ bases: [BASE] }).success).toBe(false);
    expect(schema.safeParse({ token: '   ', bases: [BASE] }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN, bases: [] }).success).toBe(false);
  });

  it.each([
    ['une table', 'tblClients00000001'],
    ['un chemin', 'appLkNDICXNqxSDhG/../meta'],
    ['une chaîne vide', ''],
    ['un identifiant trop court', 'app'],
    ['un espace', 'appLkNDIC XNqxSDhG'],
  ])('refuse %s comme identifiant de base', (_name, value) => {
    expect(schema.safeParse({ token: TOKEN, bases: [value] }).success).toBe(false);
  });

  it('refuse plus de 20 bases', () => {
    const many = Array.from(
      { length: 21 },
      (_, i) => `appLkNDICXNqxS${String(i).padStart(3, '0')}`,
    );
    expect(schema.safeParse({ token: TOKEN, bases: many }).success).toBe(false);
  });

  it('fixe l’hôte, le champ à chiffrer et le rythme des requêtes (5 par seconde et par base)', () => {
    expect(airtableConnector.hosts(config)).toEqual(['api.airtable.com']);
    expect(airtableConnector.secretFields).toEqual(['token']);
    expect(airtableConnector.minIntervalMs).toBeGreaterThanOrEqual(200);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('airtable')).toBe(airtableConnector);
    const entry = listCatalog().find((item) => item.id === 'airtable');
    expect(entry?.available).toBe(true);
    expect(entry?.fields.map((f) => [f.name, f.kind])).toEqual([
      ['token', 'secret'],
      ['bases', 'list'],
    ]);
  });
});

describe('airtable : verify', () => {
  it('lit le compte, les bases puis les tables de chaque base, avec le jeton en « Bearer »', async () => {
    const { http, calls } = testHttp(airtableConnector, config, [
      { url: `${API}/meta/whoami`, json: whoami },
      basesRoute,
      tablesRoute(),
    ]);

    const result = await airtableConnector.verify(config, http);

    expect(result).toEqual({
      account: 'marie@acme.test (Acme CRM)',
      accountKey: 'usrL2PNC5o3H4lBEi:appLkNDICXNqxSDhG',
    });
    expect(calls.map((call) => call.url)).toEqual([
      `${API}/meta/whoami`,
      `${API}/meta/bases`,
      `${API}/meta/bases/${BASE}/tables`,
    ]);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('nomme chaque base, et l’identifiant du compte quand le jeton ne donne pas l’adresse', async () => {
    const two = { ...config, bases: [BASE, OTHER_BASE] };
    const { http } = testHttp(airtableConnector, two, [
      { url: `${API}/meta/whoami`, json: { id: whoami.id } },
      basesRoute,
      tablesRoute(),
      tablesRoute(tables, OTHER_BASE),
    ]);

    expect(await airtableConnector.verify(two, http)).toEqual({
      account: 'usrL2PNC5o3H4lBEi (Acme CRM, Produit)',
      accountKey: 'usrL2PNC5o3H4lBEi:appLkNDICXNqxSDhG:appSW9R5uCNmRmfl6',
    });
  });

  // Audit 5 n° 1 : l'identifiant de reconnexion porte les bases lues, triées ; d'autres bases du même utilisateur
  // sont un autre compte (« autre_compte » à la reconnexion).
  it('même utilisateur, autre base : un autre identifiant', async () => {
    const other = { ...config, bases: [OTHER_BASE] };
    const { http } = testHttp(airtableConnector, other, [
      { url: `${API}/meta/whoami`, json: whoami },
      basesRoute,
      tablesRoute(tables, OTHER_BASE),
    ]);
    const reversed = { ...config, bases: [OTHER_BASE, BASE] };
    const both = testHttp(airtableConnector, reversed, [
      { url: `${API}/meta/whoami`, json: whoami },
      basesRoute,
      tablesRoute(tables, OTHER_BASE),
      tablesRoute(),
    ]);

    expect(await airtableConnector.verify(other, http)).toEqual({
      account: 'marie@acme.test (Produit)',
      accountKey: 'usrL2PNC5o3H4lBEi:appSW9R5uCNmRmfl6',
    });
    expect((await airtableConnector.verify(reversed, both.http)).accountKey).toBe(
      'usrL2PNC5o3H4lBEi:appLkNDICXNqxSDhG:appSW9R5uCNmRmfl6',
    );
  });

  it('refuse un jeton rejeté', async () => {
    const { http } = testHttp(airtableConnector, config, [
      { url: `${API}/meta/whoami`, status: 401 },
    ]);

    await expect(airtableConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it.each([403, 404])('nomme la base que le jeton ne voit pas (%i)', async (status) => {
    const two = { ...config, bases: [BASE, OTHER_BASE] };
    const { http } = testHttp(airtableConnector, two, [
      { url: `${API}/meta/whoami`, json: whoami },
      basesRoute,
      tablesRoute(),
      { url: `${API}/meta/bases/${OTHER_BASE}/tables`, status },
    ]);

    const failure = await airtableConnector.verify(two, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe(`Base Airtable inaccessible : ${OTHER_BASE}`);
    expect((failure as ConnectorHttpError).status).toBe(status); // une erreur de saisie, pas une panne
  });
});

describe('airtable : sync, premier passage', () => {
  it('demande les bases, les tables, puis les enregistrements modifiés depuis since', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls[0]?.url).toBe(`${API}/meta/bases`);
    expect(calls[1]?.url).toBe(`${API}/meta/bases/${BASE}/tables`);
    const first = recordCalls(calls)[0];
    expect(first?.url).toBe(`${API}/${BASE}/${CLIENTS}/listRecords`);
    expect(bodyOf(first)).toEqual({
      filterByFormula: formula(SINCE, NOW),
      pageSize: 100,
      recordMetadata: ['commentCount'],
    });
  });

  it('suit l’offset de la première page jusqu’à la dernière', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const [first, second] = recordCalls(calls);
    expect(bodyOf(first).offset).toBeUndefined();
    expect(bodyOf(second)).toEqual({
      filterByFormula: formula(SINCE, NOW),
      pageSize: 100,
      recordMetadata: ['commentCount'],
      offset: 'itrP4kZ0aVx2Lm9Qe/recNb4tYc7sLw1QeD',
    });
  });

  it('envoie le jeton en « Bearer » à chaque requête', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls).toHaveLength(7);
    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('range le corps (« Champ : valeur », sans pièces jointes ni liens) puis les commentaires', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) => i.externalId.endsWith(KF));
    expect(item).toEqual({
      externalId: `record:${BASE}/${CLIENTS}/${KF}`,
      nature: 'note',
      title: 'Clients : Acme SAS',
      url: recordUrl(CLIENTS, KF),
      updatedAt: '2026-10-15T12:00:00.000Z',
      origin: { base: 'Acme CRM', table: 'Clients' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'David Martin', email: 'david@acme.test' },
          text: [
            'Nom : Acme SAS',
            'Notes :\nRenouvellement du contrat prévu en janvier.\nContact principal : Marie Durand.',
            'Statut : Client actif',
            'Tags : industrie, Paris',
            'Contact : Marie Durand',
            'Actif : oui',
            'Montant : 12000',
            'Dernier échange : 2026-10-12T09:30:00.000Z',
          ].join('\n'),
          ts: '2026-10-15T12:00:00.000Z',
        },
        {
          externalId: 'comment:comB5z37Mg9zaEPw6',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Le client veut un devis avant fin octobre.',
          ts: '2026-10-11T09:00:00.000Z',
        },
        {
          externalId: 'comment:comeNPu0X9K4Rxzid',
          role: 'participant',
          author: { name: 'David Martin', email: 'david@acme.test' },
          text: "D'accord, je prépare le devis. Merci @Marie Durand",
          ts: '2026-10-11T10:00:00.000Z',
        },
      ],
    });
  });

  it('rend les enregistrements dans l’ordre de leur identifiant, une page par table', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(2);
    expect(pages[0]?.items.map((i) => i.externalId.split('/').pop())).toEqual([
      'recKfM3xQ8wTn2PzA',
      'recNb4tYc7sLw1QeD',
      'recQd9vHb2nXk5RtB',
    ]);
    expect(pages[1]?.items.map((i) => i.title)).toEqual(['Réunions : Point trimestriel Acme']);
  });

  it('ne demande les commentaires que des enregistrements qui en annoncent', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const asked = calls.filter((call) => call.url.endsWith('/comments')).map((c) => c.url);
    expect(asked).toEqual([
      `${API}/${BASE}/${CLIENTS}/${KF}/comments`,
      `${API}/${BASE}/${CLIENTS}/${QD}/comments`,
    ]);
  });

  it('sans nombre de commentaires dans la réponse, demande les commentaires de chaque enregistrement', async () => {
    const unknown = {
      records: [{ id: KF, createdTime: '2026-09-02T08:15:00.000Z', fields: { Nom: 'Acme SAS' } }],
    };
    const { pages, calls } = await runSync([
      basesRoute,
      tablesRoute(),
      recordsRoute(CLIENTS, unknown),
      commentsRoute(CLIENTS, KF, commentsKf),
      recordsRoute(REUNIONS, { records: [] }),
    ]);

    expect(calls.filter((c) => c.url.endsWith('/comments'))).toHaveLength(1);
    expect(itemsOf(pages)[0]?.turns).toHaveLength(3);
  });

  it('prend pour auteur du corps le dernier à l’avoir modifié, à défaut de créateur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) => i.title.startsWith('Réunions'));
    expect(item?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'Marie Durand', email: 'marie@acme.test' },
        text: "Titre : Point trimestriel Acme\nCompte rendu :\n## Décisions\n\n- Reconduire le contrat pour un an.\n- Marie prépare l'avenant.",
        ts: '2026-10-15T12:00:00.000Z',
      },
    ]);
  });

  it('rend un auteur sans nom ni créateur connu avec ce qu’on sait', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const [nb, qd] = [
      itemsOf(pages).find((i) => i.externalId.endsWith('recNb4tYc7sLw1QeD')),
      itemsOf(pages).find((i) => i.externalId.endsWith(QD)),
    ];
    expect(nb?.turns[0]?.author).toEqual({ name: null, email: null });
    expect(qd?.turns[1]?.author).toEqual({ name: null, email: 'david@acme.test' });
  });

  it('ne lit qu’une fois une base nommée deux fois', async () => {
    const twice = { ...config, bases: [BASE, BASE] };
    const { http, calls } = testHttp(airtableConnector, twice, [
      basesRoute,
      tablesRoute(),
      recordsRoute(CLIENTS, { records: [] }),
      recordsRoute(REUNIONS, { records: [] }),
    ]);

    await collect(airtableConnector.sync(twice, { cursor: null, since: SINCE }, http));

    expect(calls.filter((call) => call.url.endsWith('/tables'))).toHaveLength(1);
    expect(recordCalls(calls)).toHaveLength(2);
  });

  it('ne rend pas un enregistrement vide, mais le curseur le dépasse', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages).some((i) => i.externalId.endsWith(TE))).toBe(false);
    expect(cursorOf(pages[0])[`${BASE}/${CLIENTS}`]).toEqual({
      from: NOW.getTime(),
      to: null,
      after: null,
    });
  });

  it('range le curseur de chaque table au bout de la fenêtre lue', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const done = { from: NOW.getTime(), to: null, after: null };
    expect(cursorOf(pages.at(-1))).toEqual({
      [`${BASE}/${CLIENTS}`]: done,
      [`${BASE}/${REUNIONS}`]: done,
    });
  });

  it('rend des dates que le socle accepte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of itemsOf(pages))
      expect(normalizeItem(item, 'airtable'), item.externalId).not.toBeNull();
  });

  it('garde le nom de la base en repli sur son identifiant, si la liste ne la donne pas', async () => {
    const { pages } = await runSync([
      { url: `${API}/meta/bases`, json: { bases: [] } },
      tablesRoute(),
      recordsRoute(CLIENTS, clientsPage2),
      commentsRoute(CLIENTS, QD, commentsQd),
      recordsRoute(REUNIONS, { records: [] }),
    ]);

    expect(itemsOf(pages)[0]?.origin).toEqual({ base: BASE, table: 'Clients' });
  });
});

describe('airtable : listes paginées', () => {
  const [kf, nb] = clientsPage1.records;

  it('suit l’offset de la liste des bases', async () => {
    const two = { ...config, bases: [BASE, OTHER_BASE] };
    const [first, second] = bases.bases;
    const { http, calls } = testHttp(airtableConnector, two, [
      { url: `${API}/meta/whoami`, json: whoami },
      { url: `${API}/meta/bases`, json: { bases: [first], offset: 'itrBases1/appLkNDICXNqxSDhG' } },
      { url: `${API}/meta/bases`, json: { bases: [second] } },
      tablesRoute(),
      tablesRoute(tables, OTHER_BASE),
    ]);

    const result = await airtableConnector.verify(two, http);

    expect(result.account).toBe('marie@acme.test (Acme CRM, Produit)');
    expect(new URL(calls[2]?.url ?? '').searchParams.get('offset')).toBe(
      'itrBases1/appLkNDICXNqxSDhG',
    );
  });

  it('suit l’offset des commentaires d’un enregistrement', async () => {
    const older = {
      id: 'comOl1Dc0mm3nt4Xy',
      author: { id: 'usrL2PNC5o3H4lBEi', email: 'marie@acme.test', name: 'Marie Durand' },
      text: 'Premier échange par téléphone.',
      createdTime: '2026-10-09T08:00:00.000Z',
      lastUpdatedTime: null,
    };
    const { pages, calls } = await runSync([
      basesRoute,
      tablesRoute(),
      recordsRoute(CLIENTS, { records: [kf] }),
      commentsRoute(CLIENTS, KF, { ...commentsKf, offset: 'itrCom1/comOl1Dc0mm3nt4Xy' }),
      commentsRoute(CLIENTS, KF, { comments: [older], offset: null }),
      recordsRoute(REUNIONS, { records: [] }),
    ]);

    const asked = calls.filter((call) => call.url.includes('/comments'));
    expect(new URL(asked[1]?.url ?? '').searchParams.get('offset')).toBe(
      'itrCom1/comOl1Dc0mm3nt4Xy',
    );
    expect(itemsOf(pages)[0]?.turns.map((t) => t.externalId)).toEqual([
      'body',
      'comment:comOl1Dc0mm3nt4Xy',
      'comment:comB5z37Mg9zaEPw6',
      'comment:comeNPu0X9K4Rxzid',
    ]);
  });

  it('s’arrête quand Airtable renvoie deux fois le même offset', async () => {
    const { pages, calls } = await runSync([
      basesRoute,
      tablesRoute({ tables: [tables.tables[0]] }),
      recordsRoute(CLIENTS, { records: [{ ...kf, commentCount: 0 }], offset: 'itrLoop' }),
      recordsRoute(CLIENTS, { records: [nb], offset: 'itrLoop' }),
    ]);

    expect(recordCalls(calls)).toHaveLength(2);
    expect(itemsOf(pages).map((i) => i.externalId.split('/').pop())).toEqual([
      'recKfM3xQ8wTn2PzA',
      'recNb4tYc7sLw1QeD',
    ]);
  });
});

describe('airtable : types de cellules', () => {
  const inline = {
    tables: [
      {
        id: CLIENTS,
        name: 'Fiches',
        primaryFieldId: 'fld1',
        fields: [
          { id: 'fld1', name: 'Nom', type: 'singleLineText' },
          { id: 'fld2', name: 'Code', type: 'barcode' },
          { id: 'fld3', name: 'Résumé', type: 'aiText' },
          { id: 'fld4', name: 'Vide', type: 'aiText' },
          { id: 'fld5', name: 'Note', type: 'rating' },
          { id: 'fld6', name: 'Clients liés', type: 'multipleLookupValues' },
          { id: 'fld7', name: 'Équipe', type: 'multipleCollaborators' },
          { id: 'fld8', name: 'Objet', type: 'singleLineText' },
        ],
      },
    ],
  };

  it('lit chaque forme de cellule et ignore ce qui n’est pas du texte', async () => {
    const record = {
      id: KF,
      createdTime: '2026-09-02T08:15:00.000Z',
      commentCount: 0,
      fields: {
        Nom: '  Fiche test  ',
        Code: { type: 'code128', text: '123-ABC' },
        Résumé: { state: 'generated', isStale: false, value: 'Texte généré' },
        Vide: { state: 'empty', isStale: false, value: null },
        Note: 4,
        'Clients liés': ['Acme', 'Beta', 3],
        Équipe: [
          { id: 'usr1', name: 'Marie Durand' },
          { id: 'usr2', email: 'david@acme.test' },
        ],
        Objet: { inconnu: 1 },
        'Hors schéma': 'Valeur ajoutée depuis',
      },
    };

    const { pages } = await runSync([
      basesRoute,
      tablesRoute(inline),
      recordsRoute(CLIENTS, { records: [record] }),
    ]);

    expect(itemsOf(pages)[0]?.turns[0]?.text).toBe(
      [
        'Nom : Fiche test',
        'Code : 123-ABC',
        'Résumé : Texte généré',
        'Note : 4',
        'Clients liés : Acme, Beta, 3',
        'Équipe : Marie Durand, david@acme.test',
        'Hors schéma : Valeur ajoutée depuis',
      ].join('\n'),
    );
  });
});

describe('airtable : ressources secondaires', () => {
  it('rend l’enregistrement sans commentaires quand le jeton n’a pas la portée (403), puis cesse de les demander', async () => {
    const { pages, calls } = await runSync([
      basesRoute,
      tablesRoute(),
      recordsRoute(CLIENTS, clientsPage1),
      recordsRoute(CLIENTS, clientsPage2),
      commentsRoute(CLIENTS, KF, undefined, { status: 403 }),
      recordsRoute(REUNIONS, { records: [] }),
    ]);

    const item = itemsOf(pages).find((i) => i.externalId.endsWith(KF));
    expect(item?.turns.map((t) => t.externalId)).toEqual(['body']);
    // Cobalt annonce un commentaire, mais la portée manque : aucune seconde demande.
    expect(calls.filter((c) => c.url.endsWith('/comments'))).toHaveLength(1);
    expect(itemsOf(pages).find((i) => i.externalId.endsWith(QD))?.turns).toHaveLength(1);
  });

  it('rend l’enregistrement sans commentaires quand il a disparu entre-temps (404)', async () => {
    const { pages } = await runSync([
      basesRoute,
      tablesRoute(),
      recordsRoute(CLIENTS, { records: [clientsPage1.records[0]] }),
      commentsRoute(CLIENTS, KF, undefined, { status: 404 }),
      recordsRoute(REUNIONS, { records: [] }),
    ]);

    expect(itemsOf(pages)[0]?.turns.map((t) => t.externalId)).toEqual(['body']);
  });

  it('laisse remonter un 401 sur les commentaires', async () => {
    const failure = await runSync([
      basesRoute,
      tablesRoute(),
      recordsRoute(CLIENTS, { records: [clientsPage1.records[0]] }),
      commentsRoute(CLIENTS, KF, undefined, { status: 401 }),
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });

  it('laisse remonter un 403 sur la liste des tables', async () => {
    const failure = await runSync([
      basesRoute,
      { url: `${API}/meta/bases/${BASE}/tables`, status: 403 },
    ]).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });
});

describe('airtable : fenêtres, pages et curseur', () => {
  // Une seule table, pour que les pages comptées soient celles de ses enregistrements.
  const clientsOnly = { tables: [tables.tables[0]] };
  const idOf = (n: number) => `rec${String(n).padStart(14, '0')}`;
  const markOf = (page: SyncPage | undefined) => cursorOf(page)[`${BASE}/${CLIENTS}`];
  const doneAt = (at: number) => ({ from: at, to: null, after: null });

  // `count` fiches sans commentaire, servies dans le désordre.
  function manyRecords(count: number, commentOn?: number) {
    const rows = Array.from({ length: count }, (_, i) => ({
      id: idOf(i + 1),
      createdTime: '2026-10-11T08:00:00.000Z',
      commentCount: i + 1 === commentOn ? 1 : 0,
      fields: { Nom: `Fiche ${i + 1}` },
    }));
    return { records: [...rows].reverse() };
  }

  it('lit une longue période par fenêtres de 7 jours, de la plus ancienne à la plus récente', async () => {
    const since = new Date(NOW.getTime() - 25 * DAY - 7 * MINUTE);
    const starts = [0, 1, 2, 3].map((i) => since.getTime() + i * 7 * DAY);
    const ends = [...starts.slice(1), NOW.getTime()];
    const one = (n: number) => ({ records: [manyRecords(n).records.at(-1)] });
    const none = { records: [] };

    const { pages, calls } = await runSync(
      [
        basesRoute,
        tablesRoute(),
        ...[none, one(2), none, one(4)].map((json) => recordsRoute(CLIENTS, json)),
        ...[none, none, none, none].map((json) => recordsRoute(REUNIONS, json)),
      ],
      { since },
    );

    const clientFormulas = recordCalls(calls)
      .slice(0, 4)
      .map((call) => bodyOf(call).filterByFormula);
    expect(clientFormulas).toEqual(starts.map((from, i) => formula(from, ends[i] as number)));
    // Un enregistrement est daté de la fin de sa fenêtre : jamais plus ancien que sa modification.
    expect(itemsOf(pages).map((i) => [i.title, i.updatedAt])).toEqual([
      ['Clients : Fiche 1', new Date(ends[1] as number).toISOString()],
      ['Clients : Fiche 1', NOW.toISOString()],
    ]);
  });

  it('coupe par pages de 20 enregistrements, avec un curseur qui reprend juste après', async () => {
    const { pages } = await runSync([
      basesRoute,
      tablesRoute(clientsOnly),
      recordsRoute(CLIENTS, manyRecords(45)),
    ]);

    expect(pages.map((p) => p.items.length)).toEqual([20, 20, 5]);
    expect(itemsOf(pages).map((i) => i.title)).toEqual(
      Array.from({ length: 45 }, (_, i) => `Clients : Fiche ${i + 1}`),
    );
    const window = { from: SINCE.getTime(), to: NOW.getTime() };
    expect(markOf(pages[0])).toEqual({ ...window, after: idOf(20) });
    expect(markOf(pages[1])).toEqual({ ...window, after: idOf(40) });
    expect(markOf(pages[2])).toEqual(doneAt(NOW.getTime()));
  });

  it('reprend au milieu d’une fenêtre : mêmes bornes, sans refaire ce qui est rendu, puis la fenêtre suivante', async () => {
    const cut = NOW.getTime() - MINUTE;
    const midWay = JSON.stringify({
      [`${BASE}/${CLIENTS}`]: { from: SINCE.getTime(), to: cut, after: idOf(20) },
    });
    const later = new Date(NOW.getTime() + MINUTE);
    vi.setSystemTime(later);

    const { pages, calls } = await runSync(
      [
        basesRoute,
        tablesRoute(clientsOnly),
        recordsRoute(CLIENTS, manyRecords(45)),
        recordsRoute(CLIENTS, { records: [] }),
      ],
      { cursor: midWay },
    );

    const formulas = recordCalls(calls).map((call) => bodyOf(call).filterByFormula);
    expect(formulas).toEqual([formula(SINCE, cut), formula(cut, later)]);
    expect(pages.map((p) => p.items.length)).toEqual([20, 5, 0]);
    expect(itemsOf(pages)[0]?.title).toBe('Clients : Fiche 21');
    expect(markOf(pages[1])).toEqual(doneAt(cut));
    expect(markOf(pages[2])).toEqual(doneAt(later.getTime()));
  });

  it('au passage suivant, repart une minute avant la fin de la dernière fenêtre', async () => {
    const done = JSON.stringify({
      [`${BASE}/${CLIENTS}`]: doneAt(NOW.getTime()),
      [`${BASE}/${REUNIONS}`]: doneAt(NOW.getTime()),
    });
    const later = new Date(NOW.getTime() + 15 * MINUTE);
    vi.setSystemTime(later);

    const { pages, calls } = await runSync(
      [
        basesRoute,
        tablesRoute(),
        recordsRoute(CLIENTS, { records: [] }),
        recordsRoute(REUNIONS, { records: [] }),
      ],
      { cursor: done },
    );

    const formulas = recordCalls(calls).map((call) => bodyOf(call).filterByFormula);
    const expected = formula(NOW.getTime() - MINUTE, later);
    expect(formulas).toEqual([expected, expected]);
    // Rien de neuf : des pages vides, qui portent le curseur avancé.
    expect(itemsOf(pages)).toEqual([]);
    expect(cursorOf(pages.at(-1))).toEqual({
      [`${BASE}/${CLIENTS}`]: doneAt(later.getTime()),
      [`${BASE}/${REUNIONS}`]: doneAt(later.getTime()),
    });
  });

  it('ne refait pas la première page : le dernier curseur rendu, repassé, ne relit que la fin', async () => {
    const first = await runSync(firstPassRoutes());
    const last = first.pages.at(-1) as SyncPage;
    const later = new Date(NOW.getTime() + 15 * MINUTE);
    vi.setSystemTime(later);

    const again = await runSync(
      [
        basesRoute,
        tablesRoute(),
        recordsRoute(CLIENTS, { records: [] }),
        recordsRoute(REUNIONS, { records: [] }),
      ],
      { cursor: last.cursor },
    );

    expect(itemsOf(again.pages)).toEqual([]);
    const formulas = recordCalls(again.calls).map((call) => bodyOf(call).filterByFormula);
    expect(formulas).toEqual(Array(2).fill(formula(NOW.getTime() - MINUTE, later)));
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync(
      [basesRoute, tablesRoute(clientsOnly), recordsRoute(CLIENTS, { records: [] })],
      { cursor: '{pas du json' },
    );

    expect(bodyOf(recordCalls(calls)[0]).filterByFormula).toBe(formula(SINCE, NOW));
  });

  it('oublie les tables qui n’existent plus', async () => {
    const stale = JSON.stringify({ [`${BASE}/tblDisparue000001`]: doneAt(1) });

    const { pages } = await runSync(
      [basesRoute, tablesRoute(clientsOnly), recordsRoute(CLIENTS, { records: [] })],
      { cursor: stale },
    );

    expect(Object.keys(cursorOf(pages.at(-1)))).toEqual([`${BASE}/${CLIENTS}`]);
  });

  it('livre la première page, curseur compris, avant une erreur 401 sur la suivante', async () => {
    const { http } = testHttp(airtableConnector, config, [
      basesRoute,
      tablesRoute(clientsOnly),
      recordsRoute(CLIENTS, manyRecords(25, 21)),
      commentsRoute(CLIENTS, idOf(21), undefined, { status: 401 }),
    ]);
    const pages = airtableConnector.sync(config, { cursor: null, since: SINCE }, http);
    const iterator = pages[Symbol.asyncIterator]();

    const first = await iterator.next();

    expect(first.value?.items).toHaveLength(20);
    const window = { from: SINCE.getTime(), to: NOW.getTime() };
    expect(markOf(first.value)).toEqual({ ...window, after: idOf(20) });
    await expect(iterator.next()).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('airtable : configuration du bouton', () => {
  const schema = airtableConnector.configSchema;

  it('accepte la forme OAuth, jetons compris, avec ou sans bases choisies', () => {
    expect(schema.parse(oauthConfig)).toEqual(oauthConfig);
    const chosen = { ...oauthConfig, bases: [BASE] };
    expect(schema.parse(chosen)).toEqual(chosen);
  });

  it('prend aucune base pour « toutes les bases autorisées », même si le champ manque', () => {
    const { bases: _bases, ...withoutBases } = oauthConfig;
    expect(schema.parse(withoutBases)).toMatchObject({ authMode: 'oauth', bases: [] });
  });

  it('refuse une forme OAuth sans jeton d’accès, et une clé sans jeton, en nommant le champ', () => {
    const oauthIssues = schema.safeParse({ authMode: 'oauth', bases: [] });
    const keyIssues = schema.safeParse({
      authMode: 'key',
      accessToken: OAUTH_TOKEN,
      bases: [BASE],
    });
    expect(oauthIssues.error?.issues.map((issue) => issue.path)).toEqual([['accessToken']]);
    expect(keyIssues.error?.issues.map((issue) => issue.path)).toEqual([['token']]);
    // Une clé collée ne vaut pas pour une connexion OAuth, ni l'inverse.
    expect(schema.safeParse({ authMode: 'oauth', token: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ accessToken: OAUTH_TOKEN, bases: [BASE] }).success).toBe(false);
  });

  it('exige toujours une base pour une clé collée, en nommant le champ', () => {
    const issues = schema.safeParse({ authMode: 'key', token: TOKEN, bases: [] });
    expect(issues.error?.issues.map((issue) => issue.path)).toEqual([['bases']]);
    expect(schema.safeParse({ token: TOKEN }).success).toBe(false);
  });

  it('garde les mêmes règles sur les identifiants de base avec le bouton', () => {
    expect(schema.safeParse({ ...oauthConfig, bases: ['tblClients00000001'] }).success).toBe(false);
    const many = Array.from(
      { length: 21 },
      (_, i) => `appLkNDICXNqxS${String(i).padStart(3, '0')}`,
    );
    expect(schema.safeParse({ ...oauthConfig, bases: many }).success).toBe(false);
  });

  it('reste un objet à champs lisibles, et ne met aucun jeton OAuth dans les champs à chiffrer', () => {
    const shape = (schema as unknown as z.ZodObject).shape;
    expect(Object.keys(shape).sort()).toEqual(
      ['accessToken', 'authMode', 'bases', 'expiresAt', 'refreshToken', 'token'].sort(),
    );
    expect(airtableConnector.secretFields).toEqual(['token']);
  });

  it('garde l’hôte de l’API pour les deux formes', () => {
    expect(airtableConnector.hosts(config)).toEqual(['api.airtable.com']);
    expect(airtableConnector.hosts(oauthConfig)).toEqual(['api.airtable.com']);
  });

  it('annonce le bouton dans le catalogue : ce qu’on verra chez Airtable, bases facultatives, clé gardée', () => {
    const entry = listCatalog().find((item) => item.id === 'airtable');
    expect(entry?.oauthHelp).toMatch(/Airtable/);
    expect(entry?.oauthHelp).toMatch(/bases/);
    expect(entry?.oauthHelp).toMatch(/lecture/);
    expect(entry?.keyAccepted ?? true).toBe(true);
    expect(entry?.keyHelp).toMatch(/airtable\.com\/create\/tokens/);
    // Le champ sert aux deux formulaires : il dit qu'avec le bouton il peut rester vide.
    expect(entry?.fields.find((field) => field.name === 'bases')?.help).toMatch(/vide/);
  });
});

describe('airtable : jeton OAuth', () => {
  it('verify l’envoie avec « Bearer » ; sans base choisie, il nomme toutes les bases autorisées', async () => {
    const { http, calls } = testHttp(airtableConnector, oauthConfig, [
      { url: `${API}/meta/whoami`, json: whoami },
      basesRoute,
    ]);

    const result = await airtableConnector.verify(oauthConfig, http);

    expect(result).toEqual({
      account: 'marie@acme.test (Acme CRM, Produit)',
      accountKey: 'usrL2PNC5o3H4lBEi:appLkNDICXNqxSDhG:appSW9R5uCNmRmfl6',
    });
    // Les bases viennent de la liste que le jeton voit : inutile de relire leurs tables.
    expect(calls.map((call) => call.url)).toEqual([`${API}/meta/whoami`, `${API}/meta/bases`]);
    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${OAUTH_TOKEN}`);
  });

  it('verify contrôle les bases choisies avant le clic', async () => {
    const chosen = { ...oauthConfig, bases: [BASE] };
    const { http, calls } = testHttp(airtableConnector, chosen, [
      { url: `${API}/meta/whoami`, json: { id: whoami.id } },
      basesRoute,
      tablesRoute(),
    ]);

    const result = await airtableConnector.verify(chosen, http);

    expect(result).toEqual({
      account: 'usrL2PNC5o3H4lBEi (Acme CRM)',
      accountKey: 'usrL2PNC5o3H4lBEi:appLkNDICXNqxSDhG',
    });
    expect(calls.map((call) => call.url)).toContain(`${API}/meta/bases/${BASE}/tables`);
  });

  it('verify nomme la base choisie que l’utilisateur n’a pas autorisée chez Airtable', async () => {
    const chosen = { ...oauthConfig, bases: [OTHER_BASE] };
    const { http } = testHttp(airtableConnector, chosen, [
      { url: `${API}/meta/whoami`, json: whoami },
      basesRoute,
      { url: `${API}/meta/bases/${OTHER_BASE}/tables`, status: 403 },
    ]);

    const failure = await airtableConnector.verify(chosen, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe(`Base Airtable inaccessible : ${OTHER_BASE}`);
    expect((failure as ConnectorHttpError).status).toBe(403);
  });

  it('verify refuse une autorisation qui ne donne accès à aucune base', async () => {
    const { http } = testHttp(airtableConnector, oauthConfig, [
      { url: `${API}/meta/whoami`, json: whoami },
      { url: `${API}/meta/bases`, json: { bases: [] } },
    ]);

    const failure = await airtableConnector
      .verify(oauthConfig, http)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Aucune base Airtable autorisée');
  });

  it('verify refuse un accès retiré (401)', async () => {
    const { http } = testHttp(airtableConnector, oauthConfig, [
      { url: `${API}/meta/whoami`, status: 401 },
    ]);

    await expect(airtableConnector.verify(oauthConfig, http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('sync lit toutes les bases autorisées quand aucune n’est choisie, avec « Bearer » partout', async () => {
    const { calls } = await runSync(
      [
        basesRoute,
        tablesRoute(),
        tablesRoute(tables, OTHER_BASE),
        recordsRoute(CLIENTS, { records: [] }),
        recordsRoute(REUNIONS, { records: [] }),
        recordsRoute(CLIENTS, { records: [] }, OTHER_BASE),
        recordsRoute(REUNIONS, { records: [] }, OTHER_BASE),
      ],
      { config: oauthConfig },
    );

    expect(calls.filter((call) => call.url.endsWith('/tables')).map((call) => call.url)).toEqual([
      `${API}/meta/bases/${BASE}/tables`,
      `${API}/meta/bases/${OTHER_BASE}/tables`,
    ]);
    expect(recordCalls(calls)).toHaveLength(4);
    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${OAUTH_TOKEN}`);
  });

  it('sync ne lit que les bases choisies avant le clic', async () => {
    const { calls } = await runSync(
      [
        basesRoute,
        tablesRoute(),
        recordsRoute(CLIENTS, { records: [] }),
        recordsRoute(REUNIONS, { records: [] }),
      ],
      { config: { ...oauthConfig, bases: [BASE] } },
    );

    expect(calls.filter((call) => call.url.endsWith('/tables'))).toHaveLength(1);
    expect(calls.some((call) => call.url.includes(OTHER_BASE))).toBe(false);
  });

  it('sync s’arrête à 20 bases quand l’utilisateur en autorise davantage', async () => {
    const ids = Array.from({ length: 22 }, (_, i) => `appLkNDICXNqxS${String(i).padStart(3, '0')}`);
    const { calls } = await runSync(
      [
        {
          url: `${API}/meta/bases`,
          json: { bases: ids.map((id) => ({ id, name: id, permissionLevel: 'read' })) },
        },
        ...ids.slice(0, 20).map((id) => tablesRoute({ tables: [] }, id)),
      ],
      { config: oauthConfig },
    );

    const asked = calls.filter((call) => call.url.endsWith('/tables')).map((call) => call.url);
    expect(asked).toEqual(ids.slice(0, 20).map((id) => `${API}/meta/bases/${id}/tables`));
  });

  it('laisse la clé collée avec « Bearer » aussi : rien ne change pour les connexions existantes', async () => {
    const { calls } = await runSync(firstPassRoutes());

    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });
});

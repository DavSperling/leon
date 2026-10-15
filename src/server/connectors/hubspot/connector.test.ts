import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { SEARCH_PAGES_MAX } from './client';
import { hubspotConnector } from './connector';
import { OVERLAP_MS } from './cursor';
import account from './fixtures/account.json';
import owners from './fixtures/owners.json';
import ownersArchived from './fixtures/owners-archived.json';
import searchCalls from './fixtures/search-calls.json';
import searchEmails from './fixtures/search-emails.json';
import searchMeetings from './fixtures/search-meetings.json';
import searchNotes1 from './fixtures/search-notes-page1.json';
import searchNotes2 from './fixtures/search-notes-page2.json';

const ROOT = 'https://api.hubapi.com';
const OBJECTS = `${ROOT}/crm/objects/2026-03`;
const OWNERS = `${ROOT}/crm/owners/2026-03`;
const ACCOUNT = `${ROOT}/account-info/2026-03/details`;
const TOKEN = 'pat-eu1-JETONDETEST-0123456789';
const config = { token: TOKEN };
const SINCE = new Date('2026-09-15T00:00:00Z');
const ms = (iso: string) => Date.parse(iso);

const searchRoute = (type: string, json: unknown): FakeRoute => ({
  method: 'POST',
  url: `${OBJECTS}/${type}/search`,
  json,
});
const ownersRoutes = (): FakeRoute[] => [
  { url: OWNERS, json: owners },
  { url: OWNERS, json: ownersArchived },
];

// Forme de la doc (BatchResponsePublicAssociationMultiWithLabel) : pour chaque fiche, ses liens.
const stamps = { startedAt: '2026-10-15T08:00:00.000Z', completedAt: '2026-10-15T08:00:01.000Z' };
function associationsRoute(from: string, to: string, links: Record<string, number[]>): FakeRoute {
  const results = Object.entries(links).map(([id, targets]) => ({
    from: { id },
    to: targets.map((toObjectId) => ({
      toObjectId,
      associationTypes: [{ category: 'HUBSPOT_DEFINED', typeId: 190, label: null }],
    })),
  }));
  return {
    method: 'POST',
    url: `${ROOT}/crm/associations/2026-03/${from}/${to}/batch/read`,
    json: { status: 'COMPLETE', results, ...stamps },
  };
}

// Forme de la doc (BatchResponseSimplePublicObject).
function namesRoute(kind: string, rows: Record<string, Record<string, string>>): FakeRoute {
  const results = Object.entries(rows).map(([id, properties]) => ({
    id,
    properties: { hs_object_id: id, ...properties },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archived: false,
  }));
  return {
    method: 'POST',
    url: `${OBJECTS}/${kind}/batch/read`,
    json: { status: 'COMPLETE', results, ...stamps },
  };
}

const emptyLinks = (from: string, to: string) => associationsRoute(from, to, {});

// Un premier passage complet : deux pages de notes, puis appels, réunions et e-mails.
function firstPassRoutes(): FakeRoute[] {
  return [
    searchRoute('notes', searchNotes1),
    ...ownersRoutes(),
    associationsRoute('notes', 'companies', { '51001': [7001] }),
    namesRoute('companies', { '7001': { name: 'Acme' } }),
    searchRoute('notes', searchNotes2),
    emptyLinks('notes', 'companies'),
    associationsRoute('notes', 'deals', { '51003': [8001] }),
    namesRoute('deals', { '8001': { dealname: 'Renouvellement Beta' } }),
    searchRoute('calls', searchCalls),
    emptyLinks('calls', 'companies'),
    emptyLinks('calls', 'deals'),
    associationsRoute('calls', 'contacts', { '52001': [9001] }),
    namesRoute('contacts', {
      '9001': { firstname: 'Paul', lastname: 'Lefèvre', email: 'paul@client.test' },
    }),
    searchRoute('meetings', searchMeetings),
    associationsRoute('meetings', 'companies', { '53001': [7001] }),
    namesRoute('companies', { '7001': { name: 'Acme' } }),
    searchRoute('emails', searchEmails),
    emptyLinks('emails', 'companies'),
    emptyLinks('emails', 'deals'),
    emptyLinks('emails', 'contacts'),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(hubspotConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(hubspotConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const itemOf = (pages: SyncPage[], externalId: string) =>
  itemsOf(pages).find((item) => item.externalId === externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;
const bodyOf = (call: { body: unknown } | undefined) => call?.body as Record<string, unknown>;

describe('hubspot : configuration', () => {
  const schema = hubspotConnector.configSchema;

  it('accepte un jeton d’appli privée, sans les espaces autour', () => {
    expect(schema.parse({ token: `  ${TOKEN} ` })).toEqual({ token: TOKEN });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ token: '   ' }).success).toBe(false);
  });

  it('fixe l’hôte, le champ à chiffrer et un rythme sous les 5 recherches par seconde', () => {
    expect(hubspotConnector.hosts(config)).toEqual(['api.hubapi.com']);
    expect(hubspotConnector.secretFields).toEqual(['token']);
    expect(hubspotConnector.minIntervalMs).toBeGreaterThanOrEqual(200);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('hubspot')).toBe(hubspotConnector);
    const entry = listCatalog().find((item) => item.id === 'hubspot');
    expect(entry?.available).toBe(true);
    expect(entry?.fields.map((field) => field.name)).toEqual(['token']);
  });
});

describe('hubspot : verify', () => {
  const emptySearch = { total: 0, results: [] };
  const verifyRoutes = (): FakeRoute[] => [
    searchRoute('notes', emptySearch),
    searchRoute('calls', emptySearch),
    searchRoute('meetings', emptySearch),
    searchRoute('emails', emptySearch),
    { url: ACCOUNT, json: account },
  ];

  it('essaie la lecture de chaque sorte d’activité avec le jeton, puis nomme le compte', async () => {
    const { http, calls } = testHttp(hubspotConnector, config, verifyRoutes());

    const result = await hubspotConnector.verify(config, http);

    expect(result).toEqual({ account: 'Compte HubSpot 12345678' });
    expect(calls.map((call) => call.url)).toEqual([
      `${OBJECTS}/notes/search`,
      `${OBJECTS}/calls/search`,
      `${OBJECTS}/meetings/search`,
      `${OBJECTS}/emails/search`,
      ACCOUNT,
    ]);
    expect(bodyOf(calls[0])).toMatchObject({ limit: 1 });
    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('se contente de « HubSpot » quand le compte n’est pas lisible avec ce jeton', async () => {
    const routes: FakeRoute[] = [...verifyRoutes().slice(0, 4), { url: ACCOUNT, status: 403 }];
    const { http } = testHttp(hubspotConnector, config, routes);

    expect(await hubspotConnector.verify(config, http)).toEqual({ account: 'HubSpot' });
  });

  it('refuse un jeton rejeté', async () => {
    const { http } = testHttp(hubspotConnector, config, [
      { method: 'POST', url: `${OBJECTS}/notes/search`, status: 401 },
    ]);

    await expect(hubspotConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse un jeton à qui il manque la portée des e-mails', async () => {
    const routes: FakeRoute[] = [
      ...verifyRoutes().slice(0, 3),
      { method: 'POST', url: `${OBJECTS}/emails/search`, status: 403 },
    ];
    const { http } = testHttp(hubspotConnector, config, routes);

    await expect(hubspotConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('hubspot : sync, premier passage', () => {
  it('cherche par date de modification croissante depuis since, 100 par page, avec le jeton', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const first = calls[0];
    expect(first?.url).toBe(`${OBJECTS}/notes/search`);
    expect(first?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(bodyOf(first)).toEqual({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'hs_lastmodifieddate',
              operator: 'GTE',
              value: String(SINCE.getTime()),
            },
          ],
        },
      ],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
      properties: ['hs_note_body', 'hubspot_owner_id', 'hs_lastmodifieddate'],
      limit: 100,
    });
  });

  it('lit les propriétaires, actifs puis archivés, une seule fois pour tout le passage', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const ownerCalls = calls.filter((call) => call.url.startsWith(OWNERS));
    expect(ownerCalls.map((call) => paramsOf(call.url))).toEqual([
      { limit: '100', archived: 'false' },
      { limit: '100', archived: 'true' },
    ]);
  });

  it('rend une note avec son auteur, son texte brut, sa date et l’entreprise liée', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 'note:51001')).toEqual({
      externalId: 'note:51001',
      nature: 'note',
      title: 'Note · Acme',
      url: null,
      updatedAt: '2026-10-08T11:10:00.000Z',
      origin: { type: 'note', company: 'Acme' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'Suivi avec Acme : budget validé pour le T4.\n\n- Démo prévue le 22 octobre\n- Contrat à envoyer avant vendredi',
          ts: '2026-10-08T11:10:00.000Z',
        },
      ],
    });
  });

  it('retombe sur l’affaire, puis sur le contact, quand il n’y a pas d’entreprise liée', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const note = itemOf(pages, 'note:51003');
    expect(note?.title).toBe('Note · Renouvellement Beta');
    expect(note?.origin).toEqual({ type: 'note', deal: 'Renouvellement Beta' });
    const call = itemOf(pages, 'call:52001');
    expect(call?.title).toBe('Appel · Suivi devis · Paul Lefèvre');
    expect(call?.origin).toEqual({ type: 'call', contact: 'Paul Lefèvre' });
  });

  it('retrouve l’auteur d’une fiche archivée, et décode les entités du texte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const turn = itemOf(pages, 'note:51003')?.turns[0];
    expect(turn?.author).toEqual({ name: 'Paul Roche', email: 'paul@acme.test' });
    expect(turn?.text).toMatch(/^Client Beta : demande une remise de 10\s%/);
    expect(turn?.text).toContain("l'offre annuelle");
  });

  it('rend un appel : titre de l’appel, corps en texte brut, date de dernière modification', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const call = itemOf(pages, 'call:52001');
    expect(call?.updatedAt).toBe('2026-10-10T09:15:00.000Z');
    expect(call?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: 'David Martin', email: 'david@acme.test' },
        text: 'Le client veut une remise avant de signer.\n\nRappel prévu jeudi.',
        ts: '2026-10-10T09:15:00.000Z',
      },
    ]);
  });

  it('rend une réunion : description puis notes internes dans le même tour', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const meeting = itemOf(pages, 'meeting:53001');
    expect(meeting?.title).toBe('Réunion · Point trimestriel · Acme');
    expect(meeting?.turns[0]?.text).toBe(
      "Ordre du jour : bilan du T3.\n\nNotes internes :\nDécision : on passe à l'offre annuelle.",
    );
  });

  it('attribue un e-mail reçu à son expéditeur, et garde le texte brut tel quel', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const email = itemOf(pages, 'email:54001');
    expect(email?.title).toBe('E-mail · Re: Devis T4');
    expect(email?.origin).toEqual({ type: 'email' });
    expect(email?.turns[0]?.author).toEqual({ name: 'Paul Lefèvre', email: 'paul@client.test' });
    // L’adresse entre chevrons n’est pas prise pour une balise.
    expect(email?.turns[0]?.text).toContain('<paul@client.test>');
  });

  it('attribue un e-mail sans en-têtes au propriétaire, et lit son HTML à défaut de texte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const email = itemOf(pages, 'email:54002');
    expect(email?.turns[0]?.author).toEqual({ name: 'David Martin', email: 'david@acme.test' });
    expect(email?.turns[0]?.text).toBe('Voici le devis révisé.\n\nLivraison sous 15 jours.');
  });

  it('ne rend pas une note sans texte, mais le curseur la dépasse', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemOf(pages, 'note:51002')).toBeUndefined();
    expect(pages[0]?.items.map((item) => item.externalId)).toEqual(['note:51001']);
    expect(cursorOf(pages[0])).toEqual({ notes: ms('2026-10-09T08:30:00.000Z') });
  });

  it('ne demande les affaires et les contacts que pour les fiches sans entreprise', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const urls = calls.map((call) => call.url);
    // Page 1 des notes : l’entreprise suffit.
    expect(urls.slice(0, 5)).toEqual([
      `${OBJECTS}/notes/search`,
      `${OWNERS}?limit=100&archived=false`,
      `${OWNERS}?limit=100&archived=true`,
      `${ROOT}/crm/associations/2026-03/notes/companies/batch/read`,
      `${OBJECTS}/companies/batch/read`,
    ]);
    // Aucun nom demandé quand aucune fiche n’est liée (e-mails).
    expect(urls.filter((url) => url === `${OBJECTS}/contacts/batch/read`)).toHaveLength(1);
    expect(bodyOf(calls[3])).toEqual({ inputs: [{ id: '51001' }] });
    expect(bodyOf(calls[4])).toEqual({
      inputs: [{ id: '7001' }],
      properties: ['name'],
      propertiesWithHistory: [],
    });
  });

  it('rend des dates et des éléments que le socle accepte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(6);
    for (const item of itemsOf(pages))
      expect(normalizeItem(item, 'hubspot'), item.externalId).not.toBeNull();
  });
});

describe('hubspot : sync, pages et curseur', () => {
  it('rend une page par page de recherche, la seconde reprenant par le jeton de page', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(5); // 2 pages de notes, appels, réunions, e-mails
    const notesSearches = calls.filter((call) => call.url === `${OBJECTS}/notes/search`);
    expect(notesSearches).toHaveLength(2);
    expect(bodyOf(notesSearches[0])).not.toHaveProperty('after');
    expect(bodyOf(notesSearches[1])).toMatchObject({ after: '2' });
    expect(pages.every((page) => page.items.length <= 100)).toBe(true);
  });

  it('range, par sorte d’activité, l’instant de la dernière fiche lue', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[1])).toEqual({ notes: ms('2026-10-12T15:45:00.000Z') });
    expect(cursorOf(pages[2])).toEqual({
      notes: ms('2026-10-12T15:45:00.000Z'),
      calls: ms('2026-10-10T09:15:00.000Z'),
    });
    expect(cursorOf(pages.at(-1))).toEqual({
      notes: ms('2026-10-12T15:45:00.000Z'),
      calls: ms('2026-10-10T09:15:00.000Z'),
      meetings: ms('2026-10-11T14:00:00.000Z'),
      emails: ms('2026-10-14T10:00:00.000Z'),
    });
  });

  it('repart du dernier curseur, reculé du délai d’indexation, sans refaire la première page', async () => {
    const first = await runSync(firstPassRoutes());
    const cursor = first.pages.at(-1)?.cursor ?? null;
    const empty = { total: 0, results: [] };

    const { pages, calls } = await runSync(
      ['notes', 'calls', 'meetings', 'emails'].map((type) => searchRoute(type, empty)),
      { cursor },
    );

    expect(pages).toEqual([]);
    expect(OVERLAP_MS).toBeGreaterThan(0);
    const lowerBound = (index: number) => {
      const filters = bodyOf(calls[index]).filterGroups as Array<{
        filters: Array<{ value: string }>;
      }>;
      return filters[0]?.filters[0]?.value;
    };
    expect(lowerBound(0)).toBe(String(ms('2026-10-12T15:45:00.000Z') - OVERLAP_MS));
    expect(lowerBound(1)).toBe(String(ms('2026-10-10T09:15:00.000Z') - OVERLAP_MS));
    expect(lowerBound(3)).toBe(String(ms('2026-10-14T10:00:00.000Z') - OVERLAP_MS));
  });

  it('ne remonte jamais avant since, même avec un curseur ancien', async () => {
    const cursor = JSON.stringify({ notes: SINCE.getTime() + 60_000 });
    const empty = { total: 0, results: [] };

    const { calls } = await runSync(
      ['notes', 'calls', 'meetings', 'emails'].map((type) => searchRoute(type, empty)),
      { cursor },
    );

    const filters = bodyOf(calls[0]).filterGroups as Array<{ filters: Array<{ value: string }> }>;
    expect(filters[0]?.filters[0]?.value).toBe(String(SINCE.getTime()));
  });

  it('repart de since quand le curseur est illisible', async () => {
    const empty = { total: 0, results: [] };

    const { calls } = await runSync(
      ['notes', 'calls', 'meetings', 'emails'].map((type) => searchRoute(type, empty)),
      { cursor: 'pas du json' },
    );

    const filters = bodyOf(calls[0]).filterGroups as Array<{ filters: Array<{ value: string }> }>;
    expect(filters[0]?.filters[0]?.value).toBe(String(SINCE.getTime()));
  });

  // La recherche s'arrête à 10 000 résultats : après cent pages, on la relance à la dernière date.
  const silentHit = (id: number, at: number) => ({
    id: String(id),
    properties: { hs_lastmodifieddate: new Date(at).toISOString(), hs_note_body: null },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: new Date(at).toISOString(),
    archived: false,
  });
  const emptySearches = () =>
    ['calls', 'meetings', 'emails'].map((type) => searchRoute(type, { total: 0, results: [] }));

  it('relance la recherche à la dernière date lue après 10 000 résultats', async () => {
    const start = SINCE.getTime() + 3_600_000;
    const hundred = Array.from({ length: SEARCH_PAGES_MAX }, (_, i) =>
      searchRoute('notes', {
        total: 20_000,
        results: [silentHit(i, start + i * 1000)],
        paging: { next: { after: String(i + 1) } },
      }),
    );
    const routes: FakeRoute[] = [
      ...hundred,
      searchRoute('notes', { total: 1, results: [] }),
      ...emptySearches(),
    ];

    const { calls } = await runSync(routes);

    const notes = calls.filter((call) => call.url === `${OBJECTS}/notes/search`);
    expect(notes).toHaveLength(SEARCH_PAGES_MAX + 1);
    const last = notes.at(-1);
    expect(bodyOf(last)).not.toHaveProperty('after');
    const filters = bodyOf(last).filterGroups as Array<{ filters: Array<{ value: string }> }>;
    expect(filters[0]?.filters[0]?.value).toBe(String(start + (SEARCH_PAGES_MAX - 1) * 1000));
  });

  it('s’arrête si les 10 000 résultats portent la date de départ : la recherche ne peut plus avancer', async () => {
    const same = Array.from({ length: SEARCH_PAGES_MAX }, (_, i) =>
      searchRoute('notes', {
        total: 20_000,
        results: [silentHit(i, SINCE.getTime())],
        paging: { next: { after: String(i + 1) } },
      }),
    );

    const { calls } = await runSync([...same, ...emptySearches()]);

    const notes = calls.filter((call) => call.url === `${OBJECTS}/notes/search`);
    expect(notes).toHaveLength(SEARCH_PAGES_MAX);
  });
});

describe('hubspot : ressources secondaires', () => {
  it('sans accès aux propriétaires, l’élément sort sans nom d’auteur', async () => {
    const routes: FakeRoute[] = [
      searchRoute('notes', { ...searchNotes2 }),
      { url: OWNERS, status: 403 },
      emptyLinks('notes', 'companies'),
      emptyLinks('notes', 'deals'),
      emptyLinks('notes', 'contacts'),
      ...['calls', 'meetings', 'emails'].map((type) =>
        searchRoute(type, { total: 0, results: [] }),
      ),
    ];

    const { pages } = await runSync(routes);

    const turn = itemOf(pages, 'note:51003')?.turns[0];
    expect(turn?.author).toEqual({ name: null, email: null });
    expect(turn?.text).toContain('Client Beta');
  });

  it('sans accès aux entreprises, l’élément sort avec un titre sans fiche liée', async () => {
    const routes: FakeRoute[] = [
      searchRoute('notes', { ...searchNotes2 }),
      ...ownersRoutes(),
      {
        method: 'POST',
        url: `${ROOT}/crm/associations/2026-03/notes/companies/batch/read`,
        status: 403,
      },
      emptyLinks('notes', 'deals'),
      emptyLinks('notes', 'contacts'),
      ...['calls', 'meetings', 'emails'].map((type) =>
        searchRoute(type, { total: 0, results: [] }),
      ),
    ];

    const { pages } = await runSync(routes);

    const note = itemOf(pages, 'note:51003');
    expect(note?.title).toBe('Note #51003');
    expect(note?.origin).toEqual({ type: 'note' });
  });

  it('un 401 sur la recherche remonte', async () => {
    const { http } = testHttp(hubspotConnector, config, [
      { method: 'POST', url: `${OBJECTS}/notes/search`, status: 401 },
    ]);
    const state = { cursor: null, since: SINCE };

    await expect(collect(hubspotConnector.sync(config, state, http))).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });

  it('un 403 sur la recherche des appels remonte aussi : on ne perd pas des appels sans le dire', async () => {
    const routes: FakeRoute[] = [
      searchRoute('notes', { total: 0, results: [] }),
      { method: 'POST', url: `${OBJECTS}/calls/search`, status: 403 },
    ];
    const { http } = testHttp(hubspotConnector, config, routes);

    await expect(
      collect(hubspotConnector.sync(config, { cursor: null, since: SINCE }, http)),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('une réponse de recherche qui n’a pas la forme de la doc est une erreur propre', async () => {
    const odd = { total: 1, results: [{ id: '1', properties: {}, updatedAt: 'hier' }] };
    const { http } = testHttp(hubspotConnector, config, [searchRoute('notes', odd)]);

    const failure = await collect(
      hubspotConnector.sync(config, { cursor: null, since: SINCE }, http),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
  });
});

describe('hubspot : dates', () => {
  it('prend la date de la propriété de tri, et à défaut celle de la fiche', async () => {
    const hit = (id: string, extra: Record<string, string | null>, updatedAt: string) => ({
      id,
      properties: { hs_note_body: `<p>Texte ${id}</p>`, hubspot_owner_id: null, ...extra },
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt,
      archived: false,
    });
    const search = {
      total: 2,
      results: [
        hit('1', { hs_lastmodifieddate: '2026-10-05T10:00:00.000Z' }, '2026-10-05T10:00:00.000Z'),
        hit('2', {}, '2026-10-06T12:00:00.000+02:00'),
      ],
    };
    const routes: FakeRoute[] = [
      searchRoute('notes', search),
      ...ownersRoutes(),
      emptyLinks('notes', 'companies'),
      emptyLinks('notes', 'deals'),
      emptyLinks('notes', 'contacts'),
      ...['calls', 'meetings', 'emails'].map((type) =>
        searchRoute(type, { total: 0, results: [] }),
      ),
    ];

    const { pages } = await runSync(routes);

    expect(itemOf(pages, 'note:1')?.updatedAt).toBe('2026-10-05T10:00:00.000Z');
    expect(itemOf(pages, 'note:2')?.updatedAt).toBe('2026-10-06T10:00:00.000Z');
    expect(cursorOf(pages[0])).toEqual({ notes: ms('2026-10-06T10:00:00.000Z') });
  });
});

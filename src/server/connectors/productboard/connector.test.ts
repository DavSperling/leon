import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, type FakeRoute, fakeFetch, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError, createConnectorHttp } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { productboardCatalog } from './catalog';
import { productboardConnector } from './connector';
import notesEmpty from './fixtures/notes-empty.json';
import notesPage1 from './fixtures/notes-page-1.json';
import notesPage2 from './fixtures/notes-page-2.json';
import tokenInfo from './fixtures/token-info.json';
import { productboardOAuth } from './oauth';

const API = 'https://api.productboard.com/v2';
const TOKEN = 'pb-jeton-de-test-0123456789';
// La forme que `runConnectorSync` passe au connecteur : la configuration lue par le schéma.
const config = {
  authMode: 'oauth' as const,
  accessToken: TOKEN,
  refreshToken: 'pb-rafraichissement-de-test',
  expiresAt: '2026-10-16T09:00:00.000Z',
  workspace: 'Acme',
};
const SINCE = new Date('2026-09-15T00:00:00Z');
const NOW = Date.UTC(2026, 9, 15, 9, 0, 0);

const NOTE_TEXT = '3a1f0c52-7d0e-4b8a-9c11-0d6e5f4a3b21';
const NOTE_CONVERSATION = '7b2e9d14-3c5a-4f60-8a17-1e9c4b7d2a30';
const NOTE_PLAIN = 'c4d5e6f7-0a1b-4c2d-8e3f-4a5b6c7d8e90';
const NOTE_OPPORTUNITY = 'd5e6f708-1b2c-4d3e-9f40-5b6c7d8e9fa1';
const NOTE_BLANK = 'e6f70819-2c3d-4e4f-8051-6c7d8e9fa0b2';

const noteRoute = (json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${API}/notes`,
  json,
  ...extra,
});

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(productboardConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(productboardConnector.sync(config, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const itemOf = (pages: SyncPage[], id: string) =>
  itemsOf(pages).find((item) => item.externalId === `note:${id}`);
const lastCursor = (pages: SyncPage[]) => pages.at(-1)?.cursor ?? null;
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;
const pathOf = (url: string | undefined) => new URL(url ?? '').pathname;

// Des notes en nombre, rendues comme l'outil les rend : la plus récemment créée d'abord.
function bulkNotes(count: number, firstIndex = 0) {
  const base = Date.parse('2026-10-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const index = firstIndex + i;
    const at = new Date(base + index * 60_000).toISOString();
    return {
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      type: 'textNote',
      createdAt: at,
      updatedAt: at,
      fields: { name: `Note ${index}`, content: `Texte ${index}` },
      links: { html: `https://acme.productboard.com/all-notes/notes/${index}` },
    };
  }).reverse();
}

describe('productboard : configuration', () => {
  const schema = productboardConnector.configSchema;

  it('accepte la forme du bouton, sans les espaces autour du jeton', () => {
    expect(schema.parse({ authMode: 'oauth', accessToken: `  ${TOKEN} ` })).toEqual({
      authMode: 'oauth',
      accessToken: TOKEN,
    });
    expect(schema.parse(config)).toEqual(config);
  });

  it('refuse une configuration incomplète ou à clé : l’outil ne se branche que par le bouton', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ accessToken: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'oauth', accessToken: '   ' }).success).toBe(false);
    expect(schema.safeParse({ authMode: 'key', token: TOKEN }).success).toBe(false);
    expect(schema.safeParse({ token: TOKEN }).success).toBe(false);
  });

  it('fixe l’hôte, ne chiffre que les jetons du socle et ménage l’API', () => {
    expect(productboardConnector.hosts(config)).toEqual(['api.productboard.com']);
    expect(productboardConnector.secretFields).toEqual([]);
    expect(productboardConnector.minIntervalMs).toBeGreaterThanOrEqual(100);
    expect(productboardConnector.oauth).toBe(productboardOAuth);
  });

  it('est disponible dans le registre et le catalogue, sans clé à coller', () => {
    expect(getConnector('productboard')).toBe(productboardConnector);
    const entry = listCatalog().find((item) => item.id === 'productboard');
    expect(entry?.available).toBe(true);
    expect(entry?.fields).toEqual([]);
    expect(entry?.keyAccepted).toBe(false);
    expect(productboardCatalog.oauthHelp?.trim()).toBeTruthy();
    expect(productboardCatalog.warning).toBe('Seul un Maker administrateur peut autoriser Leon.');
    expect(productboardCatalog.docsUrl).toMatch(/^https:\/\//);
  });
});

describe('productboard : verify', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lit un extrait des notes avec le jeton en Bearer et rend l’espace', async () => {
    const { http, calls } = testHttp(productboardConnector, config, [noteRoute(notesEmpty)]);

    const result = await productboardConnector.verify(config, http);

    expect(result).toEqual({ account: 'Productboard (Acme)' });
    expect(calls).toHaveLength(1);
    expect(pathOf(calls[0]?.url)).toBe('/v2/notes');
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers.accept).toBe('application/json');
    // Les notes d'il y a moins d'une heure, réduites à leur nom : la réponse reste minuscule.
    expect(paramsOf(calls[0]?.url)).toEqual({
      'fields[]': 'name',
      archived: 'false',
      updatedFrom: new Date(NOW - 3_600_000).toISOString(),
    });
  });

  it('rend un compte lisible même sans nom d’espace', async () => {
    const { workspace: _espace, ...withoutWorkspace } = config;
    const { http } = testHttp(productboardConnector, withoutWorkspace, [noteRoute(notesEmpty)]);

    await expect(productboardConnector.verify(withoutWorkspace, http)).resolves.toEqual({
      account: 'Productboard',
    });
  });

  it.each([401, 403])('lève ConnectorAuthError sur un %s', async (status) => {
    const { http } = testHttp(productboardConnector, config, [
      noteRoute({ errors: [{ code: 'unauthorized' }] }, { status }),
    ]);

    await expect(productboardConnector.verify(config, http)).rejects.toBeInstanceOf(
      ConnectorAuthError,
    );
  });
});

describe('productboard : premier passage', () => {
  it('filtre sur la date de départ, hors notes archivées, et rend les plus anciennes d’abord', async () => {
    const { pages, calls } = await runSync([noteRoute(notesPage1), noteRoute(notesPage2)]);

    expect(paramsOf(calls[0]?.url)).toEqual({
      archived: 'false',
      updatedFrom: '2026-09-15T00:00:00.000Z',
    });
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    // La note vide (16/09) n'est pas rendue ; les autres vont de la plus ancienne à la plus récente.
    expect(itemsOf(pages).map((item) => item.externalId)).toEqual([
      `note:${NOTE_OPPORTUNITY}`,
      `note:${NOTE_PLAIN}`,
      `note:${NOTE_CONVERSATION}`,
      `note:${NOTE_TEXT}`,
    ]);
  });

  it('lit la page suivante en renvoyant les mêmes filtres et le curseur de la page', async () => {
    const { calls } = await runSync([noteRoute(notesPage1), noteRoute(notesPage2)]);

    expect(calls).toHaveLength(2);
    expect(paramsOf(calls[1]?.url)).toEqual({
      archived: 'false',
      updatedFrom: '2026-09-15T00:00:00.000Z',
      pageCursor: 'curseur-page-2',
    });
  });

  it('rend une note texte : HTML converti, lien, étiquettes, espace, auteur inconnu', async () => {
    const { pages } = await runSync([noteRoute(notesPage1), noteRoute(notesPage2)]);

    expect(itemOf(pages, NOTE_TEXT)).toEqual({
      externalId: `note:${NOTE_TEXT}`,
      nature: 'note',
      title: 'Export CSV des rapports',
      url: 'https://acme.productboard.com/all-notes/notes/42',
      updatedAt: '2026-10-14T16:30:00Z',
      origin: { workspace: 'Acme', tags: 'export, reporting' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          // Sans le droit des informations personnelles, l'adresse est « [redacted] » : aucune.
          author: { name: null, email: null },
          text: "Les clients de Dupont SA demandent l'export CSV des rapports.\n\n- Format UTF-8\n- Colonnes configurables",
          // Le tour document vaut à la date de dernière modification de la note.
          ts: '2026-10-14T16:30:00Z',
        },
      ],
    });
  });

  it('garde le texte brut tel quel, avec ses retours à la ligne, et l’adresse du créateur', async () => {
    const { pages } = await runSync([noteRoute(notesPage1), noteRoute(notesPage2)]);
    const item = itemOf(pages, NOTE_PLAIN);

    expect(item?.title).toBe('Idée : mode sombre');
    expect(item?.origin).toEqual({ workspace: 'Acme' });
    expect(item?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: null, email: 'paul@acme.test' },
        text: 'Plusieurs utilisateurs réclament un mode sombre.\n\n- tableau de bord\n- éditeur',
        ts: '2026-10-02T11:00:00Z',
      },
    ]);
  });

  it('rend une conversation : une prise de parole par tour, du côté lu dans le type d’auteur', async () => {
    const { pages } = await runSync([noteRoute(notesPage1), noteRoute(notesPage2)]);
    const item = itemOf(pages, NOTE_CONVERSATION);

    // Les dates de cette note sont dans `fields`, pas à la racine (la doc se contredit).
    expect(item?.updatedAt).toBe('2026-10-10T09:20:00Z');
    expect(item?.url).toBe('https://acme.productboard.com/all-notes/notes/41');
    expect(item?.origin).toEqual({ workspace: 'Acme', tags: 'support' });
    expect(item?.turns).toEqual([
      {
        externalId: 'part:msg-1',
        role: 'participant',
        author: { name: 'Léa Martin', email: null },
        side: 'external',
        text: "Bonjour, l'export des rapports plante depuis lundi.",
        ts: '2026-10-10T08:00:00Z',
      },
      {
        externalId: 'part:msg-2',
        role: 'participant',
        author: { name: 'Marie Durand', email: null },
        side: 'team',
        text: 'Nous regardons cela, merci du signalement.',
        ts: '2026-10-10T09:15:00Z',
      },
    ]);
  });

  it('rend une opportunité en lignes « nom : valeur »', async () => {
    const { pages } = await runSync([noteRoute(notesPage1), noteRoute(notesPage2)]);
    const item = itemOf(pages, NOTE_OPPORTUNITY);

    expect(item?.title).toBe('Opportunité Dupont SA');
    expect(item?.turns).toEqual([
      {
        externalId: 'body',
        role: 'document',
        author: { name: null, email: null },
        text: 'Montant : 12000\nEntreprise : Dupont SA',
        ts: '2026-09-20T12:00:00Z',
      },
    ]);
  });

  it('ne rend pas une note sans texte, mais le curseur la dépasse', async () => {
    const { pages } = await runSync([noteRoute(notesPage2)]);

    expect(itemOf(pages, NOTE_BLANK)).toBeUndefined();
    expect(itemsOf(pages)).toHaveLength(2);
  });

  it('écarte une note sans aucune date, et celle d’avant la date de départ', async () => {
    const undated = {
      ...bulkNotes(1)[0],
      id: 'sans-date',
      createdAt: undefined,
      updatedAt: undefined,
    };
    const early = { ...bulkNotes(1, 7)[0], id: 'trop-ancienne', updatedAt: '2026-08-01T00:00:00Z' };
    const { pages } = await runSync([noteRoute({ data: [undated, early, ...bulkNotes(1, 3)] })]);

    expect(itemsOf(pages).map((item) => item.externalId)).toEqual([
      'note:00000000-0000-4000-8000-000000000003',
    ]);
  });

  it('rend des éléments que le socle accepte', async () => {
    const { pages } = await runSync([noteRoute(notesPage1), noteRoute(notesPage2)]);

    expect(itemsOf(pages)).toHaveLength(4);
    for (const item of itemsOf(pages)) {
      expect(normalizeItem(item, 'productboard'), item.externalId).not.toBeNull();
    }
  });

  it('ne rend rien, et aucun curseur, quand rien n’a changé', async () => {
    const { pages } = await runSync([noteRoute(notesEmpty)]);

    expect(pages).toEqual([]);
  });
});

describe('productboard : pagination et curseur', () => {
  it('découpe en pages de 100 éléments au plus, avec un curseur qui avance', async () => {
    const { pages } = await runSync([noteRoute({ data: bulkNotes(150) })]);

    expect(pages.map((page) => page.items.length)).toEqual([100, 50]);
    const ids = itemsOf(pages).map((item) => item.externalId);
    expect(new Set(ids).size).toBe(150);
    // Plus ancien d'abord.
    expect(ids[0]).toBe('note:00000000-0000-4000-8000-000000000000');
    expect(ids[149]).toBe('note:00000000-0000-4000-8000-000000000149');
    expect(JSON.parse(pages[0]?.cursor ?? '')).toEqual({
      at: Date.parse('2026-10-01T01:39:00Z'),
      seen: ['00000000-0000-4000-8000-000000000099'],
    });
  });

  it('reprend au curseur : relit depuis son instant et ne rend pas ce qui est déjà passé', async () => {
    const first = await runSync([noteRoute({ data: bulkNotes(150) })]);
    const cursor = first.pages[0]?.cursor ?? null;

    // L'outil rend les bornes comprises : la dernière note du premier passage revient, et ne compte pas.
    const { pages, calls } = await runSync([noteRoute({ data: bulkNotes(51, 99) })], { cursor });

    expect(paramsOf(calls[0]?.url).updatedFrom).toBe('2026-10-01T01:39:00.000Z');
    expect(itemsOf(pages)).toHaveLength(50);
    expect(itemsOf(pages)[0]?.externalId).toBe('note:00000000-0000-4000-8000-000000000100');
  });

  it('rend deux notes modifiées au même instant l’une après l’autre, sans doublon', async () => {
    const [a, b] = [bulkNotes(1, 5)[0], { ...bulkNotes(1, 5)[0], id: 'jumelle-de-5' }];
    const first = await runSync([noteRoute({ data: [a] })]);
    const cursor = lastCursor(first.pages);

    const { pages } = await runSync([noteRoute({ data: [b, a] })], { cursor });

    expect(itemsOf(pages).map((item) => item.externalId)).toEqual(['note:jumelle-de-5']);
  });

  it('repart de la date de départ quand le curseur est illisible', async () => {
    const { pages, calls } = await runSync([noteRoute({ data: bulkNotes(2) })], {
      cursor: 'pas du json',
    });

    expect(paramsOf(calls[0]?.url).updatedFrom).toBe('2026-09-15T00:00:00.000Z');
    expect(itemsOf(pages)).toHaveLength(2);
  });

  it('accepte un curseur de page seul, sans adresse', async () => {
    const page1 = { data: bulkNotes(1, 1), links: { next: 'curseur-nu' } };
    const { calls } = await runSync([noteRoute(page1), noteRoute(notesEmpty)]);

    expect(paramsOf(calls[1]?.url).pageCursor).toBe('curseur-nu');
  });

  it('s’arrête quand la dernière page renvoie un curseur déjà vu', async () => {
    const page1 = { data: bulkNotes(1, 1), links: { next: `${API}/notes?pageCursor=c2` } };
    const page2 = { data: bulkNotes(1, 2), links: { next: `${API}/notes?pageCursor=c2` } };
    const { pages, calls } = await runSync([noteRoute(page1), noteRoute(page2)]);

    expect(calls).toHaveLength(2);
    expect(itemsOf(pages)).toHaveLength(2);
  });

  it('écarte le doublon d’une note qui change de page pendant la lecture', async () => {
    const [note] = bulkNotes(1, 4);
    const page1 = { data: [note], links: { next: `${API}/notes?pageCursor=c2` } };
    const page2 = { data: [note], links: { next: null } };
    const { pages } = await runSync([noteRoute(page1), noteRoute(page2)]);

    expect(itemsOf(pages)).toHaveLength(1);
  });

  it('refuse une page suivante sans curseur lisible plutôt que de tronquer la lecture', async () => {
    const page1 = { data: bulkNotes(1, 1), links: { next: `${API}/notes?autre=1` } };

    await expect(runSync([noteRoute(page1)])).rejects.toBeInstanceOf(ConnectorHttpError);
  });

  it('ne suit jamais l’adresse de la page suivante, seulement son curseur', async () => {
    const page1 = {
      data: bulkNotes(1, 1),
      links: { next: 'https://autre.test/v2/notes?pageCursor=c2' },
    };
    const { calls } = await runSync([noteRoute(page1), noteRoute(notesEmpty)]);

    // Seul le curseur compte : la requête suivante repart toujours de l'API de Productboard.
    expect(calls.map((call) => new URL(call.url).host)).toEqual([
      'api.productboard.com',
      'api.productboard.com',
    ]);
    expect(paramsOf(calls[1]?.url).pageCursor).toBe('c2');
  });

  it('laisse remonter un 401 de la liste', async () => {
    const run = runSync([noteRoute({ errors: [] }, { status: 401 })]);

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('ne met jamais le jeton dans les adresses appelées', async () => {
    const { calls } = await runSync([noteRoute(notesPage1), noteRoute(notesPage2)]);

    for (const call of calls) expect(call.url).not.toContain(TOKEN);
  });
});

// Le chemin du bouton, comme le suit `/retour` : `toConfig`, la configuration construite par le socle
// (les jetons passent après les champs de l'outil, qui ne peut rien écraser), le schéma, puis `verify`.
describe('productboard : branchement par le bouton', () => {
  it('rend une configuration que le schéma accepte, et dont verify tire le nom de l’espace', async () => {
    const setupHttp = createConnectorHttp({
      provider: 'productboard',
      hosts: productboardOAuth.setupHosts,
      fetchImpl: fakeFetch([
        { url: 'https://app.productboard.com/oauth2/token/info', json: tokenInfo },
      ]),
    });
    const tokens = {
      accessToken: TOKEN,
      refreshToken: 'pb-rafraichissement-de-test',
      expiresAt: '2026-10-16T09:00:00.000Z',
      scope: 'notes:read',
      raw: { token_type: 'Bearer' },
    };

    const saved = {
      ...(await productboardOAuth.toConfig(tokens, {}, setupHttp)),
      authMode: 'oauth',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    };
    const parsed = productboardConnector.configSchema.parse(saved);
    const { http } = testHttp(productboardConnector, parsed, [noteRoute(notesEmpty)]);

    expect(parsed).toEqual(config);
    await expect(productboardConnector.verify(parsed, http)).resolves.toEqual({
      account: 'Productboard (Acme)',
    });
  });
});

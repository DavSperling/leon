import { describe, expect, it } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { folkConnector } from './connector';
import notesPage1 from './fixtures/notes-page-1.json';
import notesPage2 from './fixtures/notes-page-2.json';
import userMe from './fixtures/user-me.json';

const API = 'https://api.folk.app/v1';
const NOTES = `${API}/notes`;
const KEY = 'CLEDETEST0123456789abcdefghijklmnop';
const config = { apiKey: KEY };
const SINCE = new Date('2026-09-15T00:00:00Z');
const NEXT_LINK = notesPage1.data.pagination.nextLink;

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const paramsOf = (url: string | undefined) =>
  Object.fromEntries(new URL(url ?? '').searchParams) as Record<string, string>;

async function runSync(
  routes: FakeRoute[],
  overrides: { cursor?: string | null; since?: Date } = {},
) {
  const { http, calls } = testHttp(folkConnector, config, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(folkConnector.sync(config, state, http));
  return { pages, calls };
}

// Les deux pages de la fixture : la liste de l'outil n'est pas triée par date (aucun tri n'est
// documenté), et la deuxième page est atteinte par le lien `nextLink` de la première.
function firstPassRoutes(): FakeRoute[] {
  return [
    { url: NOTES, json: notesPage1 },
    { url: NEXT_LINK, json: notesPage2 },
  ];
}

const marie = { type: 'user', fullName: 'Marie Durand', email: 'marie@acme.test', deleted: false };

function note(id: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    entity: { id: `per_${'0'.repeat(36)}`, entityType: 'person', fullName: 'Claire Dubois' },
    visibility: 'public',
    content: `Texte de ${id}`,
    author: marie,
    createdAt,
    parentNote: null,
    ...extra,
  };
}

const list = (items: unknown[], nextLink?: string) => ({
  data: { items, pagination: nextLink ? { nextLink } : {} },
});

describe('folk : configuration', () => {
  const schema = folkConnector.configSchema;

  it('accepte une clé d’API, sans les espaces autour', () => {
    expect(schema.parse({ apiKey: `  ${KEY} ` })).toEqual({ apiKey: KEY });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ apiKey: '   ' }).success).toBe(false);
  });

  it('fixe l’hôte, le champ à chiffrer et le rythme des requêtes (20 par 2 secondes)', () => {
    expect(folkConnector.hosts(config)).toEqual(['api.folk.app']);
    expect(folkConnector.secretFields).toEqual(['apiKey']);
    expect(folkConnector.minIntervalMs).toBeGreaterThanOrEqual(100);
  });

  it('est disponible dans le registre et le catalogue, avec l’avertissement sur la bêta', () => {
    expect(getConnector('folk')).toBe(folkConnector);
    const entry = listCatalog().find((item) => item.id === 'folk');
    expect(entry?.available).toBe(true);
    expect(entry?.warning).toMatch(/bêta/);
  });
});

describe('folk : verify', () => {
  it('lit l’utilisateur de la clé, avec la clé en Bearer et la version de l’API épinglée', async () => {
    const { http, calls } = testHttp(folkConnector, config, [
      { url: `${API}/users/me`, json: userMe },
    ]);

    const result = await folkConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (marie@acme.test)' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0]?.headers['x-api-version']).toBe('2025-06-09');
  });

  it('refuse une clé rejetée, sans la reprendre dans le message', async () => {
    const { http } = testHttp(folkConnector, config, [{ url: `${API}/users/me`, status: 401 }]);

    const failure = await folkConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
    expect((failure as Error).message).not.toContain(KEY);
  });
});

describe('folk : sync, premier passage', () => {
  it('demande les notes créées après since, 50 par page, la clé dans l’en-tête seulement', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls[0]?.url.startsWith(`${NOTES}?`)).toBe(true);
    expect(paramsOf(calls[0]?.url)).toEqual({
      limit: '50',
      createdAfter: '2026-09-15T00:00:00.000Z',
    });
    for (const call of calls) {
      expect(call.headers.authorization).toBe(`Bearer ${KEY}`);
      expect(call.headers['x-api-version']).toBe('2025-06-09');
      expect(call.url).not.toContain(KEY);
    }
  });

  it('suit le lien nextLink tel quel pour la page suivante', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.map((call) => call.url)).toEqual([calls[0]?.url, NEXT_LINK]);
  });

  it('rend les notes dans l’ordre de leur création, quel que soit l’ordre de la liste', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(1);
    expect(idsOf(pages)).toEqual([
      'note:nte_5e92d4a1-0b68-4f37-9c15-7a3d8e2b6c40',
      'note:nte_a8b35e72-4f19-4c60-8d27-3e9c1b0f5a64',
      'note:nte_6d0a9c47-3e12-4b85-a7f6-1c8e5d2b9034',
      'note:nte_2f6c0d1e-7b3a-4c58-9e41-0a5d8b7c6f23',
      'note:nte_91118b73-5a75-480b-b8e3-a33671c35cdc',
    ]);
  });

  it('range une note en un tour document, daté de sa création, au nom de son auteur', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) =>
      i.externalId.endsWith('nte_91118b73-5a75-480b-b8e3-a33671c35cdc'),
    );
    expect(item).toEqual({
      externalId: 'note:nte_91118b73-5a75-480b-b8e3-a33671c35cdc',
      nature: 'note',
      title: 'Note sur Claire Dubois',
      url: null,
      updatedAt: '2026-10-14T16:20:00.000Z',
      origin: { entity: 'Claire Dubois', entityType: 'person' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: '## Point du 14/10\n\nClaire valide le devis de 12 000 € HT. Elle veut une démo avec son équipe technique avant le 30/10.\n\nProchaine étape : Marie envoie le planning de démo.',
          ts: '2026-10-14T16:20:00.000Z',
        },
      ],
    });
  });

  it('range une réponse à une note en tour participant, sur la fiche de l’entreprise', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) =>
      i.externalId.endsWith('nte_2f6c0d1e-7b3a-4c58-9e41-0a5d8b7c6f23'),
    );
    expect(item?.title).toBe('Note sur Dubois Conseil');
    expect(item?.origin).toEqual({ entity: 'Dubois Conseil', entityType: 'company' });
    expect(item?.turns).toEqual([
      {
        externalId: 'body',
        role: 'participant',
        author: { name: 'David Martin', email: 'david@acme.test' },
        text: "D'accord pour 12 000 €, mais seulement si la formation est incluse.",
        ts: '2026-10-13T09:30:00.000Z',
      },
    ]);
  });

  it('nomme l’assistant de folk, et laisse l’auteur sans nom quand son compte est supprimé', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const byId = (id: string) => itemsOf(pages).find((i) => i.externalId === `note:${id}`);
    expect(byId('nte_a8b35e72-4f19-4c60-8d27-3e9c1b0f5a64')?.turns[0]?.author).toEqual({
      name: 'Assistant folk',
      email: null,
    });
    expect(byId('nte_5e92d4a1-0b68-4f37-9c15-7a3d8e2b6c40')?.turns[0]?.author).toEqual({
      name: null,
      email: null,
    });
  });

  it('convertit une date avec décalage horaire en instant UTC', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const item = itemsOf(pages).find((i) =>
      i.externalId.endsWith('nte_5e92d4a1-0b68-4f37-9c15-7a3d8e2b6c40'),
    );
    expect(item?.updatedAt).toBe('2026-10-11T15:45:00.000Z');
    expect(item?.turns[0]?.ts).toBe('2026-10-11T15:45:00.000Z');
  });

  it('ne rend pas une note privée, sans texte ou sans date de création', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const ids = idsOf(pages).join(' ');
    expect(ids).not.toContain('nte_c4e81f56'); // privée
    expect(ids).not.toContain('nte_d03f8a96'); // texte blanc
    expect(ids).not.toContain('nte_b17c6f83'); // createdAt nul
  });

  it('range le curseur après la dernière note lue, les notes écartées comprises', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages.at(-1))).toEqual({
      at: Date.parse('2026-10-14T16:20:00.000Z'),
      seen: ['nte_91118b73-5a75-480b-b8e3-a33671c35cdc'],
    });
  });

  it('rend des dates que le socle accepte', async () => {
    const { pages } = await runSync(firstPassRoutes());

    for (const item of itemsOf(pages))
      expect(normalizeItem(item, 'folk'), item.externalId).not.toBeNull();
  });

  it('ne rend aucune page quand il n’y a rien de nouveau', async () => {
    const { pages, calls } = await runSync([{ url: NOTES, json: list([]) }]);

    expect(pages).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('folk : sync, pages et curseur', () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 0, minutes)).toISOString();
  // 101 notes sur deux pages de l'outil (50 puis 51), de la plus récente à la plus ancienne.
  function bigRoutes(): FakeRoute[] {
    const rows = Array.from({ length: 101 }, (_, i) =>
      note(`nte_${String(i).padStart(3, '0')}`, at(100 - i)),
    );
    return [
      { url: NOTES, json: list(rows.slice(0, 50), NEXT_LINK) },
      { url: NEXT_LINK, json: list(rows.slice(50)) },
    ];
  }

  it('rend au plus 100 notes par page, avec un curseur après chacune', async () => {
    const { pages } = await runSync(bigRoutes());

    expect(pages.map((page) => page.items.length)).toEqual([100, 1]);
    // Dans l'ordre croissant : nte_100 est la plus ancienne (minute 0), nte_001 la deuxième plus récente.
    expect(cursorOf(pages[0])).toEqual({
      at: Date.parse(at(99)),
      seen: ['nte_001'],
    });
    expect(cursorOf(pages[1])).toEqual({ at: Date.parse(at(100)), seen: ['nte_000'] });
  });

  it('ne rend jamais deux fois la même note, même si la liste la répète', async () => {
    const dup = note('nte_dup', at(5));
    const routes = [
      { url: NOTES, json: list([dup], NEXT_LINK) },
      { url: NEXT_LINK, json: list([dup, note('nte_new', at(6))]) },
    ];

    const { pages } = await runSync(routes);

    expect(idsOf(pages)).toEqual(['note:nte_dup', 'note:nte_new']);
  });

  it('reprend après le curseur : relit un peu avant, écarte les notes déjà rendues, garde les autres du même instant', async () => {
    const mark = { at: Date.parse(at(10)), seen: ['nte_x'] };
    const routes = [
      {
        url: NOTES,
        json: list([
          note('nte_before', new Date(mark.at - 1).toISOString()), // si l'outil inclut la borne
          note('nte_x', at(10)),
          note('nte_y', at(10)),
          note('nte_z', at(11)),
        ]),
      },
    ];

    const { pages, calls } = await runSync(routes, { cursor: JSON.stringify(mark) });

    expect(paramsOf(calls[0]?.url).createdAfter).toBe(new Date(mark.at - 1).toISOString());
    expect(idsOf(pages)).toEqual(['note:nte_y', 'note:nte_z']);
    expect(cursorOf(pages.at(-1))).toEqual({ at: Date.parse(at(11)), seen: ['nte_z'] });
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { calls } = await runSync([{ url: NOTES, json: list([]) }], { cursor: 'pas du JSON' });

    expect(paramsOf(calls[0]?.url).createdAfter).toBe('2026-09-15T00:00:00.000Z');
  });

  it('ne tourne pas en rond quand le lien suivant ne ramène rien de neuf', async () => {
    const routes = [
      { url: NOTES, json: list([note('nte_a', at(1))], NEXT_LINK) },
      { url: NEXT_LINK, json: list([note('nte_a', at(1))], NEXT_LINK) },
    ];

    const { pages, calls } = await runSync(routes);

    expect(calls).toHaveLength(2);
    expect(idsOf(pages)).toEqual(['note:nte_a']);
  });
});

describe('folk : erreurs', () => {
  it.each([401, 403])(
    'remonte un %i sur la liste des notes comme une clé refusée',
    async (status) => {
      const failure = await runSync([{ url: NOTES, status }]).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ConnectorAuthError);
    },
  );

  it('remonte une clé retirée au milieu du passage', async () => {
    const routes = [
      { url: NOTES, json: list([note('nte_a', '2026-10-01T00:00:00.000Z')], NEXT_LINK) },
      { url: NEXT_LINK, status: 401 },
    ];

    const failure = await runSync(routes).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorAuthError);
  });

  it('refuse un lien suivant qui mène vers un autre hôte', async () => {
    const routes = [
      {
        url: NOTES,
        json: list(
          [note('nte_a', '2026-10-01T00:00:00.000Z')],
          'https://evil.test/v1/notes?cursor=x',
        ),
      },
    ];

    const failure = await runSync(routes).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Adresse non autorisée');
  });

  it('refuse une réponse qui n’a pas la forme attendue, sans en reprendre le texte', async () => {
    const failure = await runSync([{ url: NOTES, json: { data: { secret: KEY } } }]).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Réponse inattendue');
    expect((failure as Error).message).not.toContain(KEY);
  });

  it('tolère les champs en plus et un nom de fiche manquant', async () => {
    const odd = note('nte_odd', '2026-10-01T00:00:00.000Z', {
      entity: { id: 'per_x', entityType: 'object' },
      nouveauChamp: { a: 1 },
    });

    const { pages } = await runSync([{ url: NOTES, json: list([odd]) }]);

    expect(itemsOf(pages)[0]?.title).toBe('Note folk');
    expect(itemsOf(pages)[0]?.origin).toEqual({ entityType: 'object' });
  });
});

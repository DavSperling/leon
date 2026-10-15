import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  collect,
  expectHostsWellFormed,
  type FakeCall,
  type FakeRoute,
  testHttp,
} from '@/test/fake-fetch';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import type { ConnectorItem, SyncPage } from '../types';
import { linearConnector } from './connector';
import errorAuthentication from './fixtures/error-authentication.json';
import errorForbidden from './fixtures/error-forbidden.json';
import errorRatelimited from './fixtures/error-ratelimited.json';
import errorValidation from './fixtures/error-validation.json';
import issuesEmpty from './fixtures/issues-empty.json';
import issuesPage1 from './fixtures/issues-page-1.json';
import issuesPage2 from './fixtures/issues-page-2.json';
import projectUpdates from './fixtures/project-updates.json';
import projectUpdatesEmpty from './fixtures/project-updates-empty.json';
import viewer from './fixtures/viewer.json';

// Une clé générée à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const KEY = `lin_api_${randomBytes(12).toString('hex')}`;
const CONFIG = { apiKey: KEY };
const SINCE = new Date('2026-10-01T00:00:00.000Z');
const SINCE_ISO = SINCE.toISOString();
const TOP_ISSUES = '2026-10-14T16:20:00.000Z'; // le plus récent des tickets de la fixture
const TOP_UPDATES = '2026-10-14T12:30:00.000Z';

const graphql = (extra: Partial<FakeRoute> = {}): FakeRoute => ({
  method: 'POST',
  url: 'https://api.linear.app/graphql',
  ...extra,
});

type GraphqlBody = {
  query: string;
  variables: { first: number; after: string | null; filter: { updatedAt: { gt: string } } };
};
const bodyOf = (call: FakeCall | undefined) => call?.body as GraphqlBody;

function sync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(linearConnector, CONFIG, routes);
  return { pages: collect(linearConnector.sync(CONFIG, { cursor, since: SINCE }, http)), calls };
}

const twoPagesThenUpdates = (): FakeRoute[] => [
  graphql({ json: issuesPage1 }),
  graphql({ json: issuesPage2 }),
  graphql({ json: projectUpdates }),
];

describe('linearConnector : configuration', () => {
  it('refuse une configuration sans clé', () => {
    expect(linearConnector.configSchema.safeParse({}).success).toBe(false);
    expect(linearConnector.configSchema.safeParse({ apiKey: '' }).success).toBe(false);
    expect(linearConnector.configSchema.safeParse({ apiKey: '   ' }).success).toBe(false);
  });

  it('nettoie les espaces autour de la clé', () => {
    expect(linearConnector.configSchema.parse({ apiKey: ` ${KEY}\n` })).toEqual(CONFIG);
  });

  it('déclare un hôte exact et sa clé comme secrète', () => {
    expect(linearConnector.hosts(CONFIG)).toEqual(['api.linear.app']);
    expectHostsWellFormed(linearConnector.hosts(CONFIG));
    expect(linearConnector.secretFields).toEqual(['apiKey']);
  });
});

describe('linearConnector : verify', () => {
  it('rend le compte et envoie la clé telle quelle, sans « Bearer »', async () => {
    const { http, calls } = testHttp(linearConnector, CONFIG, [graphql({ json: viewer })]);

    await expect(linearConnector.verify(CONFIG, http)).resolves.toEqual({
      account: 'Marie Durand (Acme)',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://api.linear.app/graphql');
    expect(calls[0]?.headers.authorization).toBe(KEY);
    expect(bodyOf(calls[0]).query).toMatch(/viewer/);
  });

  it('lève ConnectorAuthError sur un 401', async () => {
    const { http } = testHttp(linearConnector, CONFIG, [graphql({ status: 401, json: {} })]);

    await expect(linearConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('lève ConnectorAuthError sur une erreur d’authentification rendue avec un 400', async () => {
    const { http } = testHttp(linearConnector, CONFIG, [
      graphql({ status: 400, json: errorAuthentication }),
    ]);

    await expect(linearConnector.verify(CONFIG, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('linearConnector : premier passage', () => {
  it('filtre sur since, trie par mise à jour et demande 50 tickets avec leurs commentaires', async () => {
    const { pages, calls } = sync(twoPagesThenUpdates());
    await pages;

    const first = bodyOf(calls[0]);
    expect(first.variables.filter).toEqual({ updatedAt: { gt: SINCE_ISO } });
    expect(first.variables.first).toBe(50);
    expect(first.variables.after).toBeNull();
    expect(first.query).toMatch(/orderBy: updatedAt/);
    expect(first.query).toMatch(/comments\(first: 50\)/);
    expect(calls[0]?.headers.authorization).toBe(KEY);
  });

  it('convertit un ticket en élément, commentaires triés par date', async () => {
    const [first] = await sync(twoPagesThenUpdates()).pages;
    const issue = issuesPage1.data.issues.nodes[0];

    expect(first?.items[0]).toEqual({
      externalId: `issue:${issue?.id}`,
      nature: 'ticket',
      title: 'LEO-12 Passer au plan Business',
      url: 'https://linear.app/acme/issue/LEO-12/passer-au-plan-business',
      updatedAt: TOP_ISSUES,
      origin: { team: 'Produit', project: 'Site vitrine' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: issue?.description ?? '',
          ts: TOP_ISSUES, // le corps vaut à la date de la dernière modification du ticket
        },
        {
          externalId: 'comment:c1d3e4f5-0000-4000-8000-000000000001',
          role: 'participant',
          author: { name: 'David Martin', email: 'david@acme.test' },
          text: 'Le plan Business coûte 12 euros par personne et par mois.',
          ts: '2026-10-13T09:00:00.000Z',
        },
        {
          externalId: 'comment:c2d3e4f5-0000-4000-8000-000000000002',
          role: 'participant',
          author: { name: 'Marie Durand', email: 'marie@acme.test' },
          text: 'OK, on part sur le plan Business dès le 1er novembre.',
          ts: TOP_ISSUES,
        },
      ],
    } satisfies ConnectorItem);
  });

  it('ne rend pas un ticket sans texte', async () => {
    const [first] = await sync(twoPagesThenUpdates()).pages;

    // LEO-11 n'a ni description ni commentaire : une page d'un seul élément.
    expect(first?.items.map((item) => item.title)).toEqual(['LEO-12 Passer au plan Business']);
  });

  it('compte dans le curseur la date d’un ticket sans texte', async () => {
    const silent = structuredClone(issuesPage2);
    const node = silent.data.issues.nodes[0];
    if (!node) throw new Error('fixture vide');
    Object.assign(node, { updatedAt: '2026-10-20T00:00:00.000Z', description: null });
    node.comments.nodes = [];

    const [page] = await sync([graphql({ json: silent }), graphql({ json: projectUpdatesEmpty })])
      .pages;

    expect(page?.items).toEqual([]);
    const cursor = JSON.parse(page?.cursor ?? '{}') as { issues: { from: string } };
    expect(cursor.issues.from).toBe('2026-10-20T00:00:00.000Z');
  });

  it('rend un commentaire sans compte (outil intégré) avec un auteur nul', async () => {
    const pages = await sync(twoPagesThenUpdates()).pages;
    const comment = pages[1]?.items[0]?.turns.at(-1);

    expect(comment?.author).toEqual({ name: null, email: null });
  });

  it('rend des éléments que le socle accepte (dates ISO avec fuseau)', async () => {
    const pages = await sync(twoPagesThenUpdates()).pages;
    const items = pages.flatMap((page) => page.items);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(normalizeItem(item, 'linear')).not.toBeNull();
  });
});

describe('linearConnector : pagination et curseur', () => {
  it('rend une page par page de l’outil, puis les mises à jour de projet', async () => {
    const pages = await sync(twoPagesThenUpdates()).pages;

    expect(pages.map((page) => page.items.map((item) => item.externalId.split(':')[0]))).toEqual([
      ['issue'],
      ['issue'],
      ['project-update'],
    ]);
  });

  it('demande la page suivante avec le curseur de l’outil, sur le même filtre', async () => {
    const { pages, calls } = sync(twoPagesThenUpdates());
    await pages;

    const second = bodyOf(calls[1]);
    expect(second.variables.after).toBe('cursor-issues-1');
    expect(second.variables.filter).toEqual({ updatedAt: { gt: SINCE_ISO } });
    expect(bodyOf(calls[2]).query).toMatch(/projectUpdates/);
    expect(bodyOf(calls[2]).variables.after).toBeNull();
  });

  it('repasse le dernier curseur sans refaire la première page', async () => {
    const all = await sync(twoPagesThenUpdates()).pages;
    const last = all.at(-1) as SyncPage;

    const { pages, calls } = sync(
      [graphql({ json: issuesEmpty }), graphql({ json: projectUpdatesEmpty })],
      last.cursor,
    );

    expect(await pages).toEqual([]);
    expect(bodyOf(calls[0]).variables.filter).toEqual({ updatedAt: { gt: TOP_ISSUES } });
    expect(bodyOf(calls[0]).variables.after).toBeNull();
    expect(bodyOf(calls[1]).variables.filter).toEqual({ updatedAt: { gt: TOP_UPDATES } });
  });

  it('reprend au milieu d’un passage, sur le filtre du début', async () => {
    const [first] = await sync(twoPagesThenUpdates()).pages;

    const { pages, calls } = sync(
      [graphql({ json: issuesPage2 }), graphql({ json: projectUpdates })],
      first?.cursor ?? null,
    );
    const resumed = await pages;

    expect(bodyOf(calls[0]).variables.after).toBe('cursor-issues-1');
    expect(bodyOf(calls[0]).variables.filter).toEqual({ updatedAt: { gt: SINCE_ISO } });
    expect(resumed).toHaveLength(2);
    // La date la plus récente vue avant la reprise est gardée : elle ne se perd pas.
    const done = JSON.parse(resumed[0]?.cursor ?? '{}') as { issues: { from: string } };
    expect(done.issues.from).toBe(TOP_ISSUES);
  });

  it('repart de since quand le curseur est illisible', async () => {
    const { pages, calls } = sync(
      [graphql({ json: issuesEmpty }), graphql({ json: projectUpdatesEmpty })],
      'pas du json',
    );
    await pages;

    expect(bodyOf(calls[0]).variables.filter).toEqual({ updatedAt: { gt: SINCE_ISO } });
  });

  it('ne rend rien quand rien n’a changé', async () => {
    const { pages } = sync([
      graphql({ json: issuesEmpty }),
      graphql({ json: projectUpdatesEmpty }),
    ]);

    expect(await pages).toEqual([]);
  });
});

describe('linearConnector : mises à jour de projet', () => {
  it('rend une mise à jour de projet comme une note', async () => {
    const pages = await sync(twoPagesThenUpdates()).pages;
    const update = projectUpdates.data.projectUpdates.nodes[0];

    expect(pages[2]?.items[0]).toEqual({
      externalId: `project-update:${update?.id}`,
      nature: 'note',
      title: 'Mise à jour du projet Site vitrine',
      url: 'https://linear.app/acme/project/site-vitrine-1a2b3c/updates',
      updatedAt: TOP_UPDATES,
      origin: { project: 'Site vitrine' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'David Martin', email: 'david@acme.test' },
          text: update?.body ?? '',
          ts: TOP_UPDATES,
        },
      ],
    } satisfies ConnectorItem);
  });

  it('livre les tickets même quand l’accès aux mises à jour de projet est refusé (403)', async () => {
    const pages = await sync([
      graphql({ json: issuesPage1 }),
      graphql({ json: issuesPage2 }),
      graphql({ status: 403, json: {} }),
    ]).pages;

    expect(pages).toHaveLength(2);
  });

  it('livre les tickets même quand l’outil refuse les mises à jour de projet (forbidden)', async () => {
    const pages = await sync([
      graphql({ json: issuesPage1 }),
      graphql({ json: issuesPage2 }),
      graphql({ status: 400, json: errorForbidden }),
    ]).pages;

    expect(pages).toHaveLength(2);
  });
});

describe('linearConnector : erreurs', () => {
  it('remonte une clé refusée sur les tickets, après avoir livré la première page', async () => {
    const { http } = testHttp(linearConnector, CONFIG, [
      graphql({ json: issuesPage1 }),
      graphql({ status: 401, json: {} }),
    ]);
    const seen: SyncPage[] = [];

    const run = (async () => {
      for await (const page of linearConnector.sync(CONFIG, { cursor: null, since: SINCE }, http)) {
        seen.push(page);
      }
    })();

    await expect(run).rejects.toBeInstanceOf(ConnectorAuthError);
    expect(seen).toHaveLength(1);
  });

  it('remonte un « forbidden » sur les tickets comme une clé refusée', async () => {
    const { pages } = sync([graphql({ status: 400, json: errorForbidden })]);

    await expect(pages).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('convertit RATELIMITED en limite atteinte, sans reprendre le texte de l’outil', async () => {
    const { pages } = sync([graphql({ status: 400, json: errorRatelimited })]);

    const error = await pages.catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect((error as ConnectorHttpError).status).toBe(429);
    expect((error as Error).message).toBe('Limite de requêtes de Linear atteinte');
  });

  it('convertit toute autre erreur en message fixe, sans le texte de l’outil ni la clé', async () => {
    const { pages } = sync([graphql({ status: 400, json: errorValidation })]);

    const error = await pages.catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorHttpError);
    expect((error as Error).message).toBe('Linear a refusé la requête');
    expect((error as Error).message).not.toContain('texte-de-l-outil');
    expect((error as Error).message).not.toContain(KEY);
  });

  it('refuse une erreur rendue avec un 200 comme une erreur', async () => {
    const { pages } = sync([graphql({ json: errorValidation })]);

    await expect(pages).rejects.toBeInstanceOf(ConnectorHttpError);
  });

  it('refuse une réponse sans données ni erreurs', async () => {
    const { pages } = sync([graphql({ json: {} })]);

    await expect(pages).rejects.toMatchObject({ message: 'Réponse inattendue' });
  });
});

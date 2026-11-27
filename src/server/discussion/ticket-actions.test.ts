import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import { linearConnector } from '@/server/connectors/linear/connector';
import linearForbidden from '@/server/connectors/linear/fixtures/error-forbidden.json';
import linearRatelimited from '@/server/connectors/linear/fixtures/error-ratelimited.json';
import { notionConnector } from '@/server/connectors/notion/connector';
import { trelloConnector } from '@/server/connectors/trello/connector';
import trelloBoards from '@/server/connectors/trello/fixtures/boards.json';
import trelloLists from '@/server/connectors/trello/fixtures/lists-board-a.json';
import { type FakeCall, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { validParams } from './github-actions';
import { paragraphs, TICKETS } from './ticket-actions';

// Les trois créations confirmées d'un clic (ticket-actions.ts), contre de fausses réponses : ce que chacune lit pour
// proposer, les paramètres qu'elle garde, puis la seule écriture, jamais rejouée. Le circuit en base (proposition,
// clic, codes d'erreur de la carte) est dans ticket-actions.db.test.ts.

// Des clés générées à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const hex = () => randomBytes(12).toString('hex');
const LINEAR = { authMode: 'key', apiKey: `lin_api_${hex()}` };
const TRELLO = { apiKey: hex(), token: hex() };
const NOTION = { authMode: 'key', token: `ntn_${hex()}` };

const TEAM = '5b8c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d';
const PROJECT = '0f1e2d3c-4b5a-4968-8776-655443322110';
const USER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const SOURCE = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const BOARD = trelloBoards[1]?.id; // « Site Acme », dont les listes sont dans lists-board-a.json
const TODO = trelloLists[0]?.id; // « À faire »

const graphql = (json: unknown, status = 200): FakeRoute => ({
  method: 'POST',
  url: 'https://api.linear.app/graphql',
  status,
  json,
});
const named = (nodes: Array<{ id: string; name?: string }>) => ({ nodes });
const graphqlOf = (call: FakeCall | undefined) =>
  call?.body as { query: string; variables: Record<string, unknown> };

const linear = TICKETS['linear.creer_ticket'];
const trello = TICKETS['trello.creer_carte'];
const notion = TICKETS['notion.creer_page'];

describe('creer_ticket_linear', () => {
  const open = (routes: FakeRoute[]) => {
    const { http, calls } = testHttp(linearConnector, LINEAR, routes);
    return { client: linear.client(LINEAR, http), calls };
  };
  const ASK = {
    equipe: 'eng',
    titre: 'Corriger la connexion',
    description: 'Le bouton **Se connecter** ne répond plus.',
    projet: 'Refonte',
    priorite: 'haute',
    assigne: 'alice@example.com',
  };

  it('trouve l’équipe par sa clé, son projet et l’assigné, sans rien écrire, et rend des paramètres valides', async () => {
    const { client, calls } = open([
      graphql({ data: { teams: named([{ id: TEAM, name: 'Engineering' }]) } }),
      graphql({ data: { team: { projects: named([{ id: PROJECT, name: 'Refonte' }]) } } }),
      graphql({ data: { users: named([{ id: USER }]) } }),
    ]);

    const params = await linear.prepare(client, linear.input.parse(ASK));

    expect(params).toEqual({
      team: 'Engineering',
      teamId: TEAM,
      title: 'Corriger la connexion',
      body: 'Le bouton **Se connecter** ne répond plus.',
      project: 'Refonte',
      projectId: PROJECT,
      priority: 'haute',
      assignee: 'alice@example.com',
      assigneeId: USER,
    });
    expect(validParams('linear.creer_ticket', params)).toBe(true);
    expect(calls.map((call) => graphqlOf(call).variables)).toEqual([
      { name: 'eng' },
      { teamId: TEAM, name: 'Refonte' },
      { email: 'alice@example.com' },
    ]);
    expect(calls.some((call) => graphqlOf(call).query.includes('mutation'))).toBe(false);
    expect(calls[0]?.headers.authorization).toBe(LINEAR.apiKey);
  });

  it('passe à la connexion suivante quand l’équipe est introuvable, et refuse ce qui est ambigu ou inconnu', async () => {
    const team = graphql({ data: { teams: named([{ id: TEAM, name: 'Engineering' }]) } });
    const input = linear.input.parse(ASK);

    expect(
      await linear.prepare(open([graphql({ data: { teams: named([]) } })]).client, input),
    ).toBeNull();
    expect(linear.notFound(input)).toContain('« eng »');
    const twoTeams = graphql({
      data: {
        teams: named([
          { id: TEAM, name: 'ENG' },
          { id: PROJECT, name: 'Eng' },
        ]),
      },
    });
    expect(await linear.prepare(open([twoTeams]).client, input)).toContain('Plusieurs équipes');
    const noProject = graphql({ data: { team: { projects: named([]) } } });
    expect(await linear.prepare(open([team, noProject]).client, input)).toContain('Aucun projet');
    const project = graphql({
      data: { team: { projects: named([{ id: PROJECT, name: 'Refonte' }]) } },
    });
    const nobody = graphql({ data: { users: named([]) } });
    expect(await linear.prepare(open([team, project, nobody]).client, input)).toContain(
      'Aucun membre actif',
    );
  });

  it('crée le ticket en une seule requête, avec la priorité de Linear, et rend son adresse', async () => {
    const url = 'https://linear.app/acme/issue/ENG-42/corriger-la-connexion';
    const { client, calls } = open([graphql({ data: { issueCreate: { issue: { url } } } })]);
    const params = {
      team: 'Engineering',
      teamId: TEAM,
      title: 'Corriger la connexion',
      body: '',
      priority: 'urgente',
    };
    if (!validParams('linear.creer_ticket', params)) throw new Error('paramètres refusés');

    expect(await linear.execute(client, params)).toBe(url);
    expect(calls).toHaveLength(1);
    expect(graphqlOf(calls[0]).query).toContain('issueCreate');
    // Une description vide n'est pas envoyée ; urgente vaut 1 chez Linear.
    expect(graphqlOf(calls[0]).variables).toEqual({
      input: { teamId: TEAM, title: 'Corriger la connexion', priority: 1 },
    });
  });

  it('ne rejoue jamais la création : une limite de débit ou un refus échoue après une seule requête', async () => {
    const params = { team: 'Engineering', teamId: TEAM, title: 'T', body: '' };
    if (!validParams('linear.creer_ticket', params)) throw new Error('paramètres refusés');
    for (const [route, error] of [
      [graphql({}, 429), ConnectorHttpError],
      [graphql(linearRatelimited, 400), ConnectorHttpError],
      [graphql(linearForbidden, 400), ConnectorAuthError],
      [graphql({}, 401), ConnectorAuthError],
    ] as const) {
      const { client, calls } = open([route, route]);

      await expect(linear.execute(client, params)).rejects.toBeInstanceOf(error);
      expect(calls).toHaveLength(1);
    }
  });
});

describe('creer_carte_trello', () => {
  const open = (routes: FakeRoute[]) => {
    const { http, calls } = testHttp(trelloConnector, TRELLO, routes);
    return { client: trello.client(TRELLO, http), calls };
  };
  const boards: FakeRoute = {
    url: 'https://api.trello.com/1/members/me/boards',
    json: trelloBoards,
  };
  const lists: FakeRoute = {
    url: `https://api.trello.com/1/boards/${BOARD}/lists`,
    json: trelloLists,
  };
  const ASK = {
    tableau: 'site acme',
    liste: 'à faire',
    titre: 'Relancer le client',
    description: 'Suite à la réunion d’hier.',
    echeance: '2026-12-04',
  };

  it('trouve le tableau et sa liste ouverte par leur nom, et rend des paramètres valides', async () => {
    const { client, calls } = open([boards, lists]);

    const params = await trello.prepare(client, trello.input.parse(ASK));

    expect(params).toEqual({
      board: 'Site Acme',
      list: 'À faire',
      listId: TODO,
      title: 'Relancer le client',
      body: 'Suite à la réunion d’hier.',
      due: '2026-12-04',
    });
    expect(validParams('trello.creer_carte', params)).toBe(true);
    expect(calls.map((call) => call.method)).toEqual(['GET', 'GET']);
    // Les listes archivées ne sont pas proposées.
    expect(new URL(calls[1]?.url ?? '').searchParams.get('filter')).toBe('open');
  });

  it('rend null pour un tableau inconnu, et refuse une liste qui n’existe pas', async () => {
    const input = trello.input.parse(ASK);

    expect(await trello.prepare(open([boards]).client, { ...input, tableau: 'Autre' })).toBeNull();
    expect(
      await trello.prepare(open([boards, lists]).client, { ...input, liste: 'Plus tard' }),
    ).toContain('Aucune liste ouverte');
  });

  it('crée la carte en une seule requête, échéance à midi UTC, et rend son adresse courte', async () => {
    const { client, calls } = open([
      {
        method: 'POST',
        url: 'https://api.trello.com/1/cards',
        json: { shortUrl: 'https://trello.com/c/AbCd1234' },
      },
    ]);
    const params = {
      board: 'Site Acme',
      list: 'À faire',
      listId: TODO,
      title: 'T',
      body: 'D',
      due: '2026-12-04',
    };
    if (!validParams('trello.creer_carte', params)) throw new Error('paramètres refusés');

    expect(await trello.execute(client, params)).toBe('https://trello.com/c/AbCd1234');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({
      idList: TODO,
      name: 'T',
      desc: 'D',
      due: '2026-12-04T12:00:00.000Z',
    });
    // La clé et le jeton passent par l'en-tête, jamais par l'adresse.
    expect(calls[0]?.url).toBe('https://api.trello.com/1/cards');
    expect(calls[0]?.headers.authorization).toContain(`oauth_token="${TRELLO.token}"`);
  });

  it('ne rejoue jamais la création : 401, 403 et 429 échouent après une seule requête', async () => {
    const params = { board: 'B', list: 'L', listId: TODO, title: 'T', body: '' };
    if (!validParams('trello.creer_carte', params)) throw new Error('paramètres refusés');
    for (const [status, error] of [
      [401, ConnectorAuthError],
      [403, ConnectorAuthError],
      [429, ConnectorHttpError],
    ] as const) {
      const route: FakeRoute = {
        method: 'POST',
        url: 'https://api.trello.com/1/cards',
        status,
        json: {},
      };
      const { client, calls } = open([route, route]);

      await expect(trello.execute(client, params)).rejects.toBeInstanceOf(error);
      expect(calls).toHaveLength(1);
    }
  });
});

describe('creer_page_notion', () => {
  const open = (routes: FakeRoute[]) => {
    const { http, calls } = testHttp(notionConnector, NOTION, routes);
    return { client: notion.client(NOTION, http), calls };
  };
  const source = (title: string, id = SOURCE) => ({
    object: 'data_source',
    id,
    title: [{ plain_text: title }],
    properties: { État: { id: '%3AUPp', type: 'status' }, Nom: { id: 'title', type: 'title' } },
  });
  const search = (...results: unknown[]): FakeRoute => ({
    method: 'POST',
    url: 'https://api.notion.com/v1/search',
    json: { object: 'list', results, next_cursor: null, has_more: false },
  });
  const ASK = { base: 'tâches', titre: 'Compte rendu', contenu: 'Premier point.\n\nSecond point.' };

  it('trouve la base par son nom et sa colonne titre par son identifiant, et rend des paramètres valides', async () => {
    const { client, calls } = open([search(source('Tâches'), source('Tâches 2026', PROJECT))]);

    const params = await notion.prepare(client, notion.input.parse(ASK));

    expect(params).toEqual({
      database: 'Tâches',
      dataSourceId: SOURCE,
      titleProperty: 'title',
      title: 'Compte rendu',
      body: 'Premier point.\n\nSecond point.',
    });
    expect(validParams('notion.creer_page', params)).toBe(true);
    expect(calls[0]?.body).toMatchObject({
      query: 'tâches',
      filter: { property: 'object', value: 'data_source' },
    });
    expect(calls[0]?.headers['notion-version']).toBe('2026-03-11');
  });

  it('rend null pour une base introuvable, et refuse une base ambiguë ou un contenu de plus de 100 paragraphes', async () => {
    const input = notion.input.parse(ASK);

    expect(await notion.prepare(open([search(source('Tâches 2026'))]).client, input)).toBeNull();
    expect(
      await notion.prepare(
        open([search(source('Tâches'), source('tâches', PROJECT))]).client,
        input,
      ),
    ).toContain('Plusieurs bases');
    const long = { ...input, contenu: Array(101).fill('Point.').join('\n\n') };
    expect(await notion.prepare(open([search(source('Tâches'))]).client, long)).toContain(
      '100 paragraphes',
    );
  });

  it('crée la page dans la base en une seule requête, un paragraphe par bloc, et rend son adresse', async () => {
    const url = 'https://www.notion.so/Compte-rendu-0123456789abcdef0123456789abcdef';
    const { client, calls } = open([
      { method: 'POST', url: 'https://api.notion.com/v1/pages', json: { url } },
    ]);
    const params = {
      database: 'Tâches',
      dataSourceId: SOURCE,
      titleProperty: 'title',
      title: 'Compte rendu',
      body: 'Premier point.\n\nSecond point.',
    };
    if (!validParams('notion.creer_page', params)) throw new Error('paramètres refusés');

    expect(await notion.execute(client, params)).toBe(url);
    expect(calls).toHaveLength(1);
    const paragraph = (content: string) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content } }] },
    });
    expect(calls[0]?.body).toEqual({
      parent: { type: 'data_source_id', data_source_id: SOURCE },
      properties: { title: { title: [{ type: 'text', text: { content: 'Compte rendu' } }] } },
      children: [paragraph('Premier point.'), paragraph('Second point.')],
    });
  });

  it('ne rejoue jamais la création : 403 et 429 échouent après une seule requête', async () => {
    const params = {
      database: 'T',
      dataSourceId: SOURCE,
      titleProperty: 'title',
      title: 'T',
      body: '',
    };
    if (!validParams('notion.creer_page', params)) throw new Error('paramètres refusés');
    for (const [status, error] of [
      [403, ConnectorAuthError],
      [429, ConnectorHttpError],
    ] as const) {
      const route: FakeRoute = {
        method: 'POST',
        url: 'https://api.notion.com/v1/pages',
        status,
        json: {},
      };
      const { client, calls } = open([route, route]);

      await expect(notion.execute(client, params)).rejects.toBeInstanceOf(error);
      expect(calls).toHaveLength(1);
      // Une page sans contenu n'envoie pas de blocs.
      expect(calls[0]?.body).not.toHaveProperty('children');
    }
  });
});

describe('paragraphs', () => {
  it('rend un paragraphe par bloc séparé d’une ligne vide, sans les vides', () => {
    expect(paragraphs('  Un\nDeux \n\n\n  \nTrois\r\n\r\n')).toEqual(['Un\nDeux', 'Trois']);
    expect(paragraphs('')).toEqual([]);
  });

  it('coupe un paragraphe trop long au dernier saut de ligne, sinon à la dernière espace, en 2 000 caractères au plus', () => {
    const line = 'mot '.repeat(400).trim(); // 1 599 caractères
    const parts = paragraphs(`${line}\n${line}`);

    expect(parts).toEqual([line, line]);
    const words = paragraphs('mot '.repeat(1000).trim());
    expect(words.every((part) => part.length <= 2000 && !part.endsWith(' '))).toBe(true);
    expect(words.join(' ')).toBe('mot '.repeat(1000).trim());
  });

  it('coupe un texte sans espace à 2 000 caractères, sans séparer une paire de substitution', () => {
    const text = `${'a'.repeat(1999)}😀${'b'.repeat(10)}`;

    expect(paragraphs(text)).toEqual(['a'.repeat(1999), `😀${'b'.repeat(10)}`]);
  });
});

import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProviderId } from '@/capture/turn';
import type { ActionView } from '@/lib/actions';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createConnection } from '@/server/connectors/connections';
import type { AgentTool } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { adminPool } from '@/test/db';
import { type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { dropTeams, newTeam } from '@/test/seed-indexed';
import { decideAction } from './decide-action';
import { createDiscussion } from './discussions';
import { myTicketProviders, ticketTools } from './ticket-actions';

// Les créations dans Linear, Trello et Notion confirmées d'un clic (ticket-actions.ts), sur de vraies lignes : l'outil
// n'est offert qu'à qui a branché l'outil lui-même ; il propose sans rien écrire ; seul le clic de l'auteur écrit, une
// fois, avec sa propre connexion ; un refus de l'outil devient un code de la carte, jamais son texte.

// Des clés générées à l'exécution : aucun secret, même d'exemple, dans le dépôt.
const hex = () => randomBytes(12).toString('hex');
const LINEAR_KEY = `lin_api_${hex()}`;
const TRELLO = { apiKey: hex(), token: hex() };
const NOTION_TOKEN = `ntn_${hex()}`;
const TEAM = '5b8c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d';
const SOURCE = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const BOARD = '5f2b3c4d5e6f7a8b9c0d00a1';
const LIST = '5f2b3c4d5e6f7a8b9c0d11a1';
const ASKED = 'Mets-le dans nos outils';
const tenantIds: string[] = [];
afterAll(() => dropTeams(tenantIds));

// Sans échéance : la relève des autres tests (worker.db.test.ts) ne prend pas ces connexions.
async function notDue(id: string) {
  await adminPool.query('update connections set next_sync_at = null where id = $1', [id]);
  return id;
}

// Alice branche Linear, Trello et Notion ; Bob, de la même équipe, rien.
let alice: TenantContext;
let bob: TenantContext;
beforeAll(async () => {
  const { members } = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  [alice, bob] = members as [TenantContext, TenantContext];
  const connect = (provider: ProviderId, config: Record<string, unknown>, secret: string) =>
    createConnection(alice, {
      provider,
      label: provider,
      config,
      secretFields: [secret],
      since: new Date('2026-09-01T00:00:00Z'),
    }).then(notDue);
  await connect('linear', { authMode: 'key', apiKey: LINEAR_KEY }, 'apiKey');
  await connect('trello', TRELLO, 'token');
  await connect('notion', { authMode: 'key', token: NOTION_TOKEN }, 'token');
});

const linearRoute = (json: unknown, status = 200): FakeRoute => ({
  method: 'POST',
  url: 'https://api.linear.app/graphql',
  status,
  json,
});
const TEAMS = linearRoute({ data: { teams: { nodes: [{ id: TEAM, name: 'Engineering' }] } } });
const BOARDS: FakeRoute = {
  url: 'https://api.trello.com/1/members/me/boards',
  json: [{ id: BOARD, name: 'Site Acme' }],
};
const LISTS: FakeRoute = {
  url: `https://api.trello.com/1/boards/${BOARD}/lists`,
  json: [{ id: LIST, name: 'À faire' }],
};
const SEARCH: FakeRoute = {
  method: 'POST',
  url: 'https://api.notion.com/v1/search',
  json: {
    object: 'list',
    results: [
      {
        object: 'data_source',
        id: SOURCE,
        title: [{ plain_text: 'Tâches' }],
        properties: { Nom: { id: 'title', type: 'title' } },
      },
    ],
    next_cursor: null,
    has_more: false,
  },
};

const LINEAR_ASK = { equipe: 'ENG', titre: 'Corriger la connexion', description: 'Vu en réunion.' };
const TRELLO_ASK = { tableau: 'Site Acme', liste: 'À faire', titre: 'Relancer le client' };
const NOTION_ASK = { base: 'Tâches', titre: 'Compte rendu', contenu: 'Premier point.' };

async function propose(tool: string, input: Record<string, unknown>, routes: FakeRoute[]) {
  const discussionId = await createDiscussion(alice, { question: 'Crée-le' });
  const fetchImpl = fakeFetch(routes);
  const proposed: ActionView[] = [];
  const found = ticketTools(
    alice,
    {
      budget: { chars: 40_000 },
      discussionId,
      fetchImpl,
      asked: ASKED,
      onAction: (action) => proposed.push(action),
    },
    await myTicketProviders(alice),
  ).find((item) => item.name === tool) as AgentTool;
  // Comme l'agent : l'entrée passe d'abord par le schéma de l'outil.
  const text = await found.run(found.input.parse(input));
  return { text, action: proposed[0] as ActionView, fetchImpl };
}

describe('les outils de création', () => {
  it('ne sont offerts qu’à qui a branché l’outil lui-même, jamais avec la connexion d’un collègue', async () => {
    const deps = { budget: { chars: 40_000 } };

    expect(await myTicketProviders(alice)).toEqual(['linear', 'trello', 'notion']);
    expect(await myTicketProviders(bob)).toEqual([]);
    const names = (ctx: TenantContext) =>
      myTicketProviders(ctx).then((mine) => ticketTools(ctx, deps, mine).map((tool) => tool.name));
    expect(await names(alice)).toEqual([
      'creer_ticket_linear',
      'creer_carte_trello',
      'creer_page_notion',
    ]);
    expect(await names(bob)).toEqual([]);
  });

  it('creer_ticket_linear propose sans écrire, puis crée le ticket au seul clic de l’autrice, une fois', async () => {
    const {
      text,
      action,
      fetchImpl: reading,
    } = await propose('creer_ticket_linear', LINEAR_ASK, [TEAMS]);

    expect(action).toMatchObject({
      kind: 'linear.creer_ticket',
      status: 'proposee',
      params: {
        team: 'Engineering',
        teamId: TEAM,
        title: 'Corriger la connexion',
        body: 'Vu en réunion.',
        asked: ASKED,
      },
    });
    expect(reading.calls).toHaveLength(1);
    expect(JSON.stringify(reading.calls[0]?.body)).not.toContain('mutation');
    expect(text.split('\n')[0]).toBe(DATA_GUARD_LINE);
    expect(text).toContain(
      '<linear>\ncréer le ticket « Corriger la connexion » dans l’équipe Linear « Engineering »',
    );
    expect(text).toContain('Ne dis pas que c’est fait');

    const url = 'https://linear.app/acme/issue/ENG-42/corriger-la-connexion';
    const fetchImpl = fakeFetch([linearRoute({ data: { issueCreate: { issue: { url } } } })]);
    expect(await decideAction(bob, action.id, 'confirmer', { fetchImpl })).toBeNull();
    const done = await decideAction(alice, action.id, 'confirmer', { fetchImpl });
    const again = await decideAction(alice, action.id, 'confirmer', { fetchImpl });

    expect(done).toMatchObject({ status: 'faite', result: { url, error: null } });
    expect(again).toMatchObject({ status: 'faite' });
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0]?.headers.authorization).toBe(LINEAR_KEY);
    expect(fetchImpl.calls[0]?.body).toMatchObject({
      variables: {
        input: { teamId: TEAM, title: 'Corriger la connexion', description: 'Vu en réunion.' },
      },
    });
  });

  it('creer_carte_trello crée la carte au clic et rend son adresse courte', async () => {
    const { action } = await propose('creer_carte_trello', TRELLO_ASK, [BOARDS, LISTS]);
    const card = 'https://trello.com/c/AbCd1234';
    const fetchImpl = fakeFetch([
      { method: 'POST', url: 'https://api.trello.com/1/cards', json: { shortUrl: card } },
    ]);

    const done = await decideAction(alice, action.id, 'confirmer', { fetchImpl });

    expect(done).toMatchObject({ status: 'faite', result: { url: card, error: null } });
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0]?.body).toEqual({
      idList: LIST,
      name: 'Relancer le client',
      desc: '',
    });
  });

  it('creer_page_notion crée la page dans la base au clic et rend son adresse', async () => {
    const { action } = await propose('creer_page_notion', NOTION_ASK, [SEARCH]);
    const page = 'https://www.notion.so/Compte-rendu-0123456789abcdef0123456789abcdef';
    const fetchImpl = fakeFetch([
      { method: 'POST', url: 'https://api.notion.com/v1/pages', json: { url: page } },
    ]);

    const done = await decideAction(alice, action.id, 'confirmer', { fetchImpl });

    expect(done).toMatchObject({ status: 'faite', result: { url: page, error: null } });
    expect(fetchImpl.calls[0]?.headers.authorization).toBe(`Bearer ${NOTION_TOKEN}`);
    expect(fetchImpl.calls[0]?.body).toMatchObject({
      parent: { type: 'data_source_id', data_source_id: SOURCE },
    });
  });

  it('ne propose rien quand l’équipe, le tableau ou la base est introuvable', async () => {
    const noTeam = linearRoute({ data: { teams: { nodes: [] } } });
    const linear = await propose('creer_ticket_linear', LINEAR_ASK, [noTeam]);
    const trello = await propose('creer_carte_trello', { ...TRELLO_ASK, tableau: 'Autre' }, [
      BOARDS,
    ]);

    expect(linear.action).toBeUndefined();
    expect(linear.text).toContain('Aucune équipe Linear ne s’appelle « ENG »');
    expect(trello.action).toBeUndefined();
    expect(trello.text).toContain('Aucun tableau Trello ouvert');
  });
});

describe('le clic', () => {
  // Chaque refus d'écriture, sur une action neuve : le code que la carte traduit, et une seule requête.
  it.each([
    {
      what: 'Trello refuse le jeton qui ne fait que lire (401)',
      tool: 'creer_carte_trello',
      input: TRELLO_ASK,
      read: [BOARDS, LISTS],
      write: { method: 'POST', url: 'https://api.trello.com/1/cards', status: 401, json: {} },
      error: 'droits',
    },
    {
      what: 'Notion refuse d’insérer du contenu (403)',
      tool: 'creer_page_notion',
      input: NOTION_ASK,
      read: [SEARCH],
      write: { method: 'POST', url: 'https://api.notion.com/v1/pages', status: 403, json: {} },
      error: 'droits',
    },
    {
      what: 'Linear limite le débit (429) : rien n’est rejoué',
      tool: 'creer_ticket_linear',
      input: LINEAR_ASK,
      read: [TEAMS],
      write: linearRoute({}, 429),
      error: 'echec',
    },
  ] as const)('$what → « $error »', async ({ tool, input, read, write, error }) => {
    const { action } = await propose(tool, input, [...read]);
    const fetchImpl = fakeFetch([write, write]);

    const done = await decideAction(alice, action.id, 'confirmer', { fetchImpl });

    expect(done).toMatchObject({ status: 'echouee', result: { url: null, error } });
    expect(fetchImpl.calls).toHaveLength(1);
  });
});

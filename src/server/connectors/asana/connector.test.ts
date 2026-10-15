import { describe, expect, it } from 'vitest';
import { collect, type FakeCall, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { listCatalog } from '../catalog';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import { getConnector } from '../registry';
import type { ConnectorItem, SyncPage } from '../types';
import { asanaConnector } from './connector';
import projectsPage1 from './fixtures/projects-page-1.json';
import projectsPage2 from './fixtures/projects-page-2.json';
import stories4001 from './fixtures/stories-4001.json';
import stories4002 from './fixtures/stories-4002.json';
import storiesEmpty from './fixtures/stories-empty.json';
import tasks3001Page1 from './fixtures/tasks-3001-page-1.json';
import tasks3001Page2 from './fixtures/tasks-3001-page-2.json';
import tasks3002 from './fixtures/tasks-3002.json';
import tasksEmpty from './fixtures/tasks-empty.json';
import me from './fixtures/user-me.json';

const API = 'https://app.asana.com/api/1.0';
const TOKEN = 'jeton-de-test-0123456789';
const config = { token: TOKEN };
const SINCE = new Date('2026-09-15T00:00:00.000Z');
const OFFSET_PROJECTS = 'cHJvamV0cy1wYWdlLTI';
const OFFSET_TASKS = 'dGFza3MtMzAwMS1wYWdlLTI';

const route = (path: string, json: unknown, extra: Partial<FakeRoute> = {}): FakeRoute => ({
  url: `${API}${path}`,
  json,
  ...extra,
});

// Les routes d'un premier passage : deux projets (le second sur une deuxième page de projets),
// le premier avec deux pages de tâches. Les routes d'une même adresse se servent dans l'ordre.
function firstPassRoutes(): FakeRoute[] {
  return [
    route('/users/me', me),
    route('/projects', projectsPage1),
    route('/projects', projectsPage2),
    route('/tasks', tasks3001Page1),
    route('/tasks/4001/stories', stories4001),
    route('/tasks/4002/stories', stories4002),
    route('/tasks/4003/stories', storiesEmpty),
    route('/tasks', tasks3001Page2),
    route('/tasks/4004/stories', storiesEmpty),
    route('/tasks', tasks3002),
    route('/tasks/4005/stories', storiesEmpty),
  ];
}

async function runSync(
  routes: FakeRoute[],
  overrides: {
    cursor?: string | null;
    since?: Date;
    config?: { token: string; workspace?: string };
  } = {},
) {
  const cfg = overrides.config ?? config;
  const { http, calls } = testHttp(asanaConnector, cfg, routes);
  const state = { cursor: overrides.cursor ?? null, since: overrides.since ?? SINCE };
  const pages = await collect(asanaConnector.sync(cfg, state, http));
  return { pages, calls };
}

const itemsOf = (pages: SyncPage[]): ConnectorItem[] => pages.flatMap((page) => page.items);
const idsOf = (pages: SyncPage[]) => itemsOf(pages).map((item) => item.externalId);
const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');
const pathOf = (call: FakeCall | undefined) => new URL(call?.url ?? '').pathname.slice(8);
const paramsOf = (call: FakeCall | undefined) =>
  Object.fromEntries(new URL(call?.url ?? '').searchParams);
const tasksCalls = (calls: FakeCall[]) => calls.filter((call) => pathOf(call) === '/tasks');

describe('asana : configuration', () => {
  const schema = asanaConnector.configSchema;

  it('accepte un jeton seul, sans les espaces autour, et un espace facultatif', () => {
    expect(schema.parse({ token: `  ${TOKEN} ` })).toEqual({ token: TOKEN });
    expect(schema.parse({ token: TOKEN, workspace: ' Acme ' })).toEqual({
      token: TOKEN,
      workspace: 'Acme',
    });
  });

  it('refuse une configuration incomplète', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ token: '   ' }).success).toBe(false);
    expect(schema.safeParse({ workspace: 'Acme' }).success).toBe(false);
  });

  it('fixe l’hôte, le champ à chiffrer et un rythme sous la limite gratuite (150 par minute)', () => {
    expect(asanaConnector.hosts(config)).toEqual(['app.asana.com']);
    expect(asanaConnector.secretFields).toEqual(['token']);
    expect(asanaConnector.minIntervalMs).toBeGreaterThanOrEqual(400);
  });

  it('est disponible dans le registre et le catalogue', () => {
    expect(getConnector('asana')).toBe(asanaConnector);
    expect(listCatalog().find((item) => item.id === 'asana')?.available).toBe(true);
  });
});

describe('asana : verify', () => {
  it('lit le compte avec l’authentification d’Asana et rend le nom et l’espace', async () => {
    const { http, calls } = testHttp(asanaConnector, config, [route('/users/me', me)]);

    const result = await asanaConnector.verify(config, http);

    expect(result).toEqual({ account: 'Marie Durand (Acme)' });
    expect(calls).toHaveLength(1);
    expect(pathOf(calls[0])).toBe('/users/me');
    expect(paramsOf(calls[0])).toEqual({ opt_fields: 'name,workspaces.name' });
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('choisit l’espace par son nom (sans tenir compte des majuscules) ou par son identifiant', async () => {
    for (const workspace of ['perso', 'PERSO', '2002']) {
      const cfg = { ...config, workspace };
      const { http } = testHttp(asanaConnector, cfg, [route('/users/me', me)]);

      const result = await asanaConnector.verify(cfg, http);

      expect(result.account, workspace).toBe('Marie Durand (Perso)');
    }
  });

  it('refuse un espace que le compte ne voit pas', async () => {
    const cfg = { ...config, workspace: 'Autre' };
    const { http } = testHttp(asanaConnector, cfg, [route('/users/me', me)]);

    const failure = await asanaConnector.verify(cfg, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Espace introuvable : Autre');
  });

  it('refuse un compte sans espace', async () => {
    const empty = { data: { ...me.data, workspaces: [] } };
    const { http } = testHttp(asanaConnector, config, [route('/users/me', empty)]);

    const failure = await asanaConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).toBe('Aucun espace Asana accessible');
  });

  it('refuse un jeton rejeté', async () => {
    const { http } = testHttp(asanaConnector, config, [route('/users/me', null, { status: 401 })]);

    await expect(asanaConnector.verify(config, http)).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe('asana : sync, premier passage', () => {
  it('liste les projets non archivés du premier espace, page suivante par l’offset donné', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.slice(0, 3).map(pathOf)).toEqual(['/users/me', '/projects', '/projects']);
    expect(paramsOf(calls[1])).toEqual({
      workspace: '2001',
      archived: 'false',
      limit: '100',
      opt_fields: 'name',
    });
    expect(paramsOf(calls[2])).toMatchObject({ workspace: '2001', offset: OFFSET_PROJECTS });
  });

  it('prend l’espace choisi dans la configuration', async () => {
    const cfg = { ...config, workspace: 'Perso' };

    const { pages, calls } = await runSync(
      [route('/users/me', me), route('/projects', { data: [], next_page: null })],
      { config: cfg },
    );

    expect(paramsOf(calls[1])).toMatchObject({ workspace: '2002' });
    expect(pages).toEqual([]);
  });

  it('demande les tâches de chaque projet modifiées depuis since, projets dans l’ordre des identifiants', async () => {
    const { calls } = await runSync(firstPassRoutes());

    const tasks = tasksCalls(calls);
    expect(tasks).toHaveLength(3);
    const fields = 'name,notes,modified_at,created_by.name,permalink_url';
    const base = { modified_since: '2026-09-15T00:00:00.000Z', limit: '100', opt_fields: fields };
    expect(paramsOf(tasks[0])).toEqual({ ...base, project: '3001' });
    expect(paramsOf(tasks[1])).toEqual({ ...base, project: '3001', offset: OFFSET_TASKS });
    expect(paramsOf(tasks[2])).toEqual({ ...base, project: '3002' });
  });

  it('écrit since en UTC avec les millisecondes', async () => {
    const { calls } = await runSync(firstPassRoutes(), {
      since: new Date('2026-09-15T10:20:30.456Z'),
    });

    expect(paramsOf(tasksCalls(calls)[0]).modified_since).toBe('2026-09-15T10:20:30.456Z');
  });

  it('envoie le jeton à chaque requête, pages suivantes comprises', async () => {
    const { calls } = await runSync(firstPassRoutes());

    expect(calls.length).toBeGreaterThan(8);
    for (const call of calls) expect(call.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('rend une tâche avec son corps puis ses commentaires, chacun avec sa date', async () => {
    const { pages } = await runSync(firstPassRoutes());

    const task = itemsOf(pages).find((item) => item.externalId === 'task:4001');
    expect(task).toEqual({
      externalId: 'task:4001',
      nature: 'ticket',
      title: 'Choisir la date de lancement',
      url: 'https://app.asana.com/0/3001/4001',
      updatedAt: '2026-10-12T09:30:00.000Z',
      origin: { workspace: 'Acme', project: 'Lancement' },
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Marie Durand', email: null },
          text: 'Lancement visé le 12 novembre.\n\nÀ confirmer avec Paul.',
          ts: '2026-10-12T09:30:00.000Z',
        },
        {
          externalId: 'comment:5001',
          role: 'participant',
          author: { name: 'Paul Martin', email: null },
          text: 'Plutôt le 19 novembre, le temps de finir les tests.',
          ts: '2026-10-10T14:00:00.000Z',
        },
        {
          externalId: 'comment:5002',
          role: 'participant',
          author: { name: 'Marie Durand', email: null },
          text: "On garde le 12 novembre : c'est décidé.",
          ts: '2026-10-12T09:30:00.000Z',
        },
      ],
    });
  });

  it('rend les tâches de la plus ancienne à la plus récente, sans celle qui n’a ni texte ni commentaire', async () => {
    const { pages, calls } = await runSync(firstPassRoutes());

    expect(idsOf(pages.slice(0, 1))).toEqual(['task:4002', 'task:4001']);
    // Celle qui n'a que des commentaires n'a pas de tour document.
    expect(pages[0]?.items[0]?.turns.map((turn) => turn.externalId)).toEqual(['comment:5003']);
    // Il faut bien demander ses commentaires pour savoir qu'elle n'en a pas.
    expect(calls.some((call) => pathOf(call) === '/tasks/4003/stories')).toBe(true);
  });

  it('ne demande que les commentaires, 100 par page, et ignore une histoire système', async () => {
    const system = {
      gid: '5099',
      resource_type: 'story',
      created_at: '2026-10-12T09:31:00.000Z',
      created_by: { gid: '1001', resource_type: 'user', name: 'Marie Durand' },
      resource_subtype: 'assigned',
      text: 'Marie Durand a assigné cette tâche à Paul Martin.',
    };
    const routes = firstPassRoutes();
    const index = routes.findIndex((r) => r.url === `${API}/tasks/4001/stories`);
    routes[index] = route('/tasks/4001/stories', {
      ...stories4001,
      data: [...stories4001.data, system],
    });

    const { pages, calls } = await runSync(routes);

    const stories = calls.find((call) => pathOf(call) === '/tasks/4001/stories');
    expect(paramsOf(stories)).toEqual({
      resource_subtype: 'comment_added',
      limit: '100',
      opt_fields: 'created_at,created_by.name,resource_subtype,text',
    });
    const task = itemsOf(pages).find((item) => item.externalId === 'task:4001');
    expect(task?.turns.map((turn) => turn.externalId)).toEqual([
      'body',
      'comment:5001',
      'comment:5002',
    ]);
  });

  it('lit tous les commentaires d’une tâche, page suivante par l’offset donné', async () => {
    const [first, second] = stories4001.data;
    const routes = firstPassRoutes();
    const index = routes.findIndex((r) => r.url === `${API}/tasks/4001/stories`);
    routes.splice(
      index,
      1,
      route('/tasks/4001/stories', { data: [first], next_page: { offset: 'c3Rvcmllcy0y' } }),
      route('/tasks/4001/stories', { data: [second], next_page: null }),
    );

    const { pages, calls } = await runSync(routes);

    const stories = calls.filter((call) => pathOf(call) === '/tasks/4001/stories');
    expect(stories.map((call) => paramsOf(call).offset)).toEqual([undefined, 'c3Rvcmllcy0y']);
    const task = itemsOf(pages).find((item) => item.externalId === 'task:4001');
    expect(task?.turns.map((turn) => turn.externalId)).toEqual([
      'body',
      'comment:5001',
      'comment:5002',
    ]);
  });

  it('rend une page par page de tâches, la suivante par l’offset donné, et un créateur absent sans nom', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(pages).toHaveLength(3);
    expect(idsOf(pages.slice(1, 2))).toEqual(['task:4004']);
    expect(pages[1]?.items[0]?.turns[0]?.author).toEqual({ name: null, email: null });
    expect(idsOf(pages.slice(2))).toEqual(['task:4005']);
    expect(pages[2]?.items[0]?.origin).toEqual({ workspace: 'Acme', project: 'Refonte du site' });
  });

  it('ne rend qu’une fois une tâche rangée dans plusieurs projets, et ne lit ses commentaires qu’une fois', async () => {
    const shared = tasks3001Page1.data[0];
    const routes = firstPassRoutes();
    const index = routes.findIndex((r) => r.json === tasks3002);
    routes[index] = route('/tasks', { data: [shared, ...tasks3002.data], next_page: null });

    const { pages, calls } = await runSync(routes);

    expect(idsOf(pages).filter((id) => id === 'task:4001')).toHaveLength(1);
    expect(calls.filter((call) => pathOf(call) === '/tasks/4001/stories')).toHaveLength(1);
    expect(idsOf(pages.slice(2))).toEqual(['task:4005']);
  });

  it('garde dans le curseur la page en cours (offset et repère de lecture), puis le repère de chaque projet', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(cursorOf(pages[0])).toEqual({
      marks: {},
      current: {
        project: '3001',
        offset: OFFSET_TASKS,
        mark: { at: '2026-10-12T09:30:00.000Z', seen: ['4001'] },
      },
    });
    expect(cursorOf(pages[1])).toEqual({
      marks: { '3001': { at: '2026-10-13T16:45:00.000Z', seen: ['4004'] } },
      current: { project: '3002', offset: null, mark: null },
    });
    expect(cursorOf(pages[2])).toEqual({
      marks: {
        '3001': { at: '2026-10-13T16:45:00.000Z', seen: ['4004'] },
        '3002': { at: '2026-10-09T10:00:00.000Z', seen: ['4005'] },
      },
      current: null,
    });
  });

  it('rend une page vide pour garder le curseur quand rien n’est à rendre', async () => {
    const onlyEmpty = {
      data: [tasks3001Page1.data[2]],
      next_page: null,
    };

    const { pages } = await runSync([
      route('/users/me', me),
      route('/projects', projectsPage2),
      route('/tasks', onlyEmpty),
      route('/tasks/4003/stories', storiesEmpty),
    ]);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.items).toEqual([]);
    expect(cursorOf(pages[0])).toEqual({
      marks: { '3001': { at: '2026-10-10T07:00:00.000Z', seen: ['4003'] } },
      current: null,
    });
  });

  it('ne rend rien, pas même une page vide, quand rien n’a changé', async () => {
    const { pages } = await runSync([
      route('/users/me', me),
      route('/projects', projectsPage2),
      route('/tasks', tasksEmpty),
    ]);

    expect(pages).toEqual([]);
  });

  it('rend des éléments que le socle accepte, avec des dates ISO canoniques', async () => {
    const { pages } = await runSync(firstPassRoutes());

    expect(itemsOf(pages)).toHaveLength(4);
    for (const item of itemsOf(pages)) {
      const normalized = normalizeItem(item, 'asana');
      expect(normalized, item.externalId).not.toBeNull();
      expect(normalized?.updatedAt).toBe(item.updatedAt);
      for (const turn of item.turns) expect(Number.isNaN(Date.parse(turn.ts)), turn.ts).toBe(false);
    }
  });
});

describe('asana : sync, reprise', () => {
  const lastTasks = '2026-10-13T16:44:59.000Z'; // le repère de 3001, reculé d'une seconde
  const lastTasks3002 = '2026-10-09T09:59:59.000Z';

  it('reprend à l’offset du curseur de la première page, sans refaire la première page', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync(
      [
        route('/users/me', me),
        route('/projects', projectsPage1),
        route('/projects', projectsPage2),
        route('/tasks', tasks3001Page2),
        route('/tasks/4004/stories', storiesEmpty),
        route('/tasks', tasks3002),
        route('/tasks/4005/stories', storiesEmpty),
      ],
      { cursor: first.pages[0]?.cursor },
    );

    const tasks = tasksCalls(calls);
    expect(paramsOf(tasks[0])).toMatchObject({ project: '3001', offset: OFFSET_TASKS });
    expect(tasks.filter((call) => paramsOf(call).project === '3001')).toHaveLength(1);
    expect(idsOf(pages)).toEqual(['task:4004', 'task:4005']);
  });

  it('saute les projets déjà lus pendant le passage en cours', async () => {
    const cursor = JSON.stringify({
      marks: {},
      current: { project: '3002', offset: null, mark: null },
    });

    const { pages, calls } = await runSync(
      [
        route('/users/me', me),
        route('/projects', projectsPage1),
        route('/projects', projectsPage2),
        route('/tasks', tasks3002),
        route('/tasks/4005/stories', storiesEmpty),
      ],
      { cursor },
    );

    expect(tasksCalls(calls).map((call) => paramsOf(call).project)).toEqual(['3002']);
    expect(idsOf(pages)).toEqual(['task:4005']);
  });

  it('repart du premier projet quand celui du curseur n’existe plus', async () => {
    const cursor = JSON.stringify({
      marks: {},
      current: { project: '3999', offset: 'perime', mark: null },
    });

    const { calls } = await runSync(
      [route('/users/me', me), route('/projects', projectsPage2), route('/tasks', tasksEmpty)],
      { cursor },
    );

    expect(paramsOf(tasksCalls(calls)[0])).not.toHaveProperty('offset');
    expect(paramsOf(tasksCalls(calls)[0])).toMatchObject({ project: '3001' });
  });

  it('ne refait aucune tâche avec le dernier curseur', async () => {
    const first = await runSync(firstPassRoutes());

    const { pages, calls } = await runSync(
      [
        route('/users/me', me),
        route('/projects', projectsPage1),
        route('/projects', projectsPage2),
        route('/tasks', tasks3001Page1),
        route('/tasks', tasks3001Page2),
        route('/tasks', tasks3002),
      ],
      { cursor: first.pages.at(-1)?.cursor },
    );

    // Asana rend les mêmes tâches (le filtre est reculé d'une seconde) : toutes sont reconnues.
    const tasks = tasksCalls(calls);
    expect(tasks.map((call) => paramsOf(call).modified_since)).toEqual([
      lastTasks,
      lastTasks,
      lastTasks3002,
    ]);
    expect(calls.some((call) => pathOf(call).endsWith('/stories'))).toBe(false);
    expect(pages).toEqual([]);
  });

  it('suit chaque projet avec son propre repère', async () => {
    const cursor = JSON.stringify({
      marks: { '3001': { at: '2026-10-13T16:45:00.000Z', seen: ['4004'] } },
      current: null,
    });

    const { calls } = await runSync(
      [
        route('/users/me', me),
        route('/projects', projectsPage1),
        route('/projects', projectsPage2),
        route('/tasks', tasksEmpty),
        route('/tasks', tasksEmpty),
      ],
      { cursor },
    );

    expect(tasksCalls(calls).map((call) => paramsOf(call).modified_since)).toEqual([
      lastTasks,
      '2026-09-15T00:00:00.000Z',
    ]);
  });

  it('ignore la tâche déjà rendue au même instant, et rend l’autre', async () => {
    const cursor = JSON.stringify({
      marks: { '3001': { at: '2026-10-13T16:45:00.000Z', seen: ['4004'] } },
      current: null,
    });
    const twin = { ...tasks3001Page2.data[0], gid: '4009', name: 'Relire la FAQ' };
    const tasks = { data: [...tasks3001Page2.data, twin], next_page: null };

    const { pages } = await runSync(
      [
        route('/users/me', me),
        route('/projects', projectsPage2),
        route('/tasks', tasks),
        route('/tasks/4009/stories', storiesEmpty),
      ],
      { cursor },
    );

    expect(idsOf(pages)).toEqual(['task:4009']);
    expect(cursorOf(pages[0]).marks['3001']).toEqual({
      at: '2026-10-13T16:45:00.000Z',
      seen: ['4004', '4009'],
    });
  });

  it('repart de since quand le curseur est illisible', async () => {
    for (const cursor of ['pas du JSON', '{"marks":1}']) {
      const { calls } = await runSync(
        [route('/users/me', me), route('/projects', projectsPage2), route('/tasks', tasksEmpty)],
        { cursor },
      );

      expect(paramsOf(tasksCalls(calls)[0]).modified_since, cursor).toBe(
        '2026-09-15T00:00:00.000Z',
      );
    }
  });

  it('recommence le projet sans offset quand Asana refuse l’offset périmé (400)', async () => {
    const cursor = JSON.stringify({
      marks: {},
      current: {
        project: '3001',
        offset: 'perime',
        mark: { at: '2026-10-12T09:30:00.000Z', seen: ['4001'] },
      },
    });

    const { calls } = await runSync(
      [
        route('/users/me', me),
        route('/projects', projectsPage2),
        route('/tasks', null, { status: 400 }),
        route('/tasks', tasksEmpty),
      ],
      { cursor },
    );

    const tasks = tasksCalls(calls);
    expect(tasks).toHaveLength(2);
    expect(paramsOf(tasks[0])).toMatchObject({ offset: 'perime' });
    expect(paramsOf(tasks[1])).not.toHaveProperty('offset');
    expect(paramsOf(tasks[1]).modified_since).toBe(paramsOf(tasks[0]).modified_since);
  });
});

describe('asana : sync, erreurs', () => {
  it('rend la tâche sans commentaires quand Asana les refuse (403)', async () => {
    const routes = firstPassRoutes();
    const index = routes.findIndex((r) => r.url === `${API}/tasks/4001/stories`);
    routes[index] = route('/tasks/4001/stories', null, { status: 403 });

    const { pages } = await runSync(routes);

    const task = itemsOf(pages).find((item) => item.externalId === 'task:4001');
    expect(task?.turns.map((turn) => turn.externalId)).toEqual(['body']);
    expect(idsOf(pages)).toEqual(['task:4002', 'task:4001', 'task:4004', 'task:4005']);
  });

  it('remonte une clé refusée sur la liste des tâches, après avoir rendu la première page', async () => {
    const routes = firstPassRoutes().slice(0, 7);
    routes.push(route('/tasks', null, { status: 401 }));
    const { http } = testHttp(asanaConnector, config, routes);
    const pages: SyncPage[] = [];

    const failure = await (async () => {
      try {
        for await (const page of asanaConnector.sync(
          config,
          { cursor: null, since: SINCE },
          http,
        )) {
          pages.push(page);
        }
      } catch (error) {
        return error;
      }
    })();

    expect(failure).toBeInstanceOf(ConnectorAuthError);
    expect(pages).toHaveLength(1);
    expect(cursorOf(pages[0]).current.offset).toBe(OFFSET_TASKS);
  });

  it('remonte un espace introuvable', async () => {
    const cfg = { ...config, workspace: 'Autre' };
    const { http } = testHttp(asanaConnector, cfg, [route('/users/me', me)]);

    const failure = await collect(
      asanaConnector.sync(cfg, { cursor: null, since: SINCE }, http),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
  });

  it('ne reprend pas le jeton dans un message d’erreur', async () => {
    const { http } = testHttp(asanaConnector, config, [
      route('/users/me', null, { status: 500 }),
      route('/users/me', null, { status: 500 }),
      route('/users/me', null, { status: 500 }),
      route('/users/me', null, { status: 500 }),
    ]);

    const failure = await asanaConnector.verify(config, http).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ConnectorHttpError);
    expect((failure as Error).message).not.toContain(TOKEN);
  });
});

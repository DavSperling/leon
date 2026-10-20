import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ANSWER_PATH,
  ANSWER_RESULTS_PARAM,
  type AnswerEvent,
  createAnswerEventReader,
} from '@/lib/answer-events';
import {
  createDiscussionEventReader,
  DISCUSSION_MESSAGE_MAX_CHARS,
  DISCUSSION_TOO_MANY,
  type DiscussionEvent,
  discussionMessagesUrl,
} from '@/lib/discussion-events';
import { PAGE_SIZE } from '@/lib/search-limits';
import { app } from '@/server/api/app';
import { auth } from '@/server/auth/auth';
import { createUserWithOrganization } from '@/server/auth/sign-up';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { createDiscussion, getDiscussion } from '@/server/discussion/discussions';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import * as registryModule from '@/server/embeddings/registry';
import { createFakeLlm } from '@/server/llm/fake-llm';
import * as getLlmModule from '@/server/llm/get-llm';
import { LlmError } from '@/server/llm/llm';
import * as searchModule from '@/server/search/search';
import { adminDb, adminPool } from '@/test/db';
import { dropTeams, seedIndexed } from '@/test/seed-indexed';
import { TEST_ENV } from '@/test/test-env';
import { sessionRoutes } from './session-routes';

// La route de la réponse en tête (C8) : session Better Auth, même origine, flux d'évènements.

const ORIGIN = TEST_ENV.BETTER_AUTH_URL;
const password = 'motdepasse-solide';
const tenantIds: string[] = [];

afterAll(() => dropTeams(tenantIds));
afterEach(() => vi.restoreAllMocks());

type Person = { ctx: TenantContext; cookie: string };

// Un compte réel, connecté par mot de passe. Sans `tenantId`, il crée son organisation ; avec, il en devient membre
// (sa session porte alors cette organisation, la seule qu'il ait).
async function signUp(name: string, tenantId?: string): Promise<Person> {
  const email = `${name.toLowerCase()}-${randomUUID()}@exemple.test`;
  let userId: string;
  let organizationId: string;
  if (tenantId === undefined) {
    const result = await createUserWithOrganization({
      name,
      email,
      password,
      organizationName: `Organisation de ${name}`,
    });
    if (!result.ok) throw new Error(`inscription refusée : ${result.error}`);
    userId = result.userId;
    organizationId = result.tenantId;
    tenantIds.push(organizationId);
  } else {
    userId = (await auth.api.signUpEmail({ body: { name, email, password } })).user.id;
    organizationId = tenantId;
    await adminDb
      .insert(members)
      .values({ organizationId, userId, role: 'member', createdAt: new Date() });
  }
  const ctx = await resolveTenantContext(userId, organizationId);
  if (!ctx) throw new Error('contexte introuvable');
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  return { ctx, cookie: headers.get('set-cookie')?.split(';')[0] ?? '' };
}

// La question de l'encadré : la requête et les résultats affichés sur la page (`results`, une source inconnue par
// défaut ; `null` pour n'en envoyer aucun). Par défaut, l'en-tête d'un appel du même site.
function ask(
  person: Person | null,
  q: string | null,
  options: { results?: string[] | string | null; headers?: Record<string, string> } = {},
) {
  const params = new URLSearchParams();
  if (q !== null) params.set('q', q);
  const results = options.results === undefined ? [randomUUID()] : options.results;
  if (results !== null) {
    params.set(ANSWER_RESULTS_PARAM, Array.isArray(results) ? results.join(',') : results);
  }
  const headers = options.headers ?? { 'sec-fetch-site': 'same-origin' };
  return app.request(`${ANSWER_PATH}?${params.toString()}`, {
    headers: { ...(person ? { cookie: person.cookie } : {}), ...headers },
  });
}

async function eventsOf(response: Response): Promise<AnswerEvent[]> {
  return createAnswerEventReader().push(await response.text());
}

// Alice et Bob dans une équipe : un ticket d'équipe et une conversation privée d'Alice, qui partagent des mots.
// `shown` : les deux sources, comme la page d'Alice les affiche.
async function setupTeam() {
  const alice = await signUp('Alice');
  const bob = await signUp('Bob', alice.ctx.tenantId);
  const conversation = await seedIndexed(alice.ctx, {
    kind: 'claude_ai',
    title: 'Conversation privée',
    turns: [{ text: 'Note personnelle : la clause pénalité quetzal reste entre nous.' }],
  });
  const ticket = await seedIndexed(alice.ctx, {
    kind: 'github',
    acl: [alice.ctx.tenantId],
    title: 'Ticket quetzal',
    turns: [{ text: 'Le fournisseur quetzal accepte la clause de pénalité.' }],
  });
  return { alice, bob, shown: [ticket.sourceId, conversation.sourceId] };
}

const fakeModel = (texts = ['La clause ', 'est acceptée [1].']) => {
  const llm = createFakeLlm({ texts });
  vi.spyOn(getLlmModule, 'getLlm').mockReturnValue(llm);
  return llm;
};

describe(`GET ${ANSWER_PATH}`, () => {
  it('répond 204 quand aucun modèle n’est branché', async () => {
    const { alice } = await setupTeam();

    const response = await ask(alice, 'clause quetzal');

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('rend un flux d’évènements : le texte, puis la fin', async () => {
    const { alice, shown } = await setupTeam();
    const llm = fakeModel();

    const response = await ask(alice, 'clause quetzal', { results: shown });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await eventsOf(response)).toEqual([
      { type: 'texte', delta: 'La clause ' },
      { type: 'texte', delta: 'est acceptée [1].' },
      { type: 'fin' },
    ]);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.step).toBe('reponse');
  });

  it('répond 401 sans session, ou avec un cookie inconnu', async () => {
    fakeModel();

    expect((await ask(null, 'clause')).status).toBe(401);
    expect(
      (await ask({ ctx: null as never, cookie: 'better-auth.session_token=faux' }, 'clause'))
        .status,
    ).toBe(401);
  });

  it('répond 403 à une origine étrangère, même avec une session', async () => {
    const { alice } = await setupTeam();
    const llm = fakeModel();

    const foreign = await ask(alice, 'clause', { headers: { origin: 'https://evil.test' } });
    const nullOrigin = await ask(alice, 'clause', { headers: { origin: 'null' } });
    const crossSite = await ask(alice, 'clause', { headers: { 'sec-fetch-site': 'cross-site' } });
    const sameSite = await ask(alice, 'clause', { headers: { 'sec-fetch-site': 'same-site' } });

    expect([foreign.status, nullOrigin.status, crossSite.status, sameSite.status]).toEqual([
      403, 403, 403, 403,
    ]);
    expect(llm.calls).toHaveLength(0);
  });

  it('accepte la même origine, et une requête sans en-tête d’origine (GET du même site)', async () => {
    const { alice, shown } = await setupTeam();
    fakeModel();

    const sameOrigin = await ask(alice, 'clause quetzal', {
      results: shown,
      headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin' },
    });
    const bare = await ask(alice, 'clause quetzal', { results: shown, headers: {} });

    expect([sameOrigin.status, bare.status]).toEqual([200, 200]);
  });

  it('répond 400 sans requête', async () => {
    const { alice, shown } = await setupTeam();
    const llm = fakeModel();

    expect((await ask(alice, null, { results: shown })).status).toBe(400);
    expect((await ask(alice, '   ', { results: shown })).status).toBe(400);
    expect(llm.calls).toHaveLength(0);
  });

  // [n] renvoie au n-ième résultat affiché : sans la liste de la page, la route ne saurait pas numéroter.
  it('répond 400 sans la liste des résultats de la page, ou avec une liste invalide', async () => {
    const { alice, shown } = await setupTeam();
    const llm = fakeModel();
    const tooMany = Array.from({ length: PAGE_SIZE + 1 }, () => randomUUID());

    const statuses = await Promise.all(
      [null, '', 'pas-un-identifiant', `${shown[0]},${shown[0]}`, tooMany].map(
        async (results) => (await ask(alice, 'clause quetzal', { results })).status,
      ),
    );

    expect(statuses).toEqual([400, 400, 400, 400, 400]);
    expect(llm.calls).toHaveLength(0);
  });

  // Vigilance 4 : la réponse ne voit que ce que voit le lecteur.
  // La liste des résultats vient du navigateur : y nommer une source d'Alice n'en donne rien à Bob.
  it('n’envoie au modèle, pour Bob, aucun passage de la conversation privée d’Alice, même nommée dans la liste', async () => {
    const { bob, shown } = await setupTeam();
    const llm = fakeModel();

    await eventsOf(await ask(bob, 'clause pénalité quetzal', { results: shown }));

    const prompt = JSON.stringify(llm.calls);
    expect(llm.calls).toHaveLength(1);
    expect(prompt).toContain('Ticket quetzal');
    expect(prompt).not.toContain('Conversation privée');
    expect(prompt).not.toContain('Note personnelle');
  });

  // Vigilance 5.
  it('rend « indisponible » puis ferme le flux quand le modèle lève', async () => {
    const { alice, shown } = await setupTeam();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(getLlmModule, 'getLlm').mockReturnValue({
      // biome-ignore lint/correctness/useYield: un modèle en panne avant son premier mot
      async *streamText() {
        throw new LlmError('appel au modèle impossible');
      },
      runAgent(): AsyncIterable<never> {
        throw new Error('non utilisé');
      },
    });

    const response = await ask(alice, 'clause quetzal', { results: shown });

    expect(response.status).toBe(200);
    expect(await eventsOf(response)).toEqual([{ type: 'indisponible' }]);
  });

  it('la même requête deux fois en 10 minutes : un seul appel au modèle', async () => {
    const { alice, shown } = await setupTeam();
    const llm = fakeModel();

    const first = await eventsOf(await ask(alice, 'clause quetzal', { results: shown }));
    const second = await eventsOf(await ask(alice, 'Clause  quetzal', { results: shown }));

    expect(llm.calls).toHaveLength(1);
    expect(first.at(-1)).toEqual({ type: 'fin' });
    expect(second).toEqual([
      { type: 'texte', delta: 'La clause est acceptée [1].' },
      { type: 'fin' },
    ]);
  });

  // Chaque appelant de searchPassages passe le fournisseur de getEmbedder(env) (C4).
  it('passe le fournisseur de vecteurs réglé à la recherche', async () => {
    const { alice, shown } = await setupTeam();
    fakeModel();
    const embedder = createFakeEmbedder();
    vi.spyOn(registryModule, 'getEmbedder').mockReturnValue(embedder);
    const search = vi.spyOn(searchModule, 'searchPassages');

    await eventsOf(await ask(alice, 'clause quetzal', { results: shown }));

    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]?.[1]).toMatchObject({ query: 'clause quetzal', embedder });
  });
});

describe('POST /api/v1/discussions/:id/messages', () => {
  afterAll(() => adminPool.query('delete from discussions where tenant_id = any($1)', [tenantIds]));

  function post(
    person: Person | null,
    id: string,
    body: unknown,
    headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' },
  ) {
    return app.request(discussionMessagesUrl(id), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(person ? { cookie: person.cookie } : {}),
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  async function discussionEvents(response: Response): Promise<DiscussionEvent[]> {
    return createDiscussionEventReader().push(await response.text());
  }

  const agentModel = () => {
    const llm = createFakeLlm({
      agent: (call) =>
        call === 0
          ? [{ type: 'outil', name: 'chercher', input: { requete: 'clause quetzal' } }]
          : [{ type: 'texte', delta: 'La clause est acceptée [1].' }],
    });
    vi.spyOn(getLlmModule, 'getLlm').mockReturnValue(llm);
    return llm;
  };

  it('répond 204 quand aucun modèle n’est branché, sans rien écrire', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'Question' });

    const response = await post(alice, id, { message: 'Suite' });

    expect(response.status).toBe(204);
    expect((await getDiscussion(alice.ctx, id))?.messages).toHaveLength(1);
  });

  it('rend un flux d’évènements : l’outil, le texte, les citations, puis la fin', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'La clause quetzal ?' });
    const llm = agentModel();

    const response = await post(alice, id, { message: 'La clause quetzal ?' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const events = await discussionEvents(response);
    expect(events.map((event) => event.type)).toEqual(['outil', 'texte', 'citations', 'fin']);
    expect(events[0]).toEqual({ type: 'outil', name: 'chercher' });
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    expect(llm.calls[0]?.step).toBe('discussion');
    expect((await getDiscussion(alice.ctx, id))?.messages.at(-1)?.content).toBe(
      'La clause est acceptée [1].',
    );
  });

  // Le navigateur envoie toujours `Origin` sur un POST : la page de Leon, à l'adresse de BETTER_AUTH_URL, passe.
  it('accepte la question de la page, à l’adresse réglée pour Leon', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'La clause quetzal ?' });
    agentModel();

    const response = await post(
      alice,
      id,
      { message: 'La clause quetzal ?' },
      { origin: ORIGIN, 'sec-fetch-site': 'same-origin' },
    );

    expect(response.status).toBe(200);
    expect((await discussionEvents(response)).at(-1)).toEqual({ type: 'fin', reason: 'fini' });
  });

  // On revient sur la page pendant que Leon répond : elle redemande la réponse à la question restée seule.
  it('rend « en-cours » à une seconde demande pendant une réponse : un seul appel au modèle, une seule réponse', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'La clause quetzal ?' });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: () => void = () => undefined;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const calls: number[] = [];
    vi.spyOn(getLlmModule, 'getLlm').mockReturnValue({
      streamText(): AsyncIterable<never> {
        throw new Error('non utilisé');
      },
      async *runAgent() {
        calls.push(calls.length);
        started();
        await gate;
        yield { type: 'texte', delta: 'La clause est acceptée.' };
      },
    });

    const first = await post(alice, id, { message: 'La clause quetzal ?' });
    await running;
    const second = await post(alice, id, { message: 'La clause quetzal ?' });
    const secondEvents = await discussionEvents(second);
    release();
    const firstEvents = await discussionEvents(first);

    expect(second.status).toBe(200);
    expect(secondEvents).toEqual([{ type: 'en-cours' }]);
    expect(firstEvents.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    expect(calls).toHaveLength(1);
    const { rows } = await adminPool.query<{ role: string }>(
      'select role from discussion_messages where discussion_id = $1 order by created_at',
      [id],
    );
    expect(rows.map((row) => row.role)).toEqual(['user', 'assistant']);
  });

  // La page rechargée ou quittée pendant la réponse : la page promet que le serveur la finit et la garde.
  it('finit et garde la réponse quand le lecteur s’en va en cours de route', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'La clause quetzal ?' });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(getLlmModule, 'getLlm').mockReturnValue({
      streamText(): AsyncIterable<never> {
        throw new Error('non utilisé');
      },
      async *runAgent() {
        yield { type: 'outil', name: 'chercher', input: { requete: 'quetzal' } };
        await gate;
        yield { type: 'texte', delta: 'La clause est acceptée.' };
      },
    });

    const response = await post(alice, id, { message: 'La clause quetzal ?' });
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    release();

    await vi.waitFor(async () => {
      const messages = (await getDiscussion(alice.ctx, id))?.messages ?? [];
      expect(messages.map((m) => [m.role, m.content])).toEqual([
        ['user', 'La clause quetzal ?'],
        ['assistant', 'La clause est acceptée.'],
      ]);
    });
  });

  // Un proxy coupe une connexion muette : pendant que l'agent réfléchit, un commentaire SSE tient la ligne, que
  // la page ignore.
  it('envoie un signe de vie toutes les 15 s pendant la réponse', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'La clause quetzal ?' });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: () => void = () => undefined;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(getLlmModule, 'getLlm').mockReturnValue({
      streamText(): AsyncIterable<never> {
        throw new Error('non utilisé');
      },
      async *runAgent() {
        started();
        await gate;
        yield { type: 'texte', delta: 'La clause est acceptée.' };
      },
    });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

    try {
      const response = await post(alice, id, { message: 'La clause quetzal ?' });
      await running;
      vi.advanceTimersByTime(15_000);
      release();
      const body = await response.text();

      expect(body).toContain(': ping\n\n');
      expect(createDiscussionEventReader().push(body).at(-1)).toEqual({
        type: 'fin',
        reason: 'fini',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // Le coût d'un utilisateur : au plus deux réponses en cours ; la troisième est refusée avant d'écrire quoi que ce soit.
  it('répond 429 à une troisième réponse en cours du même utilisateur, sans rien écrire', async () => {
    const { alice } = await setupTeam();
    const ids = await Promise.all(
      ['Un', 'Deux', 'Trois'].map((question) => createDiscussion(alice.ctx, { question })),
    );
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    vi.spyOn(getLlmModule, 'getLlm').mockReturnValue({
      streamText(): AsyncIterable<never> {
        throw new Error('non utilisé');
      },
      async *runAgent() {
        calls += 1;
        await gate;
        yield { type: 'texte', delta: 'Réponse.' };
      },
    });

    const first = await post(alice, ids[0] ?? '', { message: 'Un' });
    const second = await post(alice, ids[1] ?? '', { message: 'Deux' });
    const third = await post(alice, ids[2] ?? '', { message: 'Encore' });
    release();
    await Promise.all([first.text(), second.text()]);

    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: DISCUSSION_TOO_MANY });
    expect(calls).toBe(2);
    expect((await getDiscussion(alice.ctx, ids[2] ?? ''))?.messages.map((m) => m.content)).toEqual([
      'Trois',
    ]);
  });

  // Vigilance 4 : la discussion d'Alice n'existe pas pour Bob.
  it('répond 404 à Bob dans la discussion d’Alice, sans rien écrire ni appeler le modèle', async () => {
    const { alice, bob } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'Question privée' });
    const llm = agentModel();

    const response = await post(bob, id, { message: 'Je m’invite' });

    expect(response.status).toBe(404);
    expect(llm.calls).toHaveLength(0);
    const { rows } = await adminPool.query(
      'select content from discussion_messages where discussion_id = $1',
      [id],
    );
    expect(rows).toEqual([{ content: 'Question privée' }]);
  });

  it('répond 404 à une discussion inconnue ou mal écrite', async () => {
    const { alice } = await setupTeam();
    agentModel();

    expect((await post(alice, randomUUID(), { message: 'Question' })).status).toBe(404);
    expect((await post(alice, 'pas-un-id', { message: 'Question' })).status).toBe(404);
  });

  it('répond 400 à un message vide, trop long ou illisible', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'Question' });
    const llm = agentModel();

    const statuses = await Promise.all(
      [
        { message: '   ' },
        { message: 'x'.repeat(DISCUSSION_MESSAGE_MAX_CHARS + 1) },
        { message: 3 },
        {},
        'pas du json',
      ].map(async (body) => (await post(alice, id, body)).status),
    );

    expect(statuses).toEqual([400, 400, 400, 400, 400]);
    expect(llm.calls).toHaveLength(0);
  });

  it('refuse un corps de plus de 64 Kio', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'Question' });
    agentModel();

    const response = await post(alice, id, { message: 'x', remplissage: 'y'.repeat(70_000) });

    expect(response.status).toBe(413);
  });

  // Vigilance 5.
  it('rend « indisponible » quand le modèle lève', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'Question' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(getLlmModule, 'getLlm').mockReturnValue({
      streamText(): AsyncIterable<never> {
        throw new Error('non utilisé');
      },
      // biome-ignore lint/correctness/useYield: un modèle en panne avant son premier mot
      async *runAgent() {
        throw new LlmError('appel au modèle impossible');
      },
    });

    const response = await post(alice, id, { message: 'Question' });

    expect(await discussionEvents(response)).toEqual([{ type: 'indisponible' }]);
  });

  // Chaque appelant de searchPassages passe le fournisseur de getEmbedder(env) (C4).
  it('passe le fournisseur de vecteurs réglé aux recherches de l’agent', async () => {
    const { alice } = await setupTeam();
    const id = await createDiscussion(alice.ctx, { question: 'La clause quetzal ?' });
    agentModel();
    const embedder = createFakeEmbedder();
    const getEmbedder = vi.spyOn(registryModule, 'getEmbedder').mockReturnValue(embedder);
    const search = vi.spyOn(searchModule, 'searchPassages');

    await discussionEvents(await post(alice, id, { message: 'La clause quetzal ?' }));

    expect(getEmbedder).toHaveBeenCalled();
    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]?.[1]).toMatchObject({ query: 'clause quetzal', embedder });
  });
});

// Chaque route de session (la réponse en tête, puis la discussion en T11) pose ses deux contrôles : la session et
// la même origine. Une route ajoutée sans l'un d'eux fait échouer l'un de ces tests, quel que soit leur ordre.
describe('chaque route de session', () => {
  // Montées sous /api/v1 par app.ts.
  const routes = [
    ...new Set(sessionRoutes.routes.map((route) => `${route.method} /api/v1${route.path}`)),
  ];
  let alice: Person;
  beforeAll(async () => {
    alice = await signUp('Alice');
  });

  function call(route: string, headers: Record<string, string>) {
    const [method = 'GET', path = ''] = route.split(' ');
    const withBody = method !== 'GET' && method !== 'HEAD';
    return app.request(
      path.replace(/:[^/]+/g, () => randomUUID()),
      {
        method,
        headers: { ...headers, ...(withBody ? { 'content-type': 'application/json' } : {}) },
        body: withBody ? '{}' : undefined,
      },
    );
  }

  it('sont servies là où app.ts les monte', () => {
    const served = new Set(app.routes.map((route) => `${route.method} ${route.path}`));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) expect(served).toContain(route);
  });

  it.each(routes)('%s répond 401 sans session', async (route) => {
    fakeModel();
    expect((await call(route, { 'sec-fetch-site': 'same-origin' })).status).toBe(401);
  });

  it.each(routes)('%s répond 403 à une origine étrangère, même avec une session', async (route) => {
    const llm = fakeModel();
    const response = await call(route, { cookie: alice.cookie, origin: 'https://evil.test' });
    expect(response.status).toBe(403);
    expect(llm.calls).toHaveLength(0);
  });
});

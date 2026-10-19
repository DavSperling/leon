import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { ANSWER_PATH, type AnswerEvent, createAnswerEventReader } from '@/lib/answer-events';
import { app } from '@/server/api/app';
import { auth } from '@/server/auth/auth';
import { createUserWithOrganization } from '@/server/auth/sign-up';
import { resolveTenantContext, type TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import * as registryModule from '@/server/embeddings/registry';
import { createFakeLlm } from '@/server/llm/fake-llm';
import * as getLlmModule from '@/server/llm/get-llm';
import { LlmError } from '@/server/llm/llm';
import * as searchModule from '@/server/search/search';
import { adminDb } from '@/test/db';
import { dropTeams, seedIndexed } from '@/test/seed-indexed';
import { TEST_ENV } from '@/test/test-env';

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

function ask(
  person: Person | null,
  q: string | null,
  headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' },
) {
  const query = q === null ? '' : `?${new URLSearchParams({ q }).toString()}`;
  return app.request(`${ANSWER_PATH}${query}`, {
    headers: { ...(person ? { cookie: person.cookie } : {}), ...headers },
  });
}

async function eventsOf(response: Response): Promise<AnswerEvent[]> {
  return createAnswerEventReader().push(await response.text());
}

// Alice et Bob dans une équipe : un ticket d'équipe et une conversation privée d'Alice, qui partagent des mots.
async function setupTeam() {
  const alice = await signUp('Alice');
  const bob = await signUp('Bob', alice.ctx.tenantId);
  await seedIndexed(alice.ctx, {
    kind: 'claude_ai',
    title: 'Conversation privée',
    turns: [{ text: 'Note personnelle : la clause pénalité quetzal reste entre nous.' }],
  });
  await seedIndexed(alice.ctx, {
    kind: 'github',
    acl: [alice.ctx.tenantId],
    title: 'Ticket quetzal',
    turns: [{ text: 'Le fournisseur quetzal accepte la clause de pénalité.' }],
  });
  return { alice, bob };
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
    const { alice } = await setupTeam();
    const llm = fakeModel();

    const response = await ask(alice, 'clause quetzal');

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

    const foreign = await ask(alice, 'clause', { origin: 'https://evil.test' });
    const nullOrigin = await ask(alice, 'clause', { origin: 'null' });
    const crossSite = await ask(alice, 'clause', { 'sec-fetch-site': 'cross-site' });
    const sameSite = await ask(alice, 'clause', { 'sec-fetch-site': 'same-site' });

    expect([foreign.status, nullOrigin.status, crossSite.status, sameSite.status]).toEqual([
      403, 403, 403, 403,
    ]);
    expect(llm.calls).toHaveLength(0);
  });

  it('accepte la même origine, et une requête sans en-tête d’origine (GET du même site)', async () => {
    const { alice } = await setupTeam();
    fakeModel();

    const sameOrigin = await ask(alice, 'clause quetzal', {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
    });
    const bare = await ask(alice, 'clause quetzal', {});

    expect([sameOrigin.status, bare.status]).toEqual([200, 200]);
  });

  it('répond 400 sans requête', async () => {
    const { alice } = await setupTeam();
    const llm = fakeModel();

    expect((await ask(alice, null)).status).toBe(400);
    expect((await ask(alice, '   ')).status).toBe(400);
    expect(llm.calls).toHaveLength(0);
  });

  // Vigilance 4 : la réponse ne voit que ce que voit le lecteur.
  it('n’envoie au modèle, pour Bob, aucun passage de la conversation privée d’Alice', async () => {
    const { bob } = await setupTeam();
    const llm = fakeModel();

    await eventsOf(await ask(bob, 'clause pénalité quetzal'));

    const prompt = JSON.stringify(llm.calls);
    expect(llm.calls).toHaveLength(1);
    expect(prompt).toContain('Ticket quetzal');
    expect(prompt).not.toContain('Conversation privée');
    expect(prompt).not.toContain('Note personnelle');
  });

  // Vigilance 5.
  it('rend « indisponible » puis ferme le flux quand le modèle lève', async () => {
    const { alice } = await setupTeam();
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

    const response = await ask(alice, 'clause quetzal');

    expect(response.status).toBe(200);
    expect(await eventsOf(response)).toEqual([{ type: 'indisponible' }]);
  });

  it('la même requête deux fois en 10 minutes : un seul appel au modèle', async () => {
    const { alice } = await setupTeam();
    const llm = fakeModel();

    const first = await eventsOf(await ask(alice, 'clause quetzal'));
    const second = await eventsOf(await ask(alice, 'Clause  quetzal'));

    expect(llm.calls).toHaveLength(1);
    expect(first.at(-1)).toEqual({ type: 'fin' });
    expect(second).toEqual([
      { type: 'texte', delta: 'La clause est acceptée [1].' },
      { type: 'fin' },
    ]);
  });

  // Chaque appelant de searchPassages passe le fournisseur de getEmbedder(env) (C4).
  it('passe le fournisseur de vecteurs réglé à la recherche', async () => {
    const { alice } = await setupTeam();
    fakeModel();
    const embedder = createFakeEmbedder();
    vi.spyOn(registryModule, 'getEmbedder').mockReturnValue(embedder);
    const search = vi.spyOn(searchModule, 'searchPassages');

    await eventsOf(await ask(alice, 'clause quetzal'));

    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]?.[1]).toMatchObject({ query: 'clause quetzal', embedder });
  });
});

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  DISCUSSION_LIMIT_NOTE,
  DISCUSSION_REFUSAL,
  type DiscussionEvent,
} from '@/lib/discussion-events';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { type AgentEvent, type Llm, LlmError } from '@/server/llm/llm';
import * as searchModule from '@/server/search/search';
import { adminPool } from '@/test/db';
import { dropTeams, newTeam, seedIndexed } from '@/test/seed-indexed';
import { isReplying, replyStream } from './agent';
import { DISCUSSION_SYSTEM } from './discussion-prompt';
import * as discussionsModule from './discussions';
import { createDiscussion, getDiscussion, saveReply, startReply } from './discussions';
import { DISCUSSION_MAX_STEPS } from './tools';

// L'agent de discussion avec un faux modèle scripté, sur la vraie recherche : ce qu'il garde, ce qu'il cite, ses
// limites, et ce qu'il ne peut pas obtenir pour un autre.

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from discussions where tenant_id = any($1)', [tenantIds]);
  await dropTeams(tenantIds);
});
afterEach(() => vi.restoreAllMocks());

const PRIVATE_WORDS = 'clause pénalité fournisseur xylophage';

async function setup() {
  const { tenantId, members } = await newTeam(['Alice Martin', 'Bob Durand'], tenantIds);
  const [alice, bob] = members as [TenantContext, TenantContext];
  const ticket = await seedIndexed(alice, {
    kind: 'github',
    acl: [tenantId],
    title: 'Ticket renouvellement',
    metadata: { nature: 'ticket', url: 'https://github.com/acme/leon/issues/7' },
    turns: [{ text: 'Décision : on renouvelle le contrat quetzal pour un an.' }],
  });
  const conversation = await seedIndexed(alice, {
    kind: 'claude_ai',
    title: 'Conversation privée',
    turns: [{ text: `Note personnelle : la ${PRIVATE_WORDS} reste entre nous.` }],
  });
  return { tenantId, alice, bob, ticket, conversation };
}

async function collect(
  stream: AsyncIterable<DiscussionEvent> | null | 'trop',
): Promise<DiscussionEvent[]> {
  if (stream === null || stream === 'trop') throw new Error('flux attendu');
  const events: DiscussionEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

// Un faux modèle qui joue ces tours dans l'ordre (le dernier se répète), et garde le résultat de chaque outil.
function scripted(...rounds: AgentEvent[][]) {
  const toolResults: string[] = [];
  const llm = createFakeLlm({
    agent: (call, lastToolResult) => {
      if (lastToolResult !== null) toolResults.push(lastToolResult);
      return rounds[Math.min(call, rounds.length - 1)] ?? [];
    },
  });
  return { llm, toolResults };
}

const search = (requete: string): AgentEvent => ({
  type: 'outil',
  name: 'chercher',
  input: { requete },
});
const text = (delta: string): AgentEvent => ({ type: 'texte', delta });

const reply = (ctx: TenantContext, id: string, message: string, llm: Llm | null) =>
  replyStream(ctx, id, message, { llm, embedder: null });

describe('replyStream', () => {
  it('rend null sans modèle, sans rien écrire', async () => {
    const { alice } = await setup();
    const id = await createDiscussion(alice, { question: 'Question' });

    expect(reply(alice, id, 'Suite', null)).toBeNull();
    expect((await getDiscussion(alice, id))?.messages).toHaveLength(1);
  });

  it('enregistre une réponse qui cite [1] après chercher, avec ses citations (C9)', async () => {
    const { alice, ticket } = await setup();
    const id = await createDiscussion(alice, { question: 'Et le contrat quetzal ?' });
    const { llm } = scripted(
      [search('contrat quetzal')],
      [text('Le contrat est renouvelé '), text('pour un an [1].')],
    );

    const events = await collect(reply(alice, id, 'Et le contrat quetzal ?', llm));

    const { rows } = await adminPool.query<{ id: string }>(
      'select id from passages where source_id = $1',
      [ticket.sourceId],
    );
    const citation = {
      n: 1,
      sourceId: ticket.sourceId,
      passageId: rows[0]?.id,
      title: 'Ticket renouvellement',
      url: 'https://github.com/acme/leon/issues/7',
    };
    expect(events).toEqual([
      { type: 'outil', name: 'chercher' },
      { type: 'texte', delta: 'Le contrat est renouvelé ' },
      { type: 'texte', delta: 'pour un an [1].' },
      { type: 'citations', items: [citation] },
      { type: 'fin', reason: 'fini' },
    ]);
    const messages = (await getDiscussion(alice, id))?.messages ?? [];
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Et le contrat quetzal ?'],
      ['assistant', 'Le contrat est renouvelé pour un an [1].'],
    ]);
    expect(messages[1]?.citations).toEqual([citation]);
  });

  it('écarte un renvoi à une source qu’aucun outil n’a montrée', async () => {
    const { alice } = await setup();
    const id = await createDiscussion(alice, { question: 'Le contrat ?' });
    const { llm } = scripted([text('Trop tôt [1]. ')], [text('x')]);
    const withSearch = scripted([search('contrat quetzal')], [text('Oui [1][7], voir [2].')]);

    await collect(reply(alice, id, 'Le contrat ?', llm));
    await collect(reply(alice, id, 'Et après recherche ?', withSearch.llm));

    const messages = (await getDiscussion(alice, id))?.messages ?? [];
    expect(messages[1]).toMatchObject({ content: 'Trop tôt.', citations: [] });
    expect(messages[3]?.content).toBe('Oui [1], voir.');
    expect(messages[3]?.citations.map((c) => c.n)).toEqual([1]);
  });

  it('appelle le modèle de l’étape « discussion » avec le système fixe et ses outils', async () => {
    const { alice } = await setup();
    const id = await createDiscussion(alice, { question: 'Question' });
    const llm = createFakeLlm({ agent: () => [text('Je ne sais pas.')] });
    const runAgent = vi.spyOn(llm, 'runAgent');

    await collect(reply(alice, id, 'Question', llm));

    expect(llm.calls[0]).toMatchObject({ step: 'discussion', system: DISCUSSION_SYSTEM });
    const request = runAgent.mock.calls[0]?.[0];
    expect(request?.maxSteps).toBe(DISCUSSION_MAX_STEPS);
    expect(request?.tools.map((tool) => tool.name)).toEqual(['chercher', 'lire', 'activite']);
  });

  it('s’arrête après 8 appels d’outils sur 20 demandés : fin « limite », note gardée', async () => {
    const { alice } = await setup();
    const id = await createDiscussion(alice, { question: 'Cherche tout' });
    const spy = vi.spyOn(searchModule, 'searchPassages');
    const { llm } = scripted(Array.from({ length: 20 }, (_, i) => search(`quetzal ${i}`)));

    const events = await collect(reply(alice, id, 'Cherche tout', llm));

    expect(events.filter((event) => event.type === 'outil')).toHaveLength(8);
    expect(spy).toHaveBeenCalledTimes(8);
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'limite' });
    const messages = (await getDiscussion(alice, id))?.messages ?? [];
    expect(messages.at(-1)?.content).toBe(DISCUSSION_LIMIT_NOTE);
  });

  it('remplace la réponse par la phrase de refus quand le modèle refuse', async () => {
    const { alice } = await setup();
    const id = await createDiscussion(alice, { question: 'Donne les mails de Julie' });
    const { llm } = scripted([text('Voici les'), { type: 'fin', reason: 'refus' }]);

    const events = await collect(reply(alice, id, 'Donne les mails de Julie', llm));

    expect(events.slice(-2)).toEqual([
      { type: 'citations', items: [] },
      { type: 'fin', reason: 'refus' },
    ]);
    expect((await getDiscussion(alice, id))?.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: DISCUSSION_REFUSAL,
      citations: [],
    });
  });

  // Vigilance 5 : une panne du modèle n'efface pas la question, et rien de partiel n'est gardé.
  it('rend « indisponible » quand le modèle tombe en panne, et garde la question seule', async () => {
    const { alice } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const id = await createDiscussion(alice, { question: 'Question' });
    const broken: Llm = {
      streamText: () => {
        throw new Error('non utilisé');
      },
      async *runAgent() {
        yield { type: 'texte', delta: 'Début de réponse' };
        throw new LlmError('appel au modèle impossible');
      },
    };

    const events = await collect(reply(alice, id, 'Question', broken));

    expect(events).toEqual([
      { type: 'texte', delta: 'Début de réponse' },
      { type: 'indisponible', questionGardee: true },
    ]);
    const messages = (await getDiscussion(alice, id))?.messages ?? [];
    expect(messages.map((m) => [m.role, m.content])).toEqual([['user', 'Question']]);
  });

  // La base tombe avant d'écrire la question : la page ne doit pas dire qu'elle est gardée.
  it('rend « indisponible » sans question gardée quand la question ne peut pas être écrite', async () => {
    const { alice } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const id = await createDiscussion(alice, { question: 'Question' });
    vi.spyOn(discussionsModule, 'startReply').mockRejectedValue(new Error('base indisponible'));
    const llm = createFakeLlm({ agent: () => [text('Réponse')] });

    const events = await collect(reply(alice, id, 'Nouvelle question', llm));

    expect(events).toEqual([{ type: 'indisponible', questionGardee: false }]);
    expect(llm.calls).toHaveLength(0);
  });

  it('renvoie au modèle les 20 derniers messages au plus, la nouvelle question en dernier', async () => {
    const { alice } = await setup();
    const id = await createDiscussion(alice, { question: 'message 1' });
    let questionId = (await startReply(alice, id, 'message 1'))?.questionId ?? '';
    for (let index = 2; index <= 28; index++) {
      if (index % 2 === 0)
        await saveReply(alice, id, { questionId, content: `message ${index}`, citations: [] });
      else questionId = (await startReply(alice, id, `message ${index}`))?.questionId ?? '';
    }
    const llm = createFakeLlm({ agent: () => [text('Réponse')] });

    await collect(reply(alice, id, 'message 29', llm));

    const sent = llm.calls[0]?.messages ?? [];
    expect(sent.length).toBeLessThanOrEqual(20);
    expect(sent.length).toBeGreaterThanOrEqual(19);
    expect(sent[0]?.role).toBe('user');
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'message 29' });
  });

  it('part des résultats de la barre : joints à la première question, citables, lisibles', async () => {
    const { alice, ticket } = await setup();
    const id = await createDiscussion(alice, {
      question: 'Le contrat quetzal ?',
      seedSourceIds: [ticket.sourceId],
    });
    const { llm, toolResults } = scripted(
      [{ type: 'outil', name: 'lire', input: { sourceId: ticket.sourceId } }],
      [text('Renouvelé pour un an [1].')],
    );

    const events = await collect(reply(alice, id, 'Le contrat quetzal ?', llm));
    const second = createFakeLlm({ agent: () => [text('Rien de plus.')] });
    await collect(reply(alice, id, 'Et ensuite ?', second));

    const firstQuestion = llm.calls[0]?.messages.at(-1)?.content ?? '';
    expect(firstQuestion).toContain(`<source n="1" id="${ticket.sourceId}"`);
    expect(toolResults[0]).toContain('Décision : on renouvelle le contrat quetzal');
    expect(events.find((event) => event.type === 'citations')).toMatchObject({
      items: [{ n: 1, sourceId: ticket.sourceId }],
    });
    // La seconde réponse ne reçoit plus les résultats d'origine.
    expect(JSON.stringify(second.calls[0]?.messages)).not.toContain('<source');
  });
});

// Vigilance 4 : l'agent de Bob ne peut rien obtenir hors des droits de Bob.
describe('sous le contexte de Bob', () => {
  it('ne peut ni répondre dans une discussion d’Alice ni y écrire', async () => {
    const { alice, bob } = await setup();
    const id = await createDiscussion(alice, { question: 'Question privée' });
    const llm = createFakeLlm({ agent: () => [text('Intrusion')] });

    const events = await collect(reply(bob, id, 'Je m’invite', llm));

    expect(events).toEqual([{ type: 'indisponible', questionGardee: false }]);
    expect(llm.calls).toHaveLength(0);
    const { rows } = await adminPool.query(
      'select content from discussion_messages where discussion_id = $1',
      [id],
    );
    expect(rows).toEqual([{ content: 'Question privée' }]);
  });

  it('ne fait rien lire au modèle de la conversation privée d’Alice, même en la visant', async () => {
    const { bob, conversation } = await setup();
    const id = await createDiscussion(bob, { question: PRIVATE_WORDS });
    const { rows } = await adminPool.query<{ id: string }>(
      'select id from passages where source_id = $1',
      [conversation.sourceId],
    );
    const { llm, toolResults } = scripted(
      [search(PRIVATE_WORDS)],
      [{ type: 'outil', name: 'lire', input: { passageId: rows[0]?.id } }],
      [{ type: 'outil', name: 'lire', input: { sourceId: conversation.sourceId } }],
      [text('Je ne sais pas [1].')],
    );

    await collect(reply(bob, id, PRIVATE_WORDS, llm));

    expect(toolResults).toHaveLength(3);
    expect(toolResults.join('\n')).not.toContain('Note personnelle');
    expect(toolResults.join('\n')).not.toContain(conversation.sourceId);
    expect((await getDiscussion(bob, id))?.messages.at(-1)).toMatchObject({
      content: 'Je ne sais pas.',
      citations: [],
    });
  });
});

// Un modèle qui attend le feu vert avant de répondre : sa réponse reste en cours tant qu'on ne l'a pas donné.
function heldModel() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: () => void = () => undefined;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const calls: number[] = [];
  const llm: Llm = {
    streamText: () => {
      throw new Error('non utilisé');
    },
    async *runAgent() {
      calls.push(calls.length);
      started();
      await gate;
      yield text('Réponse.');
    },
  };
  return { llm, calls, running, release };
}

// Une seule réponse à la fois dans une discussion : celui qui revient sur la page pendant que Leon répond, ou qui
// redemande, ne lance pas un second agent (un coût doublé, deux réponses gardées).
describe('une réponse déjà en cours', () => {
  it('rend « en-cours » à une seconde demande, sans appeler le modèle ni rien écrire', async () => {
    const { alice } = await setup();
    const id = await createDiscussion(alice, { question: 'Question' });
    const model = heldModel();

    const first = collect(reply(alice, id, 'Question', model.llm));
    await model.running;
    const again = await collect(reply(alice, id, 'Question', model.llm));
    const other = await collect(reply(alice, id, 'Autre question', model.llm));
    model.release();

    expect(again).toEqual([{ type: 'en-cours' }]);
    expect(other).toEqual([{ type: 'en-cours' }]);
    expect((await first).at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    expect(model.calls).toHaveLength(1);
    expect((await getDiscussion(alice, id))?.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Question'],
      ['assistant', 'Réponse.'],
    ]);
  });

  it('ne gêne ni une autre discussion ni un autre utilisateur', async () => {
    const { alice, bob } = await setup();
    const id = await createDiscussion(alice, { question: 'Question' });
    const elsewhere = await createDiscussion(alice, { question: 'Ailleurs' });
    const model = heldModel();

    const first = collect(reply(alice, id, 'Question', model.llm));
    await model.running;
    const meanwhile = await collect(
      reply(alice, elsewhere, 'Ailleurs', createFakeLlm({ agent: () => [text('Oui.')] })),
    );
    const intruder = await collect(
      reply(bob, id, 'Je m’invite', createFakeLlm({ agent: () => [text('Non.')] })),
    );
    model.release();
    await first;

    expect(meanwhile.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    expect(intruder).toEqual([{ type: 'indisponible', questionGardee: false }]);
  });

  // Audit 2 n° 12 a : la page qui attend une réponse commencée plus tôt s'arrête dès qu'il n'y en a plus.
  it('dit si une réponse est en cours dans la discussion, pour son auteur seulement', async () => {
    const { alice, bob } = await setup();
    const id = await createDiscussion(alice, { question: 'Question' });
    const model = heldModel();

    const running = collect(reply(alice, id, 'Question', model.llm));
    await model.running;
    const during = [isReplying(alice, id), isReplying(bob, id)];
    model.release();
    await running;

    expect(during).toEqual([true, false]);
    expect(isReplying(alice, id)).toBe(false);
  });

  // Le coût d'un utilisateur : au plus deux réponses en cours à la fois, toutes discussions confondues.
  it('refuse une troisième réponse en cours du même utilisateur, sans rien écrire', async () => {
    const { alice, bob } = await setup();
    const ids = await Promise.all(
      ['Un', 'Deux', 'Trois'].map((question) => createDiscussion(alice, { question })),
    );
    const bobId = await createDiscussion(bob, { question: 'Quatre' });
    const model = heldModel();
    const third = createFakeLlm({ agent: () => [text('Non.')] });

    const running = [
      collect(reply(alice, ids[0] ?? '', 'Un', model.llm)),
      collect(reply(alice, ids[1] ?? '', 'Deux', model.llm)),
    ];
    await model.running;
    const refused = reply(alice, ids[2] ?? '', 'Trois', third);
    const other = await collect(
      reply(bob, bobId, 'Quatre', createFakeLlm({ agent: () => [text('Oui.')] })),
    );
    model.release();
    await Promise.all(running);
    const after = await collect(reply(alice, ids[2] ?? '', 'Trois', third));

    expect(refused).toBe('trop');
    expect(other.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    expect(after.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    expect(third.calls).toHaveLength(1);
  });

  it('se libère à la fin d’une réponse, après une panne, et quand le lecteur s’en va', async () => {
    const { alice } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const id = await createDiscussion(alice, { question: 'Question' });
    const broken: Llm = {
      streamText: () => {
        throw new Error('non utilisé');
      },
      // biome-ignore lint/correctness/useYield: un modèle en panne avant son premier mot
      async *runAgent() {
        throw new LlmError('appel au modèle impossible');
      },
    };

    expect(await collect(reply(alice, id, 'Question', broken))).toEqual([
      { type: 'indisponible', questionGardee: true },
    ]);
    // Le lecteur s'en va après le premier évènement : rien n'est gardé, la place est libre.
    const left = reply(alice, id, 'Question', scripted([search('quetzal')], [text('x')]).llm);
    for await (const event of left === 'trop' ? [] : (left ?? [])) {
      expect(event).toEqual({ type: 'outil', name: 'chercher' });
      break;
    }
    const done = await collect(
      reply(alice, id, 'Question', createFakeLlm({ agent: () => [text('Oui.')] })),
    );
    const next = await collect(
      reply(alice, id, 'Suite', createFakeLlm({ agent: () => [text('Bien.')] })),
    );

    expect(done.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    expect(next.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
    expect((await getDiscussion(alice, id))?.messages.map((m) => m.content)).toEqual([
      'Question',
      'Oui.',
      'Suite',
      'Bien.',
    ]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createDemoLlm, createFakeLlm } from './fake-llm';
import type { AgentEvent, AgentTool, ChatMessage } from './llm';

const messages: ChatMessage[] = [{ role: 'user', content: 'Où en est Acme ?' }];

// Les types d'évènements dans l'ordre, un seul par série (un texte en plusieurs morceaux compte pour un).
const sequence = (events: AgentEvent[]): string[] =>
  events.map((event) => event.type).filter((type, index, all) => type !== all[index - 1]);

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

function chercher(run: (input: { requete: string }) => Promise<string>): AgentTool {
  return {
    name: 'chercher',
    description: 'Cherche dans la mémoire',
    input: z.object({ requete: z.string().trim() }),
    run: run as AgentTool['run'],
  };
}

const agentRequest = (tools: AgentTool[], maxSteps = 8) => ({
  step: 'discussion' as const,
  system: 'Système',
  messages,
  tools,
  maxSteps,
  maxTokens: 500,
});

describe('createFakeLlm : streamText', () => {
  it('rend les morceaux scriptés, dans l’ordre, à chaque appel', async () => {
    const llm = createFakeLlm({ texts: ['Voici ', 'la réponse [1].'] });
    const request = { step: 'reponse' as const, system: 'Système', messages, maxTokens: 300 };

    expect(await collect(llm.streamText(request))).toEqual(['Voici ', 'la réponse [1].']);
    expect(await collect(llm.streamText(request))).toEqual(['Voici ', 'la réponse [1].']);
  });

  it('garde chaque appel dans calls : étape, système et messages', async () => {
    const llm = createFakeLlm({ texts: ['a'] });

    await collect(llm.streamText({ step: 'reponse', system: 'Consignes', messages, maxTokens: 1 }));
    await collect(llm.streamText({ step: 'point', system: 'Autres', messages: [], maxTokens: 1 }));

    expect(llm.calls).toEqual([
      { step: 'reponse', system: 'Consignes', messages },
      { step: 'point', system: 'Autres', messages: [] },
    ]);
  });

  it('lève quand le script ne prévoit pas de texte : un test mal réglé ne passe pas en silence', async () => {
    const llm = createFakeLlm({});

    await expect(
      collect(llm.streamText({ step: 'reponse', system: 'S', messages, maxTokens: 1 })),
    ).rejects.toThrow(/texts/);
  });
});

describe('createFakeLlm : runAgent', () => {
  it('exécute l’outil appelé par le script, rend son résultat à l’appel suivant, puis finit', async () => {
    const run = vi.fn(async (_input: { requete: string }) => 'trois résultats');
    const seen: Array<string | null> = [];
    const llm = createFakeLlm({
      agent: (call, lastToolResult) => {
        seen.push(lastToolResult);
        return call === 0
          ? [{ type: 'outil', name: 'chercher', input: { requete: '  acme ' } }]
          : [{ type: 'texte', delta: 'Acme avance [1].' }];
      },
    });

    const events = await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(events).toEqual([
      { type: 'outil', name: 'chercher', input: { requete: '  acme ' } },
      { type: 'texte', delta: 'Acme avance [1].' },
      { type: 'fin', reason: 'fini' },
    ]);
    expect(run).toHaveBeenCalledExactlyOnceWith({ requete: 'acme' });
    expect(seen).toEqual([null, 'trois résultats']);
  });

  it('rend au script un message d’erreur pour une entrée invalide, sans lever', async () => {
    const run = vi.fn(async () => 'jamais');
    const seen: Array<string | null> = [];
    const llm = createFakeLlm({
      agent: (call, lastToolResult) => {
        seen.push(lastToolResult);
        return call === 0 ? [{ type: 'outil', name: 'chercher', input: { requete: 7 } }] : [];
      },
    });

    const events = await collect(llm.runAgent(agentRequest([chercher(run)])));

    expect(run).not.toHaveBeenCalled();
    expect(seen[1]).toMatch(/Entrée invalide/);
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
  });

  it('s’arrête à maxSteps appels d’outil, puis finit sur la limite', async () => {
    const run = vi.fn(async () => 'résultat');
    const llm = createFakeLlm({
      agent: () => [{ type: 'outil', name: 'chercher', input: { requete: 'x' } }],
    });

    const events = await collect(llm.runAgent(agentRequest([chercher(run)], 8)));

    expect(run).toHaveBeenCalledTimes(8);
    expect(events.filter((event) => event.type === 'outil')).toHaveLength(8);
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'limite' });
  });

  it('respecte la limite même quand un seul tour appelle plusieurs outils', async () => {
    const run = vi.fn(async () => 'résultat');
    const appel: AgentEvent = { type: 'outil', name: 'chercher', input: { requete: 'x' } };
    const llm = createFakeLlm({ agent: () => [appel, appel, appel] });

    const events = await collect(llm.runAgent(agentRequest([chercher(run)], 2)));

    expect(run).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'limite' });
  });

  it('laisse le script finir sur un refus', async () => {
    const llm = createFakeLlm({ agent: () => [{ type: 'fin', reason: 'refus' }] });

    expect(await collect(llm.runAgent(agentRequest([])))).toEqual([
      { type: 'fin', reason: 'refus' },
    ]);
  });

  it('garde l’appel dans calls, comme streamText', async () => {
    const llm = createFakeLlm({ agent: () => [] });

    await collect(llm.runAgent(agentRequest([])));

    expect(llm.calls).toEqual([{ step: 'discussion', system: 'Système', messages }]);
  });

  it('lève quand le script ne prévoit pas d’agent', async () => {
    const llm = createFakeLlm({ texts: ['a'] });

    await expect(collect(llm.runAgent(agentRequest([])))).rejects.toThrow(/agent/);
  });
});

describe('createDemoLlm : le faux modèle des démonstrations', () => {
  const request = { step: 'reponse' as const, system: 'S', messages, maxTokens: 300 };

  it('répond en texte court qui cite [1], toujours pareil', async () => {
    const llm = createDemoLlm();

    const first = (await collect(llm.streamText(request))).join('');
    const second = (await collect(llm.streamText(request))).join('');

    expect(first).toContain('[1]');
    expect(first.split(/\s+/).length).toBeLessThanOrEqual(40);
    expect(second).toBe(first);
  });

  it('appelle une fois l’outil « chercher » avec la dernière question, puis répond en citant [1]', async () => {
    const run = vi.fn(async (_input: { requete: string }) => 'résultats');
    const llm = createDemoLlm();

    const events = await collect(
      llm.runAgent({
        ...agentRequest([chercher(run)]),
        messages: [
          { role: 'user', content: 'Première question' },
          { role: 'assistant', content: 'Réponse' },
          { role: 'user', content: 'Où en est Acme ?' },
        ],
      }),
    );

    expect(run).toHaveBeenCalledExactlyOnceWith({ requete: 'Où en est Acme ?' });
    expect(sequence(events)).toEqual(['outil', 'texte', 'fin']);
    expect(events[0]).toEqual({
      type: 'outil',
      name: 'chercher',
      input: { requete: 'Où en est Acme ?' },
    });
    const texte = events.flatMap((event) => (event.type === 'texte' ? [event.delta] : [])).join('');
    expect(texte).toContain('[1]');
    expect(events.at(-1)).toEqual({ type: 'fin', reason: 'fini' });
  });

  it('répond sans outil quand maxSteps vaut 0 : il n’a aucune étape à dépenser', async () => {
    const run = vi.fn(async () => 'jamais');
    const llm = createDemoLlm();

    const sansEtape = await collect(llm.runAgent(agentRequest([chercher(run)], 0)));

    expect(sequence(sansEtape)).toEqual(['texte', 'fin']);
    expect(run).not.toHaveBeenCalled();
  });

  // Le faux écrit en dur le nom de l'outil et sa clé : une liste d'outils qui ne les a plus doit se voir tout de
  // suite, pas donner en silence une démonstration sans recherche.
  it('lève quand « chercher » n’est pas fourni : un outil renommé ne passe pas en silence', async () => {
    const llm = createDemoLlm();
    const renomme: AgentTool = { ...chercher(async () => 'x'), name: 'rechercher' };

    await expect(collect(llm.runAgent(agentRequest([])))).rejects.toThrow(/« chercher »/);
    await expect(collect(llm.runAgent(agentRequest([renomme])))).rejects.toThrow(/« chercher »/);
  });

  it('le dit, sans citer [1], quand l’outil refuse sa requête : pas de renvoi vers rien', async () => {
    const run = vi.fn(async () => 'jamais');
    const autreCle: AgentTool = {
      name: 'chercher',
      description: 'Cherche dans la mémoire',
      input: z.object({ q: z.string() }),
      run: run as AgentTool['run'],
    };
    const llm = createDemoLlm();

    const events = await collect(llm.runAgent(agentRequest([autreCle])));

    expect(run).not.toHaveBeenCalled();
    expect(sequence(events)).toEqual(['outil', 'texte', 'fin']);
    const texte = events.flatMap((event) => (event.type === 'texte' ? [event.delta] : [])).join('');
    expect(texte).toMatch(/pas pu chercher/);
    expect(texte).not.toContain('[1]');
  });
});

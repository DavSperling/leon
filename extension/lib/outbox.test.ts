import { describe, expect, it } from 'vitest';
import type { IngestPayload } from '../../src/capture/turn';
import { createMemoryStore } from './memory-store';
import { countPending, enqueuePayload, flushOutbox, OUTBOX_MAX } from './outbox';

function payload(externalId: string): IngestPayload {
  return {
    source: { kind: 'chatgpt', external_id: externalId },
    turns: [
      {
        external_id: `${externalId}-u`,
        role: 'user',
        text: 'Bonjour',
        ts: '2026-10-13T09:00:00.000Z',
        capture_mode: 'network',
      },
    ],
  };
}

const respond = (status: number) => async () => new Response(null, { status });
const always = () => true;

describe('flushOutbox', () => {
  it('retire l’élément accepté (202) et se dit connecté', async () => {
    const store = createMemoryStore();
    await enqueuePayload(store, payload('a'));
    expect(await flushOutbox(store, respond(202), always)).toBe('connected');
    expect(await countPending(store)).toBe(0);
  });

  it('garde tout sur un 401 et s’arrête au premier envoi', async () => {
    const store = createMemoryStore();
    await enqueuePayload(store, payload('a'));
    await enqueuePayload(store, payload('b'));
    let calls = 0;
    const post = async () => {
      calls += 1;
      return new Response(null, { status: 401 });
    };
    expect(await flushOutbox(store, post, always)).toBe('unauthorized');
    expect(await countPending(store)).toBe(2);
    expect(calls).toBe(1);
  });

  it('garde tout sur une erreur réseau', async () => {
    const store = createMemoryStore();
    await enqueuePayload(store, payload('a'));
    const post = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await flushOutbox(store, post, always)).toBe('unreachable');
    expect(await countPending(store)).toBe(1);
  });

  it('garde tout sur une erreur du serveur (5xx)', async () => {
    const store = createMemoryStore();
    await enqueuePayload(store, payload('a'));
    expect(await flushOutbox(store, respond(503), always)).toBe('unreachable');
    expect(await countPending(store)).toBe(1);
  });

  it.each([400, 413])(
    'retire une charge refusée pour toujours (%i) et continue',
    async (status) => {
      const store = createMemoryStore();
      await enqueuePayload(store, payload('refusee'));
      await enqueuePayload(store, payload('bonne'));
      const sent: string[] = [];
      const post = async (body: IngestPayload) => {
        sent.push(body.source.external_id);
        return new Response(null, { status: body.source.external_id === 'refusee' ? status : 202 });
      };
      expect(await flushOutbox(store, post, always)).toBe('connected');
      expect(sent).toEqual(['refusee', 'bonne']);
      expect(await countPending(store)).toBe(0);
    },
  );

  it('envoie dans l’ordre d’arrivée', async () => {
    const store = createMemoryStore();
    for (const id of ['a', 'b', 'c']) await enqueuePayload(store, payload(id));
    const sent: string[] = [];
    await flushOutbox(
      store,
      async (body) => {
        sent.push(body.source.external_id);
        return new Response(null, { status: 202 });
      },
      always,
    );
    expect(sent).toEqual(['a', 'b', 'c']);
  });

  it('garde en tampon, sans l’envoyer, ce que shouldSend refuse', async () => {
    const store = createMemoryStore();
    for (const id of ['a', 'coupe', 'b']) await enqueuePayload(store, payload(id));
    const sent: string[] = [];
    const post = async (body: IngestPayload) => {
      sent.push(body.source.external_id);
      return new Response(null, { status: 202 });
    };
    const connection = await flushOutbox(
      store,
      post,
      (body) => body.source.external_id !== 'coupe',
    );
    expect(connection).toBe('connected');
    expect(sent).toEqual(['a', 'b']);
    expect(await countPending(store)).toBe(1);
  });

  it('n’envoie rien et reste inconnu quand shouldSend refuse tout', async () => {
    const store = createMemoryStore();
    await enqueuePayload(store, payload('a'));
    const post = async () => {
      throw new Error('ne doit pas être appelé');
    };
    expect(await flushOutbox(store, post, () => false)).toBe('unknown');
    expect(await countPending(store)).toBe(1);
  });

  it('ne contacte pas le serveur quand le tampon est vide', async () => {
    const post = async () => {
      throw new Error('ne doit pas être appelé');
    };
    expect(await flushOutbox(createMemoryStore(), post, always)).toBe('unknown');
  });
});

describe('enqueuePayload', () => {
  it('plafonne le tampon : les plus anciens sortent', async () => {
    const store = createMemoryStore();
    for (let i = 0; i < OUTBOX_MAX + 2; i += 1) await enqueuePayload(store, payload(`p${i}`));
    expect(await countPending(store)).toBe(OUTBOX_MAX);
    const sent: string[] = [];
    await flushOutbox(
      store,
      async (body) => {
        sent.push(body.source.external_id);
        return new Response(null, { status: 202 });
      },
      always,
    );
    expect(sent[0]).toBe('p2');
    expect(sent.at(-1)).toBe(`p${OUTBOX_MAX + 1}`);
  });
});

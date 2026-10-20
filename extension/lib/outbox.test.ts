import { describe, expect, it } from 'vitest';
import type { IngestPayload } from '../../src/capture/turn';
import { createMemoryStore } from './memory-store';
import {
  countPending,
  enqueuePayload,
  flushOutbox,
  forgetOutboxOnTokenChange,
  noteOrganization,
  OUTBOX_MAX,
  OUTBOX_MAX_BYTES,
  takeDropped,
} from './outbox';

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
      // Une perte comme une autre : la popup la dit.
      expect(await takeDropped(store)).toEqual({ refused: 1 });
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

  it('compte les échanges sortis par le plafond', async () => {
    const store = createMemoryStore();
    for (let i = 0; i < OUTBOX_MAX + 2; i += 1) await enqueuePayload(store, payload(`p${i}`));
    expect(await takeDropped(store)).toEqual({ full: 2 });
    expect(await takeDropped(store)).toEqual({});
  });

  // Au-delà du quota du navigateur, l'écriture échouerait et la capture serait perdue sans un mot.
  it('borne le tampon en octets : les plus anciens sortent et sont comptés', async () => {
    const store = createMemoryStore();
    const third = Math.ceil(OUTBOX_MAX_BYTES / 3);
    for (const id of ['a', 'b', 'c']) await enqueuePayload(store, heavyPayload(id, third));
    expect(await countPending(store)).toBe(2);
    expect(await takeDropped(store)).toEqual({ full: 1 });
    const stored = JSON.stringify(await store.get('leon.outbox'));
    expect(new TextEncoder().encode(stored).length).toBeLessThanOrEqual(OUTBOX_MAX_BYTES);
  });

  it('refuse et compte un échange plus gros que tout le tampon', async () => {
    const store = createMemoryStore();
    await enqueuePayload(store, payload('petit'));
    await enqueuePayload(store, heavyPayload('enorme', OUTBOX_MAX_BYTES + 1));
    expect(await countPending(store)).toBe(1);
    expect(await takeDropped(store)).toEqual({ full: 1 });
  });
});

describe('takeDropped', () => {
  // La popup lit les pertes pendant que le service worker en ajoute : aucune ne doit disparaître.
  it('ne perd pas une perte comptée entre la lecture et l’écriture de la popup', async () => {
    const inner = createMemoryStore();
    await inner.set('leon.dropped', { full: 2 });
    let injected = false;
    const store = {
      async get(key: string) {
        const value = await inner.get(key);
        if (key === 'leon.dropped' && !injected) {
          injected = true;
          await inner.set('leon.dropped', { full: 3 });
        }
        return value;
      },
      set: (key: string, value: unknown) => inner.set(key, value),
    };
    expect(await takeDropped(store)).toEqual({ full: 2 });
    expect(await takeDropped(store)).toEqual({ full: 1 });
    expect(await takeDropped(store)).toEqual({});
  });
});

describe('forgetOutboxOnTokenChange', () => {
  const X = `leon_${'x'.repeat(43)}`;
  const Y = `leon_${'y'.repeat(43)}`;
  const ORG_A = '00000000-0000-4000-8000-00000000000a';
  const ORG_B = '00000000-0000-4000-8000-00000000000b';
  const unknown = async () => null;

  it.each([
    ['un autre jeton', Y],
    ['le jeton retiré', null],
  ])('vide le tampon et compte la perte quand le jeton change (%s)', async (_name, next) => {
    const store = createMemoryStore();
    await forgetOutboxOnTokenChange(store, X, unknown);
    await enqueuePayload(store, payload('a'));
    await enqueuePayload(store, payload('b'));
    await forgetOutboxOnTokenChange(store, next, unknown);
    expect(await countPending(store)).toBe(0);
    expect(await takeDropped(store)).toEqual({ token: 2 });
  });

  it('garde le tampon avec le même jeton', async () => {
    const store = createMemoryStore();
    await forgetOutboxOnTokenChange(store, X, unknown);
    await enqueuePayload(store, payload('a'));
    await forgetOutboxOnTokenChange(store, X, unknown);
    expect(await countPending(store)).toBe(1);
  });

  it('garde le tampon au premier jeton (capté avant tout jeton, ou avant la mise à jour)', async () => {
    const store = createMemoryStore();
    await enqueuePayload(store, payload('a'));
    await forgetOutboxOnTokenChange(store, X, unknown);
    expect(await countPending(store)).toBe(1);
    const later = createMemoryStore();
    await forgetOutboxOnTokenChange(later, null, unknown);
    await enqueuePayload(later, payload('b'));
    await forgetOutboxOnTokenChange(later, Y, unknown);
    expect(await countPending(later)).toBe(1);
    expect(await takeDropped(later)).toEqual({});
  });

  it('garde le tampon quand le nouveau jeton est de la même organisation', async () => {
    const store = createMemoryStore();
    await forgetOutboxOnTokenChange(store, X, unknown);
    await noteOrganization(store, X, ORG_A);
    await enqueuePayload(store, payload('a'));
    await forgetOutboxOnTokenChange(store, Y, async (token) => (token === Y ? ORG_A : null));
    expect(await countPending(store)).toBe(1);
    expect(await takeDropped(store)).toEqual({});
    // L'organisation suit le nouveau jeton : un troisième jeton d'une autre organisation vide le tampon.
    await forgetOutboxOnTokenChange(store, X, async () => ORG_B);
    expect(await countPending(store)).toBe(0);
  });

  it.each([
    ['d’une autre organisation', async () => ORG_B],
    ['dont l’organisation est inconnue', unknown],
  ])('vide le tampon quand le nouveau jeton est %s', async (_name, organizationOf) => {
    const store = createMemoryStore();
    await forgetOutboxOnTokenChange(store, X, unknown);
    await noteOrganization(store, X, ORG_A);
    await enqueuePayload(store, payload('a'));
    await forgetOutboxOnTokenChange(store, Y, organizationOf);
    expect(await countPending(store)).toBe(0);
    expect(await takeDropped(store)).toEqual({ token: 1 });
  });

  it('vide le tampon quand l’organisation de l’ancien jeton n’a jamais été notée', async () => {
    const store = createMemoryStore();
    await forgetOutboxOnTokenChange(store, X, unknown);
    await noteOrganization(store, Y, ORG_A);
    await enqueuePayload(store, payload('a'));
    await forgetOutboxOnTokenChange(store, Y, async () => ORG_A);
    expect(await countPending(store)).toBe(0);
  });
});

// Une charge d'au moins `bytes` octets en UTF-8 (« é » en vaut deux), en tours de 20 000 caractères au plus.
function heavyPayload(externalId: string, bytes: number): IngestPayload {
  const turns = Math.ceil(bytes / 2 / 20_000);
  return {
    source: { kind: 'chatgpt', external_id: externalId },
    turns: Array.from({ length: turns }, (_, i) => ({
      external_id: `${externalId}-${i}`,
      role: 'user' as const,
      text: 'é'.repeat(20_000),
      ts: '2026-10-13T09:00:00.000Z',
      capture_mode: 'network' as const,
    })),
  };
}

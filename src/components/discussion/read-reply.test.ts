import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISCUSSION_REFUSAL, discussionMessagesUrl } from '@/lib/discussion-events';
import { questionNotWritten, type ReplyProgress, readReply, retryQuestion } from './read-reply';

// Ce que la page d'une discussion comprend de la réponse de la route : chaque issue a son état, et la page ne dit
// « votre question est gardée » que lorsque le serveur l'a gardée.

const ID = '0b6c1f0e-8a52-4c0e-9d8e-3f1b2a4c5d6e';
const CITATION = {
  n: 1,
  sourceId: ID,
  passageId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  title: 'Ticket',
  url: null,
};

afterEach(() => vi.unstubAllGlobals());

// Un flux d'évènements serveur, en morceaux coupés n'importe où.
const sse = (...events: unknown[]) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`);

function respond(status: number, chunks: string[] = []) {
  const fetch = vi.fn(async () => {
    if (status === 204) return new Response(null, { status });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function read(onProgress: (progress: ReplyProgress) => void = () => undefined) {
  return readReply(ID, 'La clause ?', onProgress);
}

describe('readReply', () => {
  it('envoie la question à la route de la discussion', async () => {
    const fetch = respond(204);

    await read();

    expect(fetch).toHaveBeenCalledWith(
      discussionMessagesUrl(ID),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ message: 'La clause ?' }) }),
    );
  });

  it('rend la réponse finie, ses citations, et chaque étape en chemin', async () => {
    respond(200, [
      ...sse({ type: 'outil', name: 'chercher' }, { type: 'texte', delta: 'Acceptée ' }),
      ...sse({ type: 'texte', delta: '[1].' }, { type: 'citations', items: [CITATION] }),
      ...sse({ type: 'fin', reason: 'fini' }),
    ]);
    const steps: ReplyProgress[] = [];

    const outcome = await read((progress) => steps.push(progress));

    expect(outcome).toEqual({
      status: 'finie',
      content: 'Acceptée [1].',
      citations: [CITATION],
      actions: [],
    });
    expect(steps.map((step) => [step.text, step.activity])).toEqual([
      ['', 'chercher'],
      ['Acceptée ', null],
      ['Acceptée [1].', null],
      ['Acceptée [1].', null],
    ]);
  });

  it('remplace un refus par la phrase fixe', async () => {
    respond(200, sse({ type: 'texte', delta: 'Voici' }, { type: 'fin', reason: 'refus' }));

    expect(await read()).toMatchObject({ status: 'finie', content: DISCUSSION_REFUSAL });
  });

  it('dit « sans modèle » sur 204', async () => {
    respond(204);

    expect(await read()).toEqual({ status: 'sans-modele' });
  });

  it('dit qu’une autre réponse est en cours', async () => {
    respond(200, sse({ type: 'en-cours' }));

    expect(await read()).toEqual({ status: 'en-cours' });
  });

  // La route dit dans l'évènement si elle a gardé la question avant d'échouer.
  it('dit la question gardée seulement quand l’évènement « indisponible » le dit', async () => {
    respond(
      200,
      sse({ type: 'texte', delta: 'Début' }, { type: 'indisponible', questionGardee: true }),
    );
    expect(await read()).toEqual({ status: 'indisponible', questionGardee: true });

    respond(200, sse({ type: 'indisponible', questionGardee: false }));
    expect(await read()).toEqual({ status: 'indisponible', questionGardee: false });
  });

  it('dit que trop de réponses sont en cours (429)', async () => {
    respond(429);

    expect(await read()).toEqual({ status: 'occupe' });
  });

  it('distingue la session expirée (401) et l’adresse refusée (403)', async () => {
    respond(401);
    expect(await read()).toEqual({ status: 'session' });

    respond(403);
    expect(await read()).toEqual({ status: 'origine' });
  });

  // La route a répondu avant de garder quoi que ce soit, ou le réseau a lâché avant sa réponse : rien n'est promis.
  it('ne promet rien sur un autre refus ou une panne du réseau avant la réponse', async () => {
    for (const status of [400, 404, 413, 500]) {
      respond(status);
      expect(await read()).toEqual({ status: 'indisponible', questionGardee: false });
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('réseau coupé');
      }),
    );
    expect(await read()).toEqual({ status: 'indisponible', questionGardee: false });
  });

  // Audit 3 n° 7 : après 200, le serveur a pris la question et finit sa réponse même sans lecteur (session-routes.ts).
  // Un flux coupé (proxy, réseau) n'est donc pas une question perdue : la page relit la discussion.
  it('dit « coupée » quand le flux s’arrête ou lâche après 200, sans évènement de fin', async () => {
    respond(200, sse({ type: 'texte', delta: 'Début' }));
    expect(await read()).toEqual({ status: 'coupee' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse({ type: 'texte', delta: 'Début' })[0]));
            controller.error(new TypeError('réseau coupé'));
          },
        });
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );
    expect(await read()).toEqual({ status: 'coupee' });
  });
});

// Audit 2 n° 12 b : une question que le serveur n'a pas écrite ne reste pas affichée ; elle revient dans la saisie.
describe('questionNotWritten', () => {
  it('vaut pour 429, 401, 403, 204 et « indisponible » sans question gardée', () => {
    for (const status of ['occupe', 'session', 'origine', 'sans-modele'] as const) {
      expect(questionNotWritten({ status })).toBe(true);
    }
    expect(questionNotWritten({ status: 'indisponible', questionGardee: false })).toBe(true);
  });

  it('ne vaut pas pour une question gardée, une réponse finie ou une réponse déjà en cours', () => {
    expect(questionNotWritten({ status: 'indisponible', questionGardee: true })).toBe(false);
    expect(questionNotWritten({ status: 'finie', content: 'R', citations: [], actions: [] })).toBe(
      false,
    );
    expect(questionNotWritten({ status: 'en-cours' })).toBe(false);
    expect(questionNotWritten({ status: 'coupee' })).toBe(false);
  });
});

// Audit 3 n° 10 : « Réessayer » renvoie la question qui vient d'échouer, jamais une question plus ancienne restée
// sans réponse au-dessus d'elle.
describe('retryQuestion', () => {
  it('ne propose rien pour une question nouvelle que le serveur n’a pas écrite (elle est dans la saisie)', () => {
    for (const outcome of [
      { status: 'occupe' },
      { status: 'indisponible', questionGardee: false },
    ] as const) {
      expect(retryQuestion(outcome, 'Question nouvelle', { repeated: false })).toBeNull();
    }
  });

  it('renvoie la question qui a échoué quand elle reste dans la discussion', () => {
    expect(
      retryQuestion({ status: 'indisponible', questionGardee: true }, 'Q', { repeated: false }),
    ).toBe('Q');
    expect(retryQuestion({ status: 'occupe' }, 'Q', { repeated: true })).toBe('Q');
  });
});

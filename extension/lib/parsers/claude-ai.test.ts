import { describe, expect, it, vi } from 'vitest';
import type { CapturedExchange } from '../exchange';
import { createClaudeAiParser } from './claude-ai';
import {
  CONV,
  concat,
  endOfStream,
  envelope,
  exchangeEnvelopes,
  gzip,
  gzipEnvelope,
  heartbeat,
  historyEnvelope,
  messageRecord,
  piece,
  prepareBody,
  proto,
  RPC,
  sendBody,
  smallActionBody,
  stepRecord,
  THOUGHT,
  textBlock,
  update,
} from './fixtures/claude-ai-frames';
import type { Rejection } from './site-parser';

const PERFORM = `${RPC}/PerformAction`;
const TIMELINE = `${RPC}/StreamTimeline`;
const START = new Date('2026-11-20T09:30:00.000Z');
const MINUTE = 60_000;

const FIRST = {
  userId: '5d0c1e2f-1a2b-4c3d-8e9f-00000000a001',
  replyId: '5d0c1e2f-1a2b-4c3d-8e9f-00000000a002',
  userText: 'Le fournisseur inventé veut être payé à soixante jours. On accepte ?',
  reply: ['Soixante jours pèsent sur la trésorerie inventée. Proposez quarante-cinq jours.'],
};
const NEXT = {
  userId: '5d0c1e2f-1a2b-4c3d-8e9f-00000000a003',
  replyId: '5d0c1e2f-1a2b-4c3d-8e9f-00000000a004',
  userText: 'Et à cinquante jours ?',
  reply: ['Cinquante jours restent possibles avec un acompte inventé.'],
  rank: 3,
};

// Une suite de morceaux ; open : le flux reste ouvert ensuite, comme celui que la page garde ; before : appelé avant
// chaque morceau (pour avancer l'horloge pendant que le flux arrive).
async function* chunks(parts: Uint8Array[], open = false, before = () => {}) {
  for (const part of parts) {
    before();
    yield part;
  }
  if (open) await new Promise(() => {});
}

// Des morceaux de size octets : une enveloppe tombe à cheval sur deux morceaux, un morceau en porte plusieurs.
const cut = (bytes: Uint8Array, size: number) =>
  Array.from({ length: Math.ceil(bytes.length / size) }, (_, i) =>
    bytes.subarray(i * size, (i + 1) * size),
  );

const TIMELINE_HEADERS = {
  'content-type': 'application/connect+proto',
  'connect-content-encoding': 'gzip',
};

function setup() {
  let clock = START;
  const parser = createClaudeAiParser(() => clock);
  const results: Array<CapturedExchange | Rejection> = [];
  const report = (result: CapturedExchange | Rejection) => {
    results.push(result);
  };
  const send = async (
    body: Uint8Array<ArrayBuffer> | null,
    options: { gzip?: boolean; encoding?: string; failed?: boolean } = {},
  ) => {
    const bytes = body !== null && options.gzip ? await gzip(body) : body;
    const encoding = options.encoding ?? (options.gzip ? 'gzip' : null);
    await parser.observe({
      url: new URL(PERFORM),
      request: {
        headers: new Headers(encoding ? { 'content-encoding': encoding } : {}),
        body: Promise.resolve(bytes),
      },
      response: Promise.resolve(
        options.failed
          ? null
          : {
              headers: new Headers({ 'content-type': 'application/proto' }),
              chunks: chunks([proto([6, 4])]),
            },
      ),
      report,
    });
  };
  const stream = (
    parts: Uint8Array[],
    // tick : l'horloge avance d'autant avant chaque morceau.
    options: { open?: boolean; headers?: Record<string, string>; tick?: number } = {},
  ) =>
    parser.observe({
      url: new URL(TIMELINE),
      request: { headers: new Headers(), body: Promise.resolve(envelope(proto([1, CONV]))) },
      response: Promise.resolve({
        headers: new Headers(options.headers ?? TIMELINE_HEADERS),
        chunks: chunks(parts, options.open, () => advance(options.tick ?? 0)),
      }),
      report,
    });
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  return { parser, results, send, stream, advance };
}

const exchangeOf = (x: typeof FIRST, ts = START): CapturedExchange => ({
  site: 'claude_ai',
  conversationId: CONV,
  title: null,
  user: { messageId: x.userId, text: x.userText, ts: ts.toISOString() },
  assistant: { messageId: x.replyId, text: x.reply.join('\n\n'), ts: ts.toISOString() },
});

const sendOf = (x: typeof FIRST, list = false) =>
  sendBody({ userId: x.userId, replyId: x.replyId, text: x.userText, list });

describe('claudeAiParser.matchesRequest', () => {
  const parser = createClaudeAiParser();

  it.each([
    PERFORM,
    TIMELINE,
    'https://claude.ai/claudeai-rpc/anthropic.bard.api.v2.ConversationService/StreamTimeline',
  ])('reconnaît POST %s', (href) => {
    expect(parser.matchesRequest(new URL(href), 'POST')).toBe(true);
  });

  it.each([
    ['GET', TIMELINE],
    ['POST', `${RPC}/ReportViewing`],
    ['POST', `${RPC}/ReadConversation`],
    ['POST', `${RPC}/StreamTimeline/extra`],
    ['POST', 'https://claude.ai/claudeai-rpc/StreamTimeline'],
    ['POST', `https://claude.ai/api/organizations/org-1/chat_conversations/${CONV}/completion`],
  ])('refuse %s %s', (method, href) => {
    expect(parser.matchesRequest(new URL(href), method)).toBe(false);
  });
});

describe('claudeAiParser.observe', () => {
  it("capte le premier échange d'une conversation neuve, sans la réflexion", async () => {
    const { results, send, stream } = setup();
    await send(prepareBody(), { gzip: true });
    await send(smallActionBody());
    await send(sendOf(FIRST, true), { gzip: true });
    await stream([...(await exchangeEnvelopes(FIRST)), endOfStream()]);
    expect(results).toEqual([exchangeOf(FIRST)]);
    expect(JSON.stringify(results)).not.toContain('PENSEE-CACHEE');
  });

  it('émet un échange suivant dès la réponse terminée, sur un flux resté ouvert', async () => {
    const { results, send, stream } = setup();
    await send(sendOf(NEXT));
    void stream(await exchangeEnvelopes(NEXT), { open: true });
    await vi.waitFor(() => expect(results).toEqual([exchangeOf(NEXT)]));
  });

  it.each([1, 7, 4096])('lit une réponse longue livrée en morceaux de %i octets', async (size) => {
    const { results, send, stream } = setup();
    const long = {
      ...FIRST,
      reply: [`Début inventé. ${'Une phrase inventée qui revient. '.repeat(400)}`],
    };
    await send(sendOf(long));
    await stream(cut(concat(await exchangeEnvelopes(long)), size));
    expect(results).toEqual([exchangeOf(long)]);
  });

  it('lit le bloc terminé quand il arrive dans une enveloppe compressée', async () => {
    const { results, send, stream } = setup();
    const long = { ...FIRST, reply: ['Texte inventé. '.repeat(200)] };
    const envelopes = await exchangeEnvelopes(long);
    // L'avant-dernière enveloppe porte le bloc terminé : compressée (drapeau 1).
    expect(envelopes.at(-2)?.[0]).toBe(1);
    await send(sendOf(long));
    await stream(envelopes);
    expect(results).toEqual([exchangeOf(long)]);
  });

  it("ne capte rien de l'historique rejoué", async () => {
    const { parser, results, stream } = setup();
    await stream([await historyEnvelope(6), endOfStream()]);
    expect(results).toEqual([]);
    expect(parser.size()).toBe(0);
  });

  it("joint deux blocs de texte dans l'ordre, séparés par une ligne vide", async () => {
    const { results, send, stream } = setup();
    const two = { ...FIRST, reply: ['Premier bloc inventé.', 'Second bloc inventé.'] };
    await send(sendOf(two));
    await stream(await exchangeEnvelopes(two));
    expect(results).toEqual([exchangeOf(two)]);
    expect(results[0]).toMatchObject({
      assistant: { text: 'Premier bloc inventé.\n\nSecond bloc inventé.' },
    });
  });

  it('ne prend jamais une réflexion, même rattachée comme un bloc de texte', async () => {
    const { results, send, stream } = setup();
    await send(sendOf(FIRST));
    const envelopes = await exchangeEnvelopes(FIRST);
    // Un bloc qui porte 9 mais rattaché à l'étape de réflexion (sorte 2).
    const disguised = envelope(
      update(
        textBlock({
          id: 'bloc_deguise',
          step: `etape_reflexion_${FIRST.replyId.slice(0, 8)}`,
          text: THOUGHT,
          done: true,
        }),
      ),
    );
    await stream([...envelopes.slice(0, -1), disguised, ...envelopes.slice(-1)]);
    expect(results).toEqual([exchangeOf(FIRST)]);
  });

  it("émet l'échange quand un flux annulé en pleine réponse est rouvert et livre la fin", async () => {
    const { results, send, stream } = setup();
    await send(sendOf(FIRST));
    const envelopes = await exchangeEnvelopes(FIRST);
    // Le premier flux finit (AbortError, que l'intercepteur change en fin) au milieu d'une enveloppe.
    const head = concat(envelopes.slice(0, 7));
    await stream([head.subarray(0, head.length - 3)]);
    expect(results).toEqual([]);
    void stream(envelopes.slice(6), { open: true });
    await vi.waitFor(() => expect(results).toEqual([exchangeOf(FIRST)]));
  });

  it('rejette comme incomplet, après 15 minutes, une attente jamais satisfaite', async () => {
    const { parser, results, send, stream, advance } = setup();
    await send(sendOf(FIRST));
    advance(15 * MINUTE - 1);
    await stream([envelope(heartbeat(1))]);
    expect(results).toEqual([]);
    advance(2);
    await stream([envelope(heartbeat(2))]);
    expect(results).toEqual([{ rejected: 'incomplet' }]);
    expect(parser.size()).toBe(0);
    // La réponse arrivée trop tard n'est plus captée.
    await stream(await exchangeEnvelopes(FIRST));
    expect(results).toEqual([{ rejected: 'incomplet' }]);
  });

  it('rejette comme incomplet une attente dépassée sur un flux resté ouvert, sans autre appel', async () => {
    const { results, send, stream } = setup();
    await send(sendOf(FIRST));
    void stream([envelope(heartbeat(1)), envelope(heartbeat(2))], {
      open: true,
      tick: 8 * MINUTE,
    });
    await vi.waitFor(() => expect(results).toEqual([{ rejected: 'incomplet' }]));
  });

  it('rejette comme incomplet une attente dépassée dès le prochain envoi', async () => {
    const { results, send, advance } = setup();
    await send(sendOf(FIRST));
    advance(16 * MINUTE);
    await send(sendOf(NEXT));
    expect(results).toEqual([{ rejected: 'incomplet' }]);
  });

  it('garde une réponse qui arrive encore après 15 minutes, morceau après morceau', async () => {
    const { results, send, stream } = setup();
    await send(sendOf(FIRST));
    const tag = FIRST.replyId.slice(0, 8);
    const step = `etape_${tag}`;
    const block = `bloc_${tag}`;
    const text = FIRST.reply[0] ?? '';
    // Une enveloppe toutes les 5 minutes : la réponse s'écrit pendant 40 minutes.
    await stream(
      [
        envelope(
          update(
            messageRecord({ id: FIRST.replyId, author: 2, rank: 1, replyTo: FIRST.userId }),
            stepRecord({ id: step, message: FIRST.replyId, rank: 1, kind: 1 }),
            textBlock({ id: block, step, text: text.slice(0, 2) }),
          ),
        ),
        ...Array.from({ length: 5 }, (_, i) => envelope(piece(block, `morceau inventé ${i}`))),
        envelope(update(textBlock({ id: block, step, text, done: true }))),
        envelope(update(messageRecord({ id: FIRST.replyId, author: 2, rank: 1, done: true }))),
      ],
      { tick: 5 * MINUTE },
    );
    expect(results).toEqual([exchangeOf(FIRST, new Date(START.getTime() + 40 * MINUTE))]);
  });

  it('rejette comme format une réponse terminée sans bloc de texte terminé', async () => {
    const { results, send, stream } = setup();
    await send(sendOf(FIRST));
    const tag = FIRST.replyId.slice(0, 8);
    await stream([
      envelope(
        update(
          messageRecord({ id: FIRST.replyId, author: 2, rank: 1, replyTo: FIRST.userId }),
          stepRecord({ id: `etape_${tag}`, message: FIRST.replyId, rank: 1, kind: 1 }),
          // Un bloc de texte resté en cours : jamais pris, même s'il porte déjà du texte.
          textBlock({ id: `bloc_${tag}`, step: `etape_${tag}`, text: 'Début inventé' }),
        ),
      ),
      envelope(update(messageRecord({ id: FIRST.replyId, author: 2, rank: 1, done: true }))),
    ]);
    expect(results).toEqual([{ rejected: 'format' }]);
  });

  it('lit une réponse dont le message terminé arrive dans la même enveloppe que son bloc', async () => {
    const { results, send, stream } = setup();
    await send(sendOf(FIRST));
    const tag = FIRST.replyId.slice(0, 8);
    await stream([
      envelope(
        update(
          messageRecord({ id: FIRST.replyId, author: 2, rank: 1, done: true }),
          textBlock({
            id: `bloc_${tag}`,
            step: `etape_${tag}`,
            text: FIRST.reply[0] ?? '',
            done: true,
          }),
          stepRecord({ id: `etape_${tag}`, message: FIRST.replyId, rank: 1, kind: 1 }),
        ),
      ),
    ]);
    expect(results).toEqual([exchangeOf(FIRST)]);
  });

  it("ne finit la réponse attendue que sur un message d'auteur 2", async () => {
    const { results, send, stream } = setup();
    await send(sendOf(FIRST));
    const envelopes = await exchangeEnvelopes(FIRST);
    const wrongAuthor = envelope(
      update(messageRecord({ id: FIRST.replyId, author: 1, done: true })),
    );
    await stream([...envelopes.slice(0, -1), wrongAuthor]);
    expect(results).toEqual([]);
    await stream(envelopes.slice(-1));
    expect(results).toEqual([exchangeOf(FIRST)]);
  });

  const finished = () =>
    envelope(update(messageRecord({ id: FIRST.replyId, author: 2, rank: 1, done: true })));

  it('borne les étapes gardées pour un envoi ; au-delà, la réponse est incomplète', async () => {
    const { parser, results, send, stream } = setup();
    await send(sendOf(FIRST));
    const records = Array.from({ length: 40 }, (_, i) => [
      stepRecord({ id: `etape_${i}`, message: FIRST.replyId, rank: i, kind: 1 }),
      textBlock({ id: `bloc_${i}`, step: `etape_${i}`, text: `Bloc inventé ${i}`, done: true }),
    ]).flat();
    await stream([envelope(update(...records))]);
    expect(parser.size()).toBe(1 + 32 + 32);
    // Jamais un texte coupé rendu comme s'il était complet.
    await stream([finished()]);
    expect(results).toEqual([{ rejected: 'incomplet' }]);
  });

  it('borne les blocs gardés pour une étape ; au-delà, la réponse est incomplète', async () => {
    const { parser, results, send, stream } = setup();
    await send(sendOf(FIRST));
    const blocks = Array.from({ length: 40 }, (_, i) =>
      textBlock({ id: `bloc_${i}`, step: 'etape_unique', text: `Bloc inventé ${i}`, done: true }),
    );
    const step = stepRecord({ id: 'etape_unique', message: FIRST.replyId, rank: 1, kind: 1 });
    await stream([envelope(update(step, ...blocks))]);
    expect(parser.size()).toBe(1 + 1 + 32);
    await stream([finished()]);
    expect(results).toEqual([{ rejected: 'incomplet' }]);
  });

  it('ne garde pas un bloc terminé vide', async () => {
    const { results, send, stream } = setup();
    await send(sendOf(FIRST));
    const step = stepRecord({ id: 'etape_unique', message: FIRST.replyId, rank: 1, kind: 1 });
    await stream([
      envelope(
        update(
          step,
          textBlock({ id: 'bloc_vide', step: 'etape_unique', text: '', done: true }),
          textBlock({
            id: 'bloc_plein',
            step: 'etape_unique',
            text: FIRST.reply[0] ?? '',
            done: true,
          }),
        ),
      ),
      finished(),
    ]);
    expect(results).toEqual([exchangeOf(FIRST)]);
  });

  it.each([2, 3])(
    'ne rejette rien pour une fin de flux (drapeau %i) pendant une attente',
    async (flags) => {
      const { parser, results, send, stream } = setup();
      await send(sendOf(FIRST));
      const before = parser.size();
      const json = new TextEncoder().encode('{"metadata":{}}');
      await stream([flags === 2 ? endOfStream() : envelope(await gzip(json), 3)]);
      expect(results).toEqual([]);
      expect(parser.size()).toBe(before);
    },
  );

  it('ne garde rien pour un long flux de battements', async () => {
    const { parser, results, send, stream } = setup();
    await send(sendOf(FIRST));
    const before = parser.size();
    const beats = concat(Array.from({ length: 20_000 }, (_, i) => envelope(heartbeat(i))));
    await stream(cut(beats, 1500));
    expect(parser.size()).toBe(before);
    await stream(await exchangeEnvelopes(FIRST));
    expect(results).toEqual([exchangeOf(FIRST)]);
    expect(parser.size()).toBe(0);
  });

  it('garde au plus 20 envois en attente : le plus vieux sort', async () => {
    const { parser, results, send, stream } = setup();
    const sends = Array.from({ length: 21 }, (_, i) => ({
      ...FIRST,
      userId: `5d0c1e2f-1a2b-4c3d-8e9f-00000000${1000 + i * 2}`,
      replyId: `5d0c1e2f-1a2b-4c3d-8e9f-00000000${1001 + i * 2}`,
    }));
    for (const one of sends) await send(sendOf(one));
    expect(parser.size()).toBe(20);
    const [oldest] = sends;
    const newest = sends.at(-1);
    if (!oldest || !newest) throw new Error('envois manquants');
    await stream(await exchangeEnvelopes(oldest));
    expect(results).toEqual([]);
    await stream(await exchangeEnvelopes(newest));
    expect(results).toEqual([exchangeOf(newest)]);
  });
});

describe('claudeAiParser.observe : les envois', () => {
  it('ne retient ni la préparation ni le petit appel sans champ 2', async () => {
    const { parser, results, send, advance, stream } = setup();
    await send(prepareBody(), { gzip: true });
    await send(smallActionBody());
    expect(parser.size()).toBe(0);
    advance(20 * MINUTE);
    await stream([envelope(heartbeat(1))]);
    expect(results).toEqual([]);
  });

  it('ne capte rien pour une action sans texte de la personne (une régénération)', async () => {
    const { parser, results, send } = setup();
    await send(proto([1, proto([2, CONV])], [2, proto([1, FIRST.userId], [2, FIRST.replyId])]));
    expect(results).toEqual([]);
    expect(parser.size()).toBe(0);
  });

  it.each([
    ['ne se lit pas', new Uint8Array([0xff, 0xff]), {}],
    ['est absent', null, {}],
    ['a un champ 2 illisible', proto([1, proto([2, CONV])], [2, new Uint8Array([0x0f])]), {}],
    ['annonce gzip sans en être', sendOf(FIRST), { encoding: 'gzip' }],
    ['a un encodage inconnu', sendOf(FIRST), { encoding: 'br' }],
    [
      'a un texte mais pas la conversation',
      proto([2, proto([1, FIRST.userId], [2, FIRST.replyId], [3, 'Texte inventé'])]),
      {},
    ],
    [
      'a un identifiant trop long',
      sendBody({ userId: FIRST.userId, replyId: 'r'.repeat(201), text: 'Texte inventé' }),
      {},
    ],
    [
      'a un texte mais pas la réponse attendue',
      proto([1, proto([2, CONV])], [2, proto([1, FIRST.userId], [3, 'Texte inventé'])]),
      {},
    ],
    [
      "a un identifiant qui n'est pas de l'UTF-8",
      proto(
        [1, proto([2, CONV])],
        [2, proto([1, new Uint8Array([0xc3])], [2, FIRST.replyId], [3, 'Texte inventé'])],
      ),
      {},
    ],
  ])('rejette comme format un corps qui %s', async (_label, body, options) => {
    const { parser, results, send } = setup();
    await send(body, options);
    expect(results).toEqual([{ rejected: 'format' }]);
    expect(parser.size()).toBe(0);
  });

  it("oublie l'envoi dont l'appel a échoué : aucun rejet ensuite", async () => {
    const { parser, results, send, advance, stream } = setup();
    await send(sendOf(FIRST), { failed: true });
    expect(parser.size()).toBe(0);
    advance(20 * MINUTE);
    await stream([envelope(heartbeat(1))]);
    expect(results).toEqual([]);
  });
});

describe('claudeAiParser.observe : un flux illisible', () => {
  const recordOf = (bytes: number[]) => update([3, new Uint8Array(bytes)]);
  const bad: Array<[string, () => Promise<Uint8Array[]>, Record<string, string>?]> = [
    ['une longueur folle', async () => [new Uint8Array([0, 0xff, 0xff, 0xff, 0xff, 0])]],
    ['un gzip corrompu', async () => [envelope(new Uint8Array([0x1f, 0x8b, 1, 2, 3, 4]), 1)]],
    [
      'un gzip tronqué',
      async () => {
        const whole = await gzipEnvelope(update(messageRecord({ id: FIRST.replyId, author: 2 })));
        return [envelope(whole.subarray(5, whole.length - 6), 1)];
      },
    ],
    [
      'une varint trop longue',
      async () => [envelope(recordOf([0x08, ...Array(10).fill(0xff), 1]))],
    ],
    ['un type de fil inconnu', async () => [envelope(recordOf([0x0f]))]],
    ['un groupe', async () => [envelope(new Uint8Array([0x0b, 0x0c]))]],
    [
      'une mise à jour illisible',
      async () => [envelope(proto([1, proto([1, new Uint8Array([0x0f])])]))],
    ],
    [
      'un encodage inconnu',
      async () => [await gzipEnvelope(update(messageRecord({ id: FIRST.replyId, author: 2 })))],
      { 'content-type': 'application/connect+proto', 'connect-content-encoding': 'br' },
    ],
    [
      'un autre type de contenu',
      async () => [envelope(heartbeat(1))],
      { 'content-type': 'application/connect+json', 'connect-content-encoding': 'gzip' },
    ],
  ];

  it.each(bad)(
    'rejette comme format, une seule fois, un flux avec %s quand un envoi attend',
    async (_label, parts, headers) => {
      const { results, send, stream } = setup();
      await send(sendOf(FIRST));
      // Après le premier rejet, le flux n'est plus lu : ni second rejet, ni échange.
      const rest = [...(await parts()), ...(await exchangeEnvelopes(FIRST))];
      await stream([concat(await parts()), concat(rest)], { headers });
      expect(results).toEqual([{ rejected: 'format' }]);
    },
  );

  it.each(bad)(
    'ne dit rien d’un flux avec %s sans envoi en attente',
    async (_label, parts, headers) => {
      const { results, stream } = setup();
      await expect(stream(await parts(), { headers })).resolves.toBeUndefined();
      expect(results).toEqual([]);
    },
  );

  it.each(bad)(
    'le dit au premier envoi suivant, une seule fois, quand un flux avec %s est abandonné avant',
    async (_label, parts, headers) => {
      const { results, send, stream } = setup();
      // Le flux d'une conversation rouverte s'ouvre au chargement, avant tout envoi.
      await stream(await parts(), { headers });
      await send(sendOf(FIRST));
      await send(sendOf(NEXT));
      expect(results).toEqual([{ rejected: 'format' }]);
    },
  );

  it('ne redit pas incomplet, 15 minutes plus tard, un envoi déjà rejeté comme format', async () => {
    const { results, send, stream, advance } = setup();
    await send(sendOf(FIRST));
    await stream([new Uint8Array([0, 0xff, 0xff, 0xff, 0xff, 0])]);
    advance(15 * MINUTE + 1);
    await stream([envelope(heartbeat(1))]);
    expect(results).toEqual([{ rejected: 'format' }]);
  });

  it('ne redit pas incomplet un envoi déjà signalé par un flux abandonné avant lui', async () => {
    const { results, send, stream, advance } = setup();
    await stream([envelope(heartbeat(1))], { headers: { 'content-type': 'application/json' } });
    await send(sendOf(FIRST));
    advance(15 * MINUTE + 1);
    await stream([envelope(heartbeat(2))]);
    expect(results).toEqual([{ rejected: 'format' }]);
  });
});

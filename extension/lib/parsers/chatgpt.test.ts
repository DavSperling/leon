import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chatgptParser } from './chatgpt';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const CONV = '6710a1b2-0000-4000-8000-00000000c0de';
const url = new URL('https://chatgpt.com/backend-api/f/conversation');
const now = new Date('2026-10-13T09:30:00.000Z');
const ts = now.toISOString();
const requestBody = fixture('chatgpt-request.json');
const deltaSse = fixture('chatgpt-delta.sse');
const legacySse = fixture('chatgpt-legacy.sse');
// Calqués sur l'échange réel relevé le 19/11/2026 (même suite d'événements, mêmes clés) ; textes et identifiants inventés.
const REAL_CONV = '6a1b2c3d-0000-4000-8000-00000000c0de';
const realRequest = fixture('chatgpt-reel-request.json');
const realSse = fixture('chatgpt-reel.sse');

const withBody = (change: (body: Record<string, unknown>) => void, original = requestBody) => {
  const body = JSON.parse(original);
  change(body);
  return JSON.stringify(body);
};
const parse = (sseText: string, body: string | null = requestBody) =>
  chatgptParser.parse({ url, requestBody: body, sseText, now });
// L'échange rendu ; sinon une erreur qui montre ce qui a été rendu à la place (un rejet, null).
const exchangeOf = async (result: ReturnType<typeof parse>) => {
  const value = await result;
  if (value === null || 'rejected' in value)
    throw new Error(`pas d'échange : ${JSON.stringify(value)}`);
  return value;
};
// Petit flux au format v1, terminé par sa marque de fin.
const toSse = (ops: unknown[]) =>
  `${ops.map((op) => `event: delta\ndata: ${JSON.stringify(op)}\n\n`).join('')}data: [DONE]\n\n`;
const message = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  author: { role: 'assistant' },
  content: { content_type: 'text', parts: [''] },
  status,
  recipient: 'all',
  ...extra,
});
const textOf = (text: string) => ({ content: { content_type: 'text', parts: [text] } });
const add = (doc: unknown) => ({ p: '', o: 'add', v: { message: doc, conversation_id: CONV } });
// Un message assistant, des opérations, puis la fin.
const deltaStream = (...ops: unknown[]) =>
  toSse([
    add(message('msg-a', 'in_progress')),
    ...ops,
    { p: '/message/status', o: 'replace', v: 'finished_successfully' },
  ]);

describe('chatgptParser.matchesRequest', () => {
  it.each([
    'https://chatgpt.com/backend-api/conversation',
    'https://chatgpt.com/backend-api/f/conversation',
  ])('reconnaît POST %s', (href) => {
    expect(chatgptParser.matchesRequest(new URL(href), 'POST')).toBe(true);
  });

  it.each([
    ['GET', 'https://chatgpt.com/backend-api/f/conversation'],
    ['POST', 'https://chatgpt.com/backend-api/f/conversation/prepare'],
    ['POST', `https://chatgpt.com/backend-api/conversation/${CONV}`],
    ['POST', 'https://chatgpt.com/backend-api/conversations'],
  ])('refuse %s %s', (method, href) => {
    expect(chatgptParser.matchesRequest(new URL(href), method)).toBe(false);
  });
});

describe('chatgptParser.parse, échange réel', () => {
  it("rend l'échange : message caché, formes courtes, lot patch en forme courte", async () => {
    expect(await parse(realSse, realRequest)).toEqual({
      site: 'chatgpt',
      conversationId: REAL_CONV,
      title: null,
      user: { messageId: '6a1b2c3d-0000-4000-8000-0000000000e1', text: 'Délais', ts },
      assistant: {
        messageId: '6a1b2c3d-0000-4000-8000-0000000000e4',
        text: 'Comptez dix jours, pas moins.',
        ts,
      },
    });
  });

  it('accepte conversation_id null : la conversation vient du flux', async () => {
    const body = withBody((b) => {
      b.conversation_id = null;
    }, realRequest);
    expect((await exchangeOf(parse(realSse, body))).conversationId).toBe(REAL_CONV);
  });

  it('rejette comme incomplet un flux coupé avant sa marque de fin', async () => {
    const cut = realSse.slice(0, realSse.indexOf('data: {"type": "message_stream_complete"'));
    expect(await parse(cut, realRequest)).toEqual({ rejected: 'incomplet' });
  });

  it('prend message_stream_complete seul comme marque de fin', async () => {
    const withoutDone = realSse.replace('data: [DONE]', '');
    expect((await exchangeOf(parse(withoutDone, realRequest))).assistant.text).toBe(
      'Comptez dix jours, pas moins.',
    );
  });
});

describe('chatgptParser.parse, format delta v1', () => {
  it("rend l'échange complet", async () => {
    const exchange = await parse(deltaSse);
    expect(exchange).toEqual({
      site: 'chatgpt',
      conversationId: CONV,
      title: 'Délais du fournisseur Orion',
      user: {
        messageId: 'aaa1b2c3-0000-4000-8000-0000000000u1',
        text: 'Le fournisseur Orion livre en 10 jours.\nIl faut prévoir la marge.',
        ts,
      },
      assistant: {
        messageId: 'bbb4d5e6-0000-4000-8000-0000000000a1',
        text: "Dix jours de livraison, c'est court. Prévoyez une marge.",
        ts,
      },
    });
  });

  it('ne garde ni pièce jointe, ni système, ni outil, ni pensée', async () => {
    expect(JSON.stringify(await parse(deltaSse))).not.toMatch(
      /PIECE-JOINTE-7f3a|SYSTEME-CACHE|OUTIL-CACHE|PENSEE-CACHEE/,
    );
  });

  it("rejette comme incomplet un flux coupé après un message d'outil", async () => {
    const cut = deltaSse.slice(0, deltaSse.indexOf('"id": "bbb4d5e6'));
    expect(await parse(cut)).toEqual({ rejected: 'incomplet' });
  });

  it('lit une forme courte après un add comme un nouveau message', async () => {
    const sseText = toSse([
      add(message('premier', 'finished_successfully', textOf('Premier'))),
      { v: { message: message('second', 'finished_successfully', textOf('Second')) } },
    ]);
    expect((await exchangeOf(parse(sseText))).assistant).toEqual({
      messageId: 'second',
      text: 'Second',
      ts,
    });
  });

  it('lit une forme courte après un patch comme un lot', async () => {
    const sseText = toSse([
      add(message('msg-a', 'in_progress')),
      { o: 'patch', v: [{ p: '/message/content/parts/0', o: 'append', v: 'Ré' }, { v: 'ponse' }] },
      { v: [{ p: '/message/status', o: 'replace', v: 'finished_successfully' }] },
    ]);
    expect((await exchangeOf(parse(sseText))).assistant).toEqual({
      messageId: 'msg-a',
      text: 'Réponse',
      ts,
    });
  });

  it('dans un lot, une opération sans o reprend celle de la précédente du même lot', async () => {
    const sseText = toSse([
      add(message('msg-a', 'en_attente', textOf('Réponse'))),
      {
        o: 'patch',
        v: [
          { p: '/message/status', o: 'replace', v: 'in_progress' },
          { p: '/message/status', v: 'finished_successfully' },
        ],
      },
    ]);
    expect((await exchangeOf(parse(sseText))).assistant.text).toBe('Réponse');
  });

  it('lit en entier un texte en plusieurs jetons : append explicite, puis formes courtes', async () => {
    const sseText = deltaStream(
      { p: '/message/content/parts/0', o: 'append', v: 'Dix jours ' },
      { v: 'de livraison, ' },
      { v: "c'est court." },
    );
    expect((await exchangeOf(parse(sseText))).assistant.text).toBe(
      "Dix jours de livraison, c'est court.",
    );
  });

  it('rejette comme format un flux complet sans message de réponse', async () => {
    const hidden = { ...message('cache', 'finished_successfully'), author: { role: 'system' } };
    expect(await parse(toSse([add(hidden)]))).toEqual({ rejected: 'format' });
  });

  it('prend le message final après un message « commentaire » terminé', async () => {
    const commentary = message('commentaire', 'finished_successfully', {
      channel: 'commentary',
      ...textOf('Je cherche.'),
    });
    const sseText = toSse([
      add(commentary),
      add(message('final', 'in_progress', { channel: 'final' })),
      { p: '/message/content/parts/0', o: 'append', v: 'Réponse finale' },
      { p: '/message/status', o: 'replace', v: 'finished_successfully' },
    ]);
    expect((await exchangeOf(parse(sseText))).assistant).toEqual({
      messageId: 'final',
      text: 'Réponse finale',
      ts,
    });
  });

  it.each([
    [
      'non terminé',
      [
        add(message('final', 'in_progress', { channel: 'final' })),
        { p: '/message/content/parts/0', o: 'append', v: 'Longue réponse' },
        { p: '/message/status', o: 'replace', v: 'finished_partial_completion' },
      ],
    ],
    ['terminé vide', [add(message('final', 'finished_successfully', { channel: 'final' }))]],
  ])('ne prend jamais le préambule quand le message final est %s', async (_label, ops) => {
    const preamble = message('preambule', 'finished_successfully', {
      channel: 'commentary',
      ...textOf('Je cherche.'),
    });
    expect(await parse(toSse([add(preamble), ...ops]))).toEqual({ rejected: 'format' });
  });

  it.each([
    ['un message texte non terminé', message('suite', 'in_progress', textOf('Brouil'))],
    [
      'un message adressé à un outil',
      message('appel', 'finished_successfully', { recipient: 'web.run', ...textOf('OUTIL-CACHE') }),
    ],
    ['un message texte terminé vide', message('vide', 'finished_successfully')],
  ])('prend le message final même suivi d’%s', async (_label, later) => {
    const sseText = toSse([
      add(message('final', 'finished_successfully', textOf('Réponse finale'))),
      add(later),
    ]);
    expect((await exchangeOf(parse(sseText))).assistant).toEqual({
      messageId: 'final',
      text: 'Réponse finale',
      ts,
    });
  });

  it.each([
    ['outil', { role: 'tool' }, { content_type: 'text', parts: ['OUTIL-CACHE'] }],
    ['système', { role: 'system' }, { content_type: 'text', parts: ['SYSTEME-CACHE'] }],
    ['pensée', { role: 'assistant' }, { content_type: 'thoughts', parts: ['PENSEE-CACHEE'] }],
  ])('ignore un message %s terminé après la réponse', async (_label, author, content) => {
    const later = { id: 'apres', author, content, status: 'finished_successfully' };
    const sseText = toSse([
      add(message('msg-a', 'in_progress')),
      { p: '/message/content/parts/0', o: 'append', v: 'Réponse' },
      { p: '/message/status', o: 'replace', v: 'finished_successfully' },
      add(later),
    ]);
    expect((await exchangeOf(parse(sseText))).assistant).toEqual({
      messageId: 'msg-a',
      text: 'Réponse',
      ts,
    });
  });

  it('prend la conversation dans le flux quand le corps ne la porte pas', async () => {
    const body = withBody((b) => {
      delete b.conversation_id;
    });
    expect((await exchangeOf(parse(deltaSse, body))).conversationId).toBe(CONV);
  });

  it('applique replace et add sur un chemin', async () => {
    const sseText = deltaStream(
      { p: '/message/content/parts/0', o: 'append', v: 'brouillon' },
      { p: '/message/content/parts/0', o: 'replace', v: 'Texte remplacé' },
      { p: '/message/content/parts/1', o: 'add', v: ' et ajouté' },
    );
    expect((await exchangeOf(parse(sseText))).assistant.text).toBe('Texte remplacé\n et ajouté');
  });

  it("n'écrit jamais dans les prototypes", async () => {
    const sseText = deltaStream(
      { p: '/__proto__/pollue', o: 'replace', v: 'oui' },
      { p: '/message/__proto__', o: 'replace', v: { pollue: 'oui' } },
      { p: '/message/content/parts/0', o: 'append', v: 'Texte' },
    );
    expect((await exchangeOf(parse(sseText))).assistant.text).toBe('Texte');
    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
  });

  it('rejette comme incomplet un flux interrompu', async () => {
    const interrupted = deltaSse.slice(
      0,
      deltaSse.indexOf('"o": "patch", "v": [{"p": "/message/content'),
    );
    expect(await parse(interrupted)).toEqual({ rejected: 'incomplet' });
  });
});

describe('chatgptParser.parse, ancien format', () => {
  it('lit le dernier message complet', async () => {
    const exchange = await exchangeOf(parse(legacySse));
    expect(exchange.assistant).toEqual({
      messageId: 'ccc7f8a9-0000-4000-8000-0000000000a2',
      text: "Dix jours de livraison, c'est court.",
      ts,
    });
    expect(exchange.title).toBeNull();
  });

  it('rejette comme incomplet un flux coupé avant la fin', async () => {
    const interrupted = legacySse.slice(0, legacySse.lastIndexOf('data: {"message"'));
    expect(await parse(interrupted)).toEqual({ rejected: 'incomplet' });
  });

  it('rejette comme format un flux terminé sans message finished_successfully', async () => {
    const unfinished = legacySse.replace(
      '"status": "finished_successfully"',
      '"status": "stopped"',
    );
    expect(await parse(unfinished)).toEqual({ rejected: 'format' });
  });
});

describe('chatgptParser.parse, requêtes non captées', () => {
  it('renvoie null pour une régénération (variant, sans message utilisateur)', async () => {
    const body = withBody((b) => {
      b.action = 'variant';
      b.messages = [];
    });
    expect(await parse(deltaSse, body)).toBeNull();
  });

  it('renvoie null pour une régénération même si le flux est coupé', async () => {
    const body = withBody((b) => {
      b.action = 'variant';
      b.messages = [];
    });
    const cut = toSse([add(message('msg-a', 'in_progress'))]).replace('data: [DONE]\n\n', '');
    expect(await parse(cut, body)).toBeNull();
  });

  it('renvoie null pour un message utilisateur sans texte', async () => {
    const body = withBody((b) => {
      const [first] = b.messages as Array<{ content: { parts: unknown[] } }>;
      if (first) first.content.parts = [{ content_type: 'image_asset_pointer' }];
    });
    expect(await parse(deltaSse, body)).toBeNull();
  });

  it.each([
    ['illisible', '{pas du json'],
    ['absent', null],
    ['hors schéma', JSON.stringify({ messages: 'pas une liste' })],
  ])('rejette comme format un corps %s', async (_label, body) => {
    expect(await parse(deltaSse, body)).toEqual({ rejected: 'format' });
  });
});

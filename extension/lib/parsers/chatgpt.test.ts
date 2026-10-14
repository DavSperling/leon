import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chatgptParser } from './chatgpt';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const CONV = '6710a1b2-0000-4000-8000-00000000c0de';
const url = new URL('https://chatgpt.com/backend-api/f/conversation');
const now = new Date('2026-10-13T09:30:00.000Z');
const requestBody = fixture('chatgpt-request.json');
const deltaSse = fixture('chatgpt-delta.sse');
const legacySse = fixture('chatgpt-legacy.sse');

const withBody = (change: (body: Record<string, unknown>) => void) => {
  const body = JSON.parse(requestBody);
  change(body);
  return JSON.stringify(body);
};
const toSse = (ops: unknown[]) =>
  ops.map((op) => `event: delta\ndata: ${JSON.stringify(op)}\n\n`).join('');
// Petit flux au format v1 : un message assistant, des opérations, puis la fin.
const deltaStream = (...ops: unknown[]) =>
  toSse([
    { p: '', o: 'add', v: { message: assistantMessage('in_progress'), conversation_id: CONV } },
    ...ops,
    { p: '/message/status', o: 'replace', v: 'finished_successfully' },
  ]);
const assistantMessage = (status: string) => ({
  id: 'msg-a',
  author: { role: 'assistant' },
  content: { content_type: 'text', parts: [''] },
  status,
});

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

describe('chatgptParser.parse, format delta v1', () => {
  it("rend l'échange complet", async () => {
    const exchange = await chatgptParser.parse({ url, requestBody, sseText: deltaSse, now });
    expect(exchange).toEqual({
      site: 'chatgpt',
      conversationId: CONV,
      title: 'Délais du fournisseur Orion',
      user: {
        messageId: 'aaa1b2c3-0000-4000-8000-0000000000u1',
        text: 'Le fournisseur Orion livre en 10 jours.\nIl faut prévoir la marge.',
        ts: now.toISOString(),
      },
      assistant: {
        messageId: 'bbb4d5e6-0000-4000-8000-0000000000a1',
        text: "Dix jours de livraison, c'est court. Prévoyez une marge.",
        ts: now.toISOString(),
      },
    });
  });

  it('ne garde ni pièce jointe, ni système, ni outil, ni pensée', async () => {
    const exchange = await chatgptParser.parse({ url, requestBody, sseText: deltaSse, now });
    expect(JSON.stringify(exchange)).not.toMatch(
      /PIECE-JOINTE-7f3a|SYSTEME-CACHE|OUTIL-CACHE|PENSEE-CACHEE/,
    );
  });

  it("renvoie null pour un flux coupé après un message d'outil", async () => {
    const cut = deltaSse.slice(0, deltaSse.indexOf('"id": "bbb4d5e6'));
    expect(await chatgptParser.parse({ url, requestBody, sseText: cut, now })).toBeNull();
  });

  it.each([
    ['outil', { role: 'tool' }, { content_type: 'text', parts: ['OUTIL-CACHE'] }],
    ['système', { role: 'system' }, { content_type: 'text', parts: ['SYSTEME-CACHE'] }],
    ['pensée', { role: 'assistant' }, { content_type: 'thoughts', parts: ['PENSEE-CACHEE'] }],
  ])('ignore un message %s terminé après la réponse', async (_label, author, content) => {
    const later = { id: 'apres', author, content, status: 'finished_successfully' };
    const sseText = toSse([
      { p: '', o: 'add', v: { message: assistantMessage('in_progress'), conversation_id: CONV } },
      { p: '/message/content/parts/0', o: 'append', v: 'Réponse' },
      { p: '/message/status', o: 'replace', v: 'finished_successfully' },
      { p: '', o: 'add', v: { message: later, conversation_id: CONV } },
    ]);
    const exchange = await chatgptParser.parse({ url, requestBody, sseText, now });
    expect(exchange?.assistant).toEqual({
      messageId: 'msg-a',
      text: 'Réponse',
      ts: now.toISOString(),
    });
  });

  it('prend la conversation dans le flux quand le corps ne la porte pas', async () => {
    const body = withBody((b) => {
      delete b.conversation_id;
    });
    const exchange = await chatgptParser.parse({ url, requestBody: body, sseText: deltaSse, now });
    expect(exchange?.conversationId).toBe(CONV);
  });

  it('applique replace et add sur un chemin', async () => {
    const sseText = deltaStream(
      { p: '/message/content/parts/0', o: 'append', v: 'brouillon' },
      { p: '/message/content/parts/0', o: 'replace', v: 'Texte remplacé' },
      { p: '/message/content/parts/1', o: 'add', v: ' et ajouté' },
    );
    const exchange = await chatgptParser.parse({ url, requestBody, sseText, now });
    expect(exchange?.assistant.text).toBe('Texte remplacé\n et ajouté');
  });

  it("n'écrit jamais dans les prototypes", async () => {
    const sseText = deltaStream(
      { p: '/__proto__/pollue', o: 'replace', v: 'oui' },
      { p: '/message/__proto__', o: 'replace', v: { pollue: 'oui' } },
      { p: '/message/content/parts/0', o: 'append', v: 'Texte' },
    );
    const exchange = await chatgptParser.parse({ url, requestBody, sseText, now });
    expect(exchange?.assistant.text).toBe('Texte');
    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
  });

  it('renvoie null pour un flux interrompu', async () => {
    const interrupted = deltaSse.slice(
      0,
      deltaSse.indexOf('"o": "patch", "v": [{"p": "/message/content'),
    );
    expect(await chatgptParser.parse({ url, requestBody, sseText: interrupted, now })).toBeNull();
  });
});

describe('chatgptParser.parse, ancien format', () => {
  it('lit le dernier message complet', async () => {
    const exchange = await chatgptParser.parse({ url, requestBody, sseText: legacySse, now });
    expect(exchange?.assistant).toEqual({
      messageId: 'ccc7f8a9-0000-4000-8000-0000000000a2',
      text: "Dix jours de livraison, c'est court.",
      ts: now.toISOString(),
    });
    expect(exchange?.title).toBeNull();
  });

  it('renvoie null sans message finished_successfully', async () => {
    const interrupted = legacySse.slice(0, legacySse.lastIndexOf('data: {"message"'));
    expect(await chatgptParser.parse({ url, requestBody, sseText: interrupted, now })).toBeNull();
  });
});

describe('chatgptParser.parse, requêtes non captées', () => {
  it('renvoie null pour une régénération (variant, sans message utilisateur)', async () => {
    const body = withBody((b) => {
      b.action = 'variant';
      b.messages = [];
    });
    expect(
      await chatgptParser.parse({ url, requestBody: body, sseText: deltaSse, now }),
    ).toBeNull();
  });

  it('renvoie null pour un message utilisateur sans texte', async () => {
    const body = withBody((b) => {
      const [message] = b.messages as Array<{ content: { parts: unknown[] } }>;
      if (message) message.content.parts = [{ content_type: 'image_asset_pointer' }];
    });
    expect(
      await chatgptParser.parse({ url, requestBody: body, sseText: deltaSse, now }),
    ).toBeNull();
  });

  it.each([
    ['illisible', '{pas du json'],
    ['absent', null],
  ])('renvoie null pour un corps %s', async (_label, body) => {
    expect(
      await chatgptParser.parse({ url, requestBody: body, sseText: deltaSse, now }),
    ).toBeNull();
  });
});

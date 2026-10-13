import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveMessageId } from '../message-id';
import { claudeAiParser } from './claude-ai';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const CONV = '4b0e9a52-0000-4000-8000-00000000c0de';
const url = new URL(
  `https://claude.ai/api/organizations/org-1/chat_conversations/${CONV}/completion`,
);
const now = new Date('2026-10-13T09:30:00.000Z');
const requestBody = fixture('claude-ai-request.json');
const sseText = fixture('claude-ai-completion.sse');

describe('claudeAiParser.matchesRequest', () => {
  it('reconnaît la complétion en POST', () => {
    expect(claudeAiParser.matchesRequest(url, 'POST')).toBe(true);
  });

  it.each([
    ['GET', url.href],
    ['POST', url.href.replace('/completion', '/retry_completion')],
    ['POST', `https://claude.ai/api/organizations/org-1/chat_conversations/${CONV}`],
    ['POST', 'https://claude.ai/api/organizations/org-1/chat_conversations/x/completion/extra'],
  ])('refuse %s %s', (method, href) => {
    expect(claudeAiParser.matchesRequest(new URL(href), method)).toBe(false);
  });
});

describe('claudeAiParser.parse', () => {
  it("rend l'échange complet", async () => {
    const exchange = await claudeAiParser.parse({ url, requestBody, sseText, now });
    expect(exchange).toEqual({
      site: 'claude_ai',
      conversationId: CONV,
      title: null,
      user: {
        messageId: '7c1d2e3f-0000-4000-8000-00000000a002',
        text: 'Le client ACME veut passer le paiement à soixante jours. On accepte ?',
        ts: now.toISOString(),
      },
      assistant: {
        messageId: '7c1d2e3f-0000-4000-8000-00000000a003',
        text: 'Passer à soixante jours pèse sur votre trésorerie. Proposez quarante-cinq jours.',
        ts: now.toISOString(),
      },
    });
  });

  it('ne garde ni la pensée, ni les outils, ni la pièce jointe', async () => {
    const exchange = await claudeAiParser.parse({ url, requestBody, sseText, now });
    expect(JSON.stringify(exchange)).not.toMatch(/PENSEE-CACHEE|OUTIL-CACHE|PIECE-JOINTE-7f3a/);
  });

  it('ignore un text_delta posé sur un bloc thinking ou tool_use', async () => {
    const disguised = sseText
      .replaceAll('"type":"thinking_delta","thinking"', '"type":"text_delta","text"')
      .replaceAll('"type":"input_json_delta","partial_json"', '"type":"text_delta","text"');
    const exchange = await claudeAiParser.parse({ url, requestBody, sseText: disguised, now });
    expect(exchange?.assistant.text).toBe(
      'Passer à soixante jours pèse sur votre trésorerie. Proposez quarante-cinq jours.',
    );
  });

  it("dérive l'id utilisateur quand le corps n'en porte pas", async () => {
    const body = JSON.parse(requestBody);
    delete body.turn_message_uuids;
    const exchange = await claudeAiParser.parse({
      url,
      requestBody: JSON.stringify(body),
      sseText,
      now,
    });
    expect(exchange?.user.messageId).toBe(
      await deriveMessageId('u', [CONV, body.parent_message_uuid, body.prompt]),
    );
  });

  it("prend message.id quand message_start n'a pas d'uuid", async () => {
    const withoutUuid = sseText.replace('"uuid":"7c1d2e3f-0000-4000-8000-00000000a003",', '');
    const exchange = await claudeAiParser.parse({ url, requestBody, sseText: withoutUuid, now });
    expect(exchange?.assistant.messageId).toBe('chatcompl_01AbCdEf');
  });

  it('renvoie null pour un flux interrompu', async () => {
    const interrupted = fixture('claude-ai-interrompu.sse');
    expect(await claudeAiParser.parse({ url, requestBody, sseText: interrupted, now })).toBeNull();
  });

  it.each([
    ['sans prompt', JSON.stringify({ parent_message_uuid: 'p' })],
    ['illisible', '{pas du json'],
    ['absent', null],
  ])('renvoie null pour un corps %s', async (_label, body) => {
    expect(await claudeAiParser.parse({ url, requestBody: body, sseText, now })).toBeNull();
  });

  it('renvoie null sans texte de réponse', async () => {
    const empty = sseText.replaceAll('"type":"text_delta"', '"type":"citation_delta"');
    expect(await claudeAiParser.parse({ url, requestBody, sseText: empty, now })).toBeNull();
  });
});

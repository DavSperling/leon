import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError } from '../http';
import { normalizeItem } from '../normalize';
import type { SyncPage } from '../types';
import { parseBatch } from './client';
import { gmailConnector } from './connector';
import { parseAddress, textOf, threadsOf } from './map';
import type { GmailMessage } from './schemas';

const config = {
  authMode: 'pipedream',
  externalUserId: 'leon-u1',
  accountId: 'apn_abc123',
} as const;
const GMAIL = 'https://gmail.googleapis.com';
const LIST = `${GMAIL}/gmail/v1/users/me/messages`;
const BATCH = `${GMAIL}/batch/gmail/v1`;
const NOW = new Date('2026-10-25T14:00:00Z');
const SINCE = new Date('2026-10-20T00:00:00Z');
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

const b64 = (text: string) => Buffer.from(text).toString('base64url');

function message(
  id: string,
  threadId: string,
  input: {
    at: string;
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
    labels?: string[];
  },
): GmailMessage {
  const parts = [
    ...(input.text === undefined
      ? []
      : [{ mimeType: 'text/plain', body: { data: b64(input.text) } }]),
    ...(input.html === undefined
      ? []
      : [{ mimeType: 'text/html', body: { data: b64(input.html) } }]),
  ];
  return {
    id,
    threadId,
    labelIds: input.labels ?? ['INBOX'],
    internalDate: String(Date.parse(input.at)),
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'From', value: input.from ?? 'Julie Martin <julie@acme.test>' },
        { name: 'Subject', value: input.subject ?? 'Devis cuisine' },
      ],
      parts,
    },
  };
}

// Une réponse de lot comme Gmail la rend : une partie par lecture, dans l'ordre des Content-ID.
function batchRoute(answers: Array<{ status: number; json?: unknown }>): FakeRoute {
  const boundary = 'batch_reponse';
  const text = `${answers
    .map(
      (answer, index) =>
        `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <response-item${index}>\r\n\r\n` +
        `HTTP/1.1 ${answer.status} X\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${answer.json === undefined ? '' : JSON.stringify(answer.json)}\r\n`,
    )
    .join('')}--${boundary}--\r\n`;
  return {
    method: 'POST',
    url: BATCH,
    text,
    headers: { 'content-type': `multipart/mixed; boundary=${boundary}` },
  };
}

const listRoute = (ids: string[], nextPageToken?: string): FakeRoute => ({
  url: LIST,
  json: {
    messages: ids.map((id) => ({ id, threadId: `t-${id}` })),
    ...(nextPageToken ? { nextPageToken } : {}),
  },
});

async function runSync(routes: FakeRoute[], cursor: string | null = null) {
  const { http, calls } = testHttp(gmailConnector, config, routes);
  const pages = await collect(gmailConnector.sync(config, { cursor, since: SINCE }, http));
  return { pages, calls };
}

const cursorOf = (page: SyncPage | undefined) => JSON.parse(page?.cursor ?? 'null');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('gmailConnector : configuration', () => {
  it('n’accepte que la forme Pipedream', () => {
    const accepts = (value: unknown) => gmailConnector.configSchema.safeParse(value).success;
    expect(accepts(config)).toBe(true);
    expect(accepts({ ...config, authMode: 'oauth' })).toBe(false);
    expect(accepts({ ...config, accountId: 'pas-un-compte' })).toBe(false);
    expect(gmailConnector.secretFields).toEqual([]);
    expect(gmailConnector.hosts(config)).toEqual(['gmail.googleapis.com']);
    expect(gmailConnector.pipedream).toEqual({ app: 'gmail' });
    expect(gmailConnector.privateRaw).toBe(true);
  });

  it('vérifie par le profil : l’adresse, en minuscules pour la reconnaître', async () => {
    const { http } = testHttp(gmailConnector, config, [
      {
        url: `${GMAIL}/gmail/v1/users/me/profile`,
        json: { emailAddress: 'David@Acme.test', messagesTotal: 3 },
      },
    ]);
    expect(await gmailConnector.verify(config, http)).toEqual({
      account: 'David@Acme.test',
      accountKey: 'david@acme.test',
    });
  });
});

describe('gmail : lecture des messages', () => {
  it('prend le texte brut avant le HTML, et laisse les pièces jointes', () => {
    const both = message('m1', 't1', {
      at: NOW.toISOString(),
      text: 'Bonjour\r\nJulie',
      html: '<p>autre</p>',
    });
    expect(textOf(both.payload)).toBe('Bonjour\nJulie');
    const html = message('m2', 't1', {
      at: NOW.toISOString(),
      html: '<p>Bonjour <b>Julie</b></p>',
    });
    expect(textOf(html.payload)).toBe('Bonjour Julie');
    const attachment = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', filename: 'notes.txt', body: { data: b64('pièce jointe') } },
      ],
    };
    expect(textOf(attachment)).toBe('');
  });

  it('lit le jeu de caractères annoncé', () => {
    const latin1 = Buffer.from('Réunion à 14 h', 'latin1').toString('base64url');
    const part = {
      mimeType: 'text/plain',
      headers: [{ name: 'Content-Type', value: 'text/plain; charset="ISO-8859-1"' }],
      body: { data: latin1 },
    };
    expect(textOf(part)).toBe('Réunion à 14 h');

    // Gmail convertit en UTF-8 sans changer l'en-tête : le texte n'est pas relu en Windows-1252.
    const converted = {
      ...part,
      headers: [{ name: 'Content-Type', value: 'text/plain; charset="Windows-1252"' }],
      body: { data: Buffer.from('Cécile, compte clôturé').toString('base64url') },
    };
    expect(textOf(converted)).toBe('Cécile, compte clôturé');
  });

  it('sépare le nom et l’adresse de l’expéditeur', () => {
    expect(parseAddress('Julie Martin <julie@acme.test>')).toEqual({
      name: 'Julie Martin',
      email: 'julie@acme.test',
    });
    expect(parseAddress('"Martin, Julie" <julie@acme.test>')).toEqual({
      name: 'Martin, Julie',
      email: 'julie@acme.test',
    });
    expect(parseAddress('julie@acme.test')).toEqual({ name: null, email: 'julie@acme.test' });
    expect(parseAddress(null)).toEqual({ name: null, email: null });
  });

  it('regroupe par fil, dans l’ordre, sans brouillon, avec le côté de l’équipe pour un envoi', () => {
    const items = threadsOf([
      message('m3', 't1', {
        at: '2026-10-24T10:00:00Z',
        subject: 'RE: Devis cuisine',
        text: 'Merci',
        labels: ['SENT'],
      }),
      message('m1', 't1', {
        at: '2026-10-23T09:00:00Z',
        subject: 'Devis cuisine',
        text: 'Voici le devis',
      }),
      message('m2', 't2', { at: '2026-10-22T08:00:00Z', subject: 'Planning', text: 'Lundi ?' }),
      message('m4', 't2', { at: '2026-10-25T08:00:00Z', text: 'brouillon', labels: ['DRAFT'] }),
    ]);

    expect(items.map((item) => item.externalId)).toEqual(['thread:t2', 'thread:t1']);
    const devis = items[1];
    expect(devis?.title).toBe('Devis cuisine');
    expect(devis?.url).toBe('https://mail.google.com/mail/#all/t1');
    expect(devis?.turns.map((turn) => [turn.externalId, turn.side])).toEqual([
      ['message:m1', undefined],
      ['message:m3', 'team'],
    ]);
    expect(devis?.updatedAt).toBe('2026-10-24T10:00:00.000Z');
    for (const item of items) expect(normalizeItem(item, 'gmail')).not.toBeNull();
  });

  it('lit une réponse de lot, partie par partie', () => {
    const route = batchRoute([
      { status: 200, json: { id: 'a' } },
      { status: 429, json: { error: {} } },
    ]);
    expect(parseBatch(route.text ?? '', route.headers?.['content-type'] ?? null)).toEqual([
      { index: 0, status: 200, body: '{"id":"a"}' },
      { index: 1, status: 429, body: '{"error":{}}' },
    ]);
    expect(() => parseBatch('', 'application/json')).toThrow('Unexpected response');
  });
});

describe('gmailConnector : relevé', () => {
  const m = (id: string) =>
    message(id, `t-${id}`, { at: '2026-10-24T10:00:00Z', text: `texte ${id}` });

  it('ouvre une fenêtre, lit la liste par lots, puis ferme la fenêtre', async () => {
    const { pages, calls } = await runSync([
      listRoute(['m1', 'm2']),
      batchRoute([
        { status: 200, json: m('m1') },
        { status: 200, json: m('m2') },
      ]),
    ]);

    const q = new URL(calls[0]?.url ?? '').searchParams.get('q');
    expect(q).toBe(
      `after:${seconds(SINCE) - 3600} before:${seconds(NOW)} -in:chats -in:drafts -category:promotions -category:social`,
    );
    expect(calls[1]?.headers['content-type']).toMatch(
      /^multipart\/mixed; boundary=leon_[0-9a-f]+$/,
    );
    expect(calls[1]?.body).toContain('GET /gmail/v1/users/me/messages/m1?format=full');
    expect(pages.map((page) => page.items.length)).toEqual([2, 0]);
    expect(cursorOf(pages[0])).toEqual({
      done: seconds(SINCE),
      window: { before: seconds(NOW), pageToken: null, skip: 2 },
    });
    expect(cursorOf(pages[1])).toEqual({ done: seconds(NOW), window: null });
  });

  it('ne coûte qu’une requête quand rien n’est arrivé', async () => {
    const { pages, calls } = await runSync([{ url: LIST, json: { resultSizeEstimate: 0 } }]);
    expect(calls).toHaveLength(1);
    expect(pages).toEqual([
      { items: [], cursor: JSON.stringify({ done: seconds(NOW), window: null }) },
    ]);
  });

  it('lit par lots de 20 et passe à la page suivante', async () => {
    const ids = Array.from({ length: 25 }, (_, index) => `m${index}`);
    const { pages, calls } = await runSync([
      listRoute(ids, 'p2'),
      batchRoute(ids.slice(0, 20).map((id) => ({ status: 200, json: m(id) }))),
      batchRoute(ids.slice(20).map((id) => ({ status: 200, json: m(id) }))),
      listRoute([]),
    ]);

    expect(pages.map((page) => page.items.length)).toEqual([20, 5, 0]);
    expect(new URL(calls[3]?.url ?? '').searchParams.get('pageToken')).toBe('p2');
  });

  it('reprend la fenêtre au même endroit', async () => {
    const window = { before: seconds(NOW) - 600, pageToken: 'p2', skip: 1 };
    const cursor = JSON.stringify({ done: seconds(SINCE), window });
    const { pages, calls } = await runSync(
      [listRoute(['m1', 'm2']), batchRoute([{ status: 200, json: m('m2') }])],
      cursor,
    );

    const url = new URL(calls[0]?.url ?? '');
    expect(url.searchParams.get('pageToken')).toBe('p2');
    expect(url.searchParams.get('q')).toContain(`before:${window.before}`);
    expect(calls[1]?.body).not.toContain('messages/m1?');
    expect(cursorOf(pages.at(-1))).toEqual({ done: window.before, window: null });
  });

  it('repart de la première page quand Gmail ne reconnaît plus la page gardée', async () => {
    const cursor = JSON.stringify({
      done: seconds(SINCE),
      window: { before: seconds(NOW), pageToken: 'vieille', skip: 0 },
    });
    const { calls } = await runSync([{ url: LIST, status: 400 }, listRoute([])], cursor);

    expect(new URL(calls[1]?.url ?? '').searchParams.get('pageToken')).toBeNull();

    // Une seule fois par passage : un 400 qui revient fait échouer le passage au lieu de boucler.
    const again = runSync(
      [{ url: LIST, status: 400 }, listRoute([], 'p2'), { url: LIST, status: 400 }],
      cursor,
    );
    await expect(again).rejects.toMatchObject({ status: 400 });
  });

  it('redemande une lecture refusée par un 403 de limite, sans y voir un accès retiré', async () => {
    const limited = { error: { errors: [{ reason: 'rateLimitExceeded' }] } };
    const { pages } = await runSync([
      listRoute(['m1']),
      batchRoute([{ status: 403, json: limited }]),
      batchRoute([{ status: 200, json: m('m1') }]),
    ]);
    expect(pages[0]?.items).toHaveLength(1);
  });

  it('coupe en deux un lot trop gros, et laisse un courrier trop gros à lui seul', async () => {
    const tooBig = (route: FakeRoute): FakeRoute => ({
      ...route,
      headers: { ...route.headers, 'content-length': String(11 * 1024 * 1024) },
    });
    const { pages, calls } = await runSync([
      listRoute(['m1', 'm2']),
      tooBig(batchRoute([])),
      batchRoute([{ status: 200, json: m('m1') }]),
      tooBig(batchRoute([])),
    ]);
    expect(pages[0]?.items.map((item) => item.externalId)).toEqual(['thread:t-m1']);
    expect(calls[2]?.body).not.toContain('messages/m2?');
    expect(calls[3]?.body).toContain('messages/m2?');
  });

  it('redemande les lectures refusées pour la limite, puis abandonne au troisième refus', async () => {
    const retried = await runSync([
      listRoute(['m1', 'm2']),
      batchRoute([{ status: 200, json: m('m1') }, { status: 429 }]),
      batchRoute([{ status: 200, json: m('m2') }]),
    ]);
    expect(retried.pages[0]?.items).toHaveLength(2);
    expect(retried.calls[2]?.body).toContain('messages/m2?');
    expect(retried.calls[2]?.body).not.toContain('messages/m1?');

    const refused = runSync([
      listRoute(['m1']),
      batchRoute([{ status: 429 }]),
      batchRoute([{ status: 503 }]),
      batchRoute([{ status: 429 }]),
    ]);
    await expect(refused).rejects.toMatchObject({
      status: 429,
      message: 'Gmail rate limit reached',
    });
  });

  it('laisse un message supprimé entre la liste et la lecture, refuse un accès retiré', async () => {
    const { pages } = await runSync([
      listRoute(['m1', 'm2']),
      batchRoute([{ status: 404 }, { status: 200, json: m('m2') }]),
    ]);
    expect(pages[0]?.items.map((item) => item.externalId)).toEqual(['thread:t-m2']);

    const revoked = runSync([listRoute(['m1']), batchRoute([{ status: 401 }])]);
    await expect(revoked).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('repart de `since` sur un curseur illisible', async () => {
    const { calls } = await runSync([listRoute([])], '{pas du json');
    expect(new URL(calls[0]?.url ?? '').searchParams.get('q')).toContain(
      `after:${seconds(SINCE) - 3600}`,
    );
  });
});

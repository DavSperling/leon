import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, type FakeRoute, testHttp } from '@/test/fake-fetch';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import { normalizeItem } from '../normalize';
import type { SyncPage } from '../types';
import { gmailClient, parseBatch } from './client';
import { gmailConnector } from './connector';
import { parseAddress, parseAddressList, textOf, threadsOf } from './map';
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
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    text?: string;
    html?: string;
    labels?: string[];
    // D'autres en-têtes, tels quels.
    headers?: Array<{ name: string; value: string }>;
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
        ...(input.to === undefined ? [] : [{ name: 'To', value: input.to }]),
        ...(input.cc === undefined ? [] : [{ name: 'Cc', value: input.cc }]),
        ...(input.bcc === undefined ? [] : [{ name: 'Bcc', value: input.bcc }]),
        { name: 'Subject', value: input.subject ?? 'Devis cuisine' },
        ...(input.headers ?? []),
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
  it('se branche par notre appli Google (tout le courrier et ses réglages de base), ou encore par Pipedream', () => {
    const accepts = (value: unknown) => gmailConnector.configSchema.safeParse(value).success;
    expect(accepts(config)).toBe(true);
    expect(accepts({ authMode: 'oauth', accessToken: 'jeton' })).toBe(true);
    expect(accepts({ ...config, authMode: 'oauth' })).toBe(false);
    expect(accepts({ ...config, accountId: 'pas-un-compte' })).toBe(false);
    expect(gmailConnector.secretFields).toEqual([]);
    expect(gmailConnector.hosts(config)).toEqual(['gmail.googleapis.com']);
    expect(gmailConnector.oauth).toMatchObject({
      appKey: 'GOOGLE',
      scopes: ['https://mail.google.com/', 'https://www.googleapis.com/auth/gmail.settings.basic'],
    });
    expect(gmailConnector.pipedream).toEqual({ app: 'gmail' });
    expect(gmailConnector.privateRaw).toBe(true);
  });

  it('par notre appli, présente le jeton à Gmail', async () => {
    const oauth = { authMode: 'oauth', accessToken: 'jeton-essai' } as const;
    const { http, calls } = testHttp(gmailConnector, oauth, [
      { url: `${GMAIL}/gmail/v1/users/me/profile`, json: { emailAddress: 'david@acme.test' } },
    ]);
    expect(await gmailConnector.verify(oauth, http)).toEqual({
      account: 'david@acme.test',
      accountKey: 'david@acme.test',
    });
    expect(calls[0]?.headers.authorization).toBe('Bearer jeton-essai');
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

  it('lit les adresses d’un en-tête de destinataires, sans les noms', () => {
    expect(
      parseAddressList('Julie Martin <julie@acme.test>, paul@client.test, <zoe@acme.test>'),
    ).toEqual(['julie@acme.test', 'paul@client.test', 'zoe@acme.test']);
    expect(parseAddressList('julie@acme.test')).toEqual(['julie@acme.test']);
    // La casse et les doublons restent tels quels : la normalisation s'en charge.
    expect(parseAddressList('Julie <Julie@Acme.test>, julie@acme.test')).toEqual([
      'Julie@Acme.test',
      'julie@acme.test',
    ]);
  });

  it('ne coupe pas à la virgule d’un nom entre guillemets ni d’un commentaire', () => {
    expect(
      parseAddressList(
        '"Martin, Julie" <julie@acme.test>, "Paul \\"le chef\\", Lambert" <paul@client.test>',
      ),
    ).toEqual(['julie@acme.test', 'paul@client.test']);
    expect(parseAddressList('julie@acme.test (Martin, Julie), paul@client.test')).toEqual([
      'julie@acme.test',
      'paul@client.test',
    ]);
    // Un nom entre guillemets qui ressemble à une adresse n'en est pas une.
    expect(parseAddressList('"faux@nom.test" <julie@acme.test>')).toEqual(['julie@acme.test']);
  });

  it('garde les adresses qui suivent un guillemet ou une parenthèse jamais fermés', () => {
    for (const header of [
      'Julie :( <julie@acme.test>, paul@client.test',
      'Julie "Juju <julie@acme.test>, paul@client.test',
      'Écran 15" <julie@acme.test>, paul@client.test',
    ]) {
      expect(parseAddressList(header)).toEqual(['julie@acme.test', 'paul@client.test']);
    }
  });

  it('lit les adresses d’un groupe, et rien d’un groupe vide', () => {
    expect(
      parseAddressList('Équipe projet: Julie <julie@acme.test>, paul@client.test;, zoe@acme.test'),
    ).toEqual(['julie@acme.test', 'paul@client.test', 'zoe@acme.test']);
    expect(parseAddressList('Équipe: julie@acme.test;')).toEqual(['julie@acme.test']);
    expect(parseAddressList('undisclosed-recipients:;')).toEqual([]);
  });

  it('ne rend aucune adresse pour un en-tête absent, vide ou sans adresse', () => {
    expect(parseAddressList(null)).toEqual([]);
    expect(parseAddressList('')).toEqual([]);
    expect(parseAddressList(' , ;')).toEqual([]);
    expect(parseAddressList('Julie Martin')).toEqual([]);
  });

  it('reste rapide sur un en-tête de destinataires piégé', () => {
    const started = Date.now();
    for (const piece of ['"', '\\"', '(', '<', ':', ' ', ',']) {
      expect(parseAddressList(piece.repeat(200_000))).toEqual([]);
    }
    expect(Date.now() - started).toBeLessThan(1000);
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

  it('rend les destinataires « à » et « copie » d’un message reçu ou envoyé, jamais la copie cachée', () => {
    const [item] = threadsOf([
      message('m1', 't1', {
        at: '2026-10-23T09:00:00Z',
        to: 'David Morel <David@Acme.test>, "Lambert, Paul" <paul@client.test>',
        cc: 'zoe@acme.test, david@acme.test',
        text: 'Voici le devis',
      }),
      message('m2', 't1', {
        at: '2026-10-24T10:00:00Z',
        from: 'David Morel <david@acme.test>',
        to: 'Julie Martin <julie@acme.test>',
        bcc: 'archive@acme.test',
        text: 'Merci',
        labels: ['SENT'],
      }),
      message('m3', 't1', { at: '2026-10-25T08:00:00Z', text: 'Sans destinataire lisible' }),
    ]);

    expect(item?.turns.map((turn) => turn.recipients)).toEqual([
      { to: ['David@Acme.test', 'paul@client.test'], cc: ['zoe@acme.test', 'david@acme.test'] },
      { to: ['julie@acme.test'], cc: [] },
      { to: [], cc: [] },
    ]);
    // La normalisation met les adresses en minuscules ; la même adresse reste dans chaque liste où elle figure.
    const normalized = item && normalizeItem(item, 'gmail');
    expect(normalized?.turns.map((turn) => [turn.recipientsTo, turn.recipientsCc])).toEqual([
      [
        ['david@acme.test', 'paul@client.test'],
        ['zoe@acme.test', 'david@acme.test'],
      ],
      [['julie@acme.test'], []],
      [[], []],
    ]);
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

describe('gmail : un message reçu envoyé par une machine ou en nombre', () => {
  // Un message reçu, relu comme la relève le lit : le fait gardé sur son tour, une fois normalisé.
  const automated = (input: Partial<Parameters<typeof message>[2]>) => {
    const [item] = threadsOf([
      message('m1', 't1', { at: '2026-10-23T09:00:00Z', text: 'Bonjour Julie.', ...input }),
    ]);
    return item && normalizeItem(item, 'gmail')?.turns[0]?.automated;
  };
  const header = (name: string, value: string) => ({ headers: [{ name, value }] });

  it('le mail d’une personne : pas automatique', () => {
    expect(automated({ from: 'Inès Garnier <ines@inconnue.test>' })).toBe(false);
    // Une adresse qui ne fait que contenir un mot de machine, une réponse automatique dite « no », un envoi d'une
    // autre priorité, l'onglet Principale.
    expect(automated({ from: 'julie.notifications@acme.test' })).toBe(false);
    expect(automated({ from: 'nora.reply@acme.test' })).toBe(false);
    expect(automated(header('Auto-Submitted', 'no'))).toBe(false);
    expect(automated(header('Precedence', 'first-class'))).toBe(false);
    expect(automated({ labels: ['INBOX', 'CATEGORY_PERSONAL'] })).toBe(false);
  });

  it.each([
    ['une désinscription', header('List-Unsubscribe', '<mailto:desinscription@lettre.test>')],
    ['une liste de diffusion', header('List-Id', 'Nouvelles <nouvelles.lettre.test>')],
    ['une réponse automatique', header('Auto-Submitted', 'auto-replied')],
    ['un envoi généré', header('Auto-Submitted', 'auto-generated')],
    ['un envoi en nombre', header('Precedence', 'bulk')],
    ['un envoi à une liste', header('Precedence', 'list')],
    ['un envoi indésirable', header('Precedence', 'junk')],
    ['l’onglet Notifications', { labels: ['INBOX', 'CATEGORY_UPDATES'] }],
    ['l’onglet Forums', { labels: ['INBOX', 'CATEGORY_FORUMS'] }],
    ['une adresse « no-reply »', { from: 'Banque <no-reply@banque.test>' }],
    ['une adresse « noreply »', { from: 'noreply@service.test' }],
    ['une adresse « do-not-reply »', { from: 'do-not-reply@service.test' }],
    ['une adresse « donotreply »', { from: 'Service <donotreply@service.test>' }],
    ['une adresse « mailer-daemon »', { from: 'Mail Delivery <mailer-daemon@service.test>' }],
    ['une adresse « postmaster »', { from: 'postmaster@service.test' }],
    ['une adresse « notifications »', { from: 'GitHub <notifications@github.test>' }],
    ['une adresse « …-noreply »', { from: 'Docs <comments-noreply@docs.google.test>' }],
    ['une adresse « no_reply »', { from: 'Reçus <no_reply@email.apple.test>' }],
    ['une adresse « ne-pas-repondre »', { from: 'Impôts <ne-pas-repondre@impots.test>' }],
  ])('%s : automatique', (_, input) => {
    expect(automated(input)).toBe(true);
  });

  it('lit les en-têtes et leurs valeurs quelle que soit leur casse, et l’adresse de même', () => {
    expect(automated(header('LIST-UNSUBSCRIBE', '<https://lettre.test/stop>'))).toBe(true);
    expect(automated(header('list-id', 'nouvelles.lettre.test'))).toBe(true);
    expect(automated(header('auto-submitted', ' Auto-Notified '))).toBe(true);
    expect(automated(header('AUTO-SUBMITTED', 'No'))).toBe(false);
    expect(automated(header('precedence', 'BULK'))).toBe(true);
    expect(automated({ from: 'NoReply@Service.test' })).toBe(true);
  });

  it('un mail qu’elle a envoyé : on ne sait pas, même avec un signal de machine', () => {
    for (const input of [
      { labels: ['SENT'] },
      { labels: ['SENT'], ...header('List-Unsubscribe', '<mailto:stop@lettre.test>') },
      { labels: ['SENT', 'CATEGORY_UPDATES'], from: 'noreply@acme.test' },
    ])
      expect(automated(input)).toBeNull();
  });

  it('aucun en-tête n’est gardé : le tour ne porte que ce fait', () => {
    const [item] = threadsOf([
      message('m1', 't1', {
        at: '2026-10-23T09:00:00Z',
        text: 'Nos nouveautés.',
        ...header('List-Unsubscribe', '<https://lettre.test/stop?id=julie>'),
      }),
    ]);
    const turn = item?.turns[0];

    expect(turn?.automated).toBe(true);
    expect(JSON.stringify(item)).not.toContain('lettre.test');
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

// La seule écriture de Leon dans une boîte : un brouillon de réponse, en deux requêtes, chacune payée (un crédit
// Pipedream) et jamais rejouée.
describe('gmailClient : un brouillon de réponse dans un fil', () => {
  const DRAFTS = `${GMAIL}/gmail/v1/users/me/drafts`;
  const THREADS = `${GMAIL}/gmail/v1/users/me/threads`;
  // Un message d'un fil lu avec format=metadata : ses libellés, sa date, ses en-têtes.
  const inThread = (id: string, at: string, labels?: string[]) => ({
    id,
    threadId: 't/1',
    labelIds: labels,
    internalDate: String(Date.parse(`2026-11-20T${at}:00Z`)),
    payload: {
      headers: [
        { name: 'Message-Id', value: `<${id}@mail.client.test>` },
        { name: 'SUBJECT', value: 'Devis cuisine' },
      ],
    },
  });

  it('lit le fil sans les corps et rend les trois en-têtes du message reçu, quelle que soit leur casse', async () => {
    const { http, calls } = testHttp(gmailConnector, config, [
      {
        url: `${THREADS}/t%2F1`,
        json: {
          id: 't/1',
          // Sa réponse d'avant, le message reçu (archivé : sans libellé), puis un brouillon : le fil attend toujours.
          messages: [
            inThread('m0', '09:00', ['SENT']),
            inThread('m1', '10:00'),
            inThread('m2', '11:00', ['DRAFT']),
          ],
        },
      },
    ]);

    expect(await gmailClient(http).replyHeaders('t/1', 'm1')).toEqual({
      messageId: '<m1@mail.client.test>',
      references: null,
      subject: 'Devis cuisine',
      elsewhere: false,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? '');
    expect(calls[0]?.method).toBe('GET');
    expect(url.pathname).toBe('/gmail/v1/users/me/threads/t%2F1');
    expect([...url.searchParams]).toEqual([
      ['format', 'metadata'],
      ['metadataHeaders', 'Message-ID'],
      ['metadataHeaders', 'References'],
      ['metadataHeaders', 'Subject'],
      ['metadataHeaders', 'From'],
      ['metadataHeaders', 'Reply-To'],
    ]);
  });

  it.each([
    ['sans adresse de réponse', undefined, false],
    ['la même adresse, dans une autre casse', 'Léa Roy <LEA@client.test>', false],
    ['une autre adresse (un formulaire de contact)', 'jean@prospect.test', true],
    ['plusieurs, dont une autre', 'lea@client.test, assistante@client.test', true],
  ])(
    'le message demande-t-il de répondre ailleurs qu’à son expéditeur ? %s',
    async (_, replyTo, elsewhere) => {
      const headers = [
        { name: 'Message-ID', value: '<m1@mail.client.test>' },
        { name: 'From', value: 'Léa Roy <lea@client.test>' },
        ...(replyTo ? [{ name: 'Reply-To', value: replyTo }] : []),
      ];
      const { http } = testHttp(gmailConnector, config, [
        {
          url: `${THREADS}/t1`,
          json: { id: 't1', messages: [{ id: 'm1', threadId: 't1', payload: { headers } }] },
        },
      ]);

      expect(await gmailClient(http).replyHeaders('t1', 'm1')).toMatchObject({ elsewhere });
    },
  );

  it.each([
    [
      'elle a déjà répondu depuis Gmail',
      [inThread('m1', '10:00'), inThread('m2', '10:30', ['SENT'])],
    ],
    ['on lui a récrit depuis', [inThread('m1', '10:00'), inThread('m2', '10:30', ['INBOX'])]],
    ['elle a mis le mail à la corbeille', [inThread('m1', '10:00', ['TRASH'])]],
    ['elle l’a classé en indésirable', [inThread('m1', '10:00', ['SPAM'])]],
    ['le message n’est plus dans le fil', [inThread('m0', '09:00', ['INBOX'])]],
    ['le fil est vide', undefined],
  ])('le fil n’attend plus sa réponse (%s) : rien à quoi répondre', async (_, messages) => {
    const { http } = testHttp(gmailConnector, config, [
      { url: `${THREADS}/t1`, json: { id: 't1', messages } },
    ]);

    expect(await gmailClient(http).replyHeaders('t1', 'm1')).toBeNull();
  });

  it('ne lit pas la date des messages : leur ordre dans le fil suffit', async () => {
    // Ce que la documentation promet avec format=metadata : identifiants, libellés, en-têtes.
    const bare = (id: string, labels?: string[]) => ({
      id,
      threadId: 't1',
      labelIds: labels,
      payload: { headers: [{ name: 'Message-ID', value: `<${id}@mail.client.test>` }] },
    });
    const waiting = testHttp(gmailConnector, config, [
      { url: `${THREADS}/t1`, json: { id: 't1', messages: [bare('m0', ['SENT']), bare('m1')] } },
    ]);
    const answered = testHttp(gmailConnector, config, [
      { url: `${THREADS}/t1`, json: { id: 't1', messages: [bare('m1'), bare('m2', ['SENT'])] } },
    ]);

    expect(await gmailClient(waiting.http).replyHeaders('t1', 'm1')).toMatchObject({
      messageId: '<m1@mail.client.test>',
    });
    expect(await gmailClient(answered.http).replyHeaders('t1', 'm1')).toBeNull();
  });

  it('crée le brouillon dans le fil et rend son identifiant', async () => {
    const { http, calls } = testHttp(gmailConnector, config, [
      {
        method: 'POST',
        url: DRAFTS,
        json: { id: 'r-1', message: { id: 'm9', threadId: 't1', labelIds: ['DRAFT'] } },
      },
    ]);

    expect(await gmailClient(http).createDraft('t1', 'VG86IGxlYQ')).toBe('r-1');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: DRAFTS,
      body: { message: { threadId: 't1', raw: 'VG86IGxlYQ' } },
    });
    expect(calls[0]?.headers['content-type']).toBe('application/json');
  });

  it('envoie le brouillon déposé par son identifiant, une fois ; un refus lève sans être rejoué', async () => {
    const { http, calls } = testHttp(gmailConnector, config, [
      { method: 'POST', url: `${DRAFTS}/send`, json: { id: 'm10', threadId: 't1' } },
      { method: 'POST', url: `${DRAFTS}/send`, status: 404 },
    ]);
    const client = gmailClient(http);

    await expect(client.sendDraft('r-1')).resolves.toBeUndefined();
    await expect(client.sendDraft('r-parti')).rejects.toBeInstanceOf(Error);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: 'POST', url: `${DRAFTS}/send`, body: { id: 'r-1' } });
  });

  it('supprime le brouillon déposé, une fois ; un brouillon qui n’y est plus ne lève pas', async () => {
    const { http, calls } = testHttp(gmailConnector, config, [
      { method: 'DELETE', url: `${DRAFTS}/r%2F1`, json: {} },
      { method: 'DELETE', url: `${DRAFTS}/r-parti`, status: 404 },
    ]);
    const client = gmailClient(http);

    await expect(client.deleteDraft('r/1')).resolves.toBeUndefined();
    await expect(client.deleteDraft('r-parti')).resolves.toBeUndefined();

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ['DELETE', `${DRAFTS}/r%2F1`],
      ['DELETE', `${DRAFTS}/r-parti`],
    ]);
    expect(calls[0]?.body).toBeUndefined();
  });

  it.each([403, 429, 500])(
    'une suppression refusée (%s) lève, sans être rejouée',
    async (status) => {
      const { http, calls } = testHttp(gmailConnector, config, [
        { method: 'DELETE', url: `${DRAFTS}/r-1`, status },
      ]);

      // Un accès retiré (403) lève une erreur d'accès, les autres une erreur HTTP.
      await expect(gmailClient(http).deleteDraft('r-1')).rejects.toBeInstanceOf(Error);

      expect(calls).toHaveLength(1);
    },
  );

  it.each([429, 500, 503])('ne rejoue ni la lecture ni la création après un %s', async (status) => {
    const { http, calls } = testHttp(gmailConnector, config, [
      { url: `${THREADS}/t1`, status },
      { method: 'POST', url: DRAFTS, status },
    ]);
    const client = gmailClient(http);

    await expect(client.replyHeaders('t1', 'm1')).rejects.toBeInstanceOf(ConnectorHttpError);
    await expect(client.createDraft('t1', 'VG86IGxlYQ')).rejects.toBeInstanceOf(ConnectorHttpError);

    expect(calls.map((call) => call.method)).toEqual(['GET', 'POST']);
  });

  it('un fil supprimé, un accès retiré ou une réponse sans identifiant de brouillon lèvent', async () => {
    const { http } = testHttp(gmailConnector, config, [
      { url: `${THREADS}/t1`, status: 404 },
      { url: `${THREADS}/t1`, status: 403 },
      { method: 'POST', url: DRAFTS, json: { message: { id: 'm9' } } },
    ]);
    const client = gmailClient(http);

    await expect(client.replyHeaders('t1', 'm1')).rejects.toMatchObject({ status: 404 });
    await expect(client.replyHeaders('t1', 'm1')).rejects.toBeInstanceOf(ConnectorAuthError);
    await expect(client.createDraft('t1', 'VG86IGxlYQ')).rejects.toMatchObject({
      message: 'Unexpected response',
    });
  });
});

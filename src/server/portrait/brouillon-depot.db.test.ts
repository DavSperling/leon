import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { createConnection } from '@/server/connectors/connections';
import { forgetPipedreamToken, PIPEDREAM_SECRET_FIELDS } from '@/server/connectors/pipedream';
import { brouillons } from '@/server/db/schema/portrait';
import { adminDb, adminPool } from '@/test/db';
import { type FakeCall, type FakeRoute, fakeFetch } from '@/test/fake-fetch';
import { createTestTenant } from '@/test/fixtures';
import { LEA, mailThread, received } from '@/test/mail-threads';
import { depositBrouillon, withdrawBrouillon } from './brouillon-depot';

vi.mock('@/server/pipeline/queue');

// Le dépôt d'un brouillon dans les brouillons Gmail de la personne, sous ses droits, par le proxy de Pipedream : un
// faux fetch tient lieu de Pipedream et de Gmail, aucune requête ne sort. Données inventées : Julie et Paul dans une
// organisation, Léa leur cliente, des adresses en .test qui n'existent pas.

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms);
const COMPLET = 'Bonjour Léa,\n\nVoici le devis, à jour 🎉.\n\nBien à vous';
const A_TROU = 'Bonjour Léa,\n\nVoici le devis [à compléter : le montant].\n\nBien à vous';
const CONNECT = 'https://api.pipedream.com/v1/connect/proj_essai';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const READ =
  '?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject';

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});
beforeEach(() => {
  forgetPipedreamToken();
  vi.stubEnv('PIPEDREAM_PROJECT_ID', 'proj_essai');
  vi.stubEnv('PIPEDREAM_CLIENT_ID', 'client-essai');
  vi.stubEnv('PIPEDREAM_CLIENT_SECRET', 'secret-essai-pipedream');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function team(): Promise<[TenantContext, TenantContext]> {
  const { tenantId, members } = await createTestTenant(['Julie Martin', 'Paul Durand']);
  tenantIds.push(tenantId);
  return members as [TenantContext, TenantContext];
}

// Sa boîte Gmail, branchée par elle par Pipedream.
const gmailOf = (ctx: TenantContext) =>
  createConnection(ctx, {
    provider: 'gmail',
    label: 'boite@acme.test',
    config: { authMode: 'pipedream', externalUserId: 'leon-essai', accountId: 'apn_gm1' },
    secretFields: PIPEDREAM_SECRET_FIELDS,
    since: ago(30 * 24 * HOUR),
  });

// Un mail de Léa qui attend dans un fil relevé par la boîte de `owner`, et le brouillon écrit pour `ctx`, qui a dit
// oui à l'agent.
async function drafted(
  ctx: TenantContext,
  texte: string,
  thread: Parameters<typeof mailThread>[3] & { owner?: TenantContext } = {},
): Promise<{ id: string; thread: string }> {
  const { owner = ctx, ...options } = thread;
  const mail = received(ago(HOUR), 'Bonjour Julie, et le devis ?', {
    externalId: 'message:m-devis',
  });
  const sourceId = await mailThread(owner, 'Devis 2027', [mail], options);
  await adminPool.query(
    `insert into reponses_agent (tenant_id, user_id, agent, oui, acl)
     values ($1, $2, 'brouillon-reponse', true, array[$2::uuid]) on conflict do nothing`,
    [ctx.tenantId, ctx.userId],
  );
  const { rows } = await adminPool.query<{ id: string; thread: string }>(
    `insert into brouillons (tenant_id, user_id, source_id, message, texte, acl)
     values ($1, $2, $3, 'message:m-devis', $4, array[$2::uuid])
     returning id, (select external_id from sources where id = $3) as thread`,
    [ctx.tenantId, ctx.userId, sourceId, texte],
  );
  if (!rows[0]) throw new Error('brouillon de test non créé');
  return rows[0];
}

const stored = async (id: string) =>
  (await adminDb.select().from(brouillons).where(eq(brouillons.id, id)))[0];

// Le proxy reçoit l'adresse entière en base64url : seuls les groupes de 3 caractères du début donnent le même début
// d'encodage, avec ou sans chaîne de requête (comme sync.db.test.ts).
const proxied = (url: string) => {
  const head = Buffer.from(url.slice(0, url.length - (url.length % 3))).toString('base64url');
  return new RegExp(`^${CONNECT}/proxy/${head}`);
};
// L'adresse de Gmail qu'une requête au proxy demande.
const target = (call: FakeCall | undefined) =>
  Buffer.from(
    new URL(call?.url ?? CONNECT).pathname.split('/proxy/')[1] ?? '',
    'base64url',
  ).toString();
const TOKEN: FakeRoute = {
  method: 'POST',
  url: 'https://api.pipedream.com/v1/oauth/token',
  json: { access_token: 'pd' },
};
const HEADERS = [
  { name: 'Message-ID', value: '<m-devis@mail.client.test>' },
  { name: 'References', value: '<m-avant@acme.test>' },
  { name: 'Subject', value: 'Devis été 2027' },
];
// Un message du fil tel que Gmail le rend avec format=metadata, `minutes` après le message reçu.
const inThread = (id: string, minutes: number, labels: string[], headers = HEADERS) => ({
  id,
  threadId: 't',
  labelIds: labels,
  internalDate: String(Date.parse('2026-11-20T10:00:00Z') + minutes * 60_000),
  payload: { headers },
});
const RECEIVED = inThread('m-devis', 0, ['INBOX']);
// La lecture du fil : sans autre précision, le message reçu y est le dernier.
const readRoute = (over: Partial<FakeRoute> = {}): FakeRoute => ({
  url: proxied(`${GMAIL}/threads/`),
  json: { id: 't', messages: [RECEIVED] },
  ...over,
});
const createRoute = (over: Partial<FakeRoute> = {}): FakeRoute => ({
  method: 'POST',
  url: proxied(`${GMAIL}/drafts`),
  json: { id: 'r-1', message: { id: 'm-brouillon', threadId: 't', labelIds: ['DRAFT'] } },
  ...over,
});

describe('depositBrouillon : un brouillon complet va dans ses brouillons Gmail', () => {
  it('lit le fil chez Gmail, y crée le brouillon en réponse au message reçu, et garde son identifiant', async () => {
    const [julie] = await team();
    const { id, thread } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
    const fetchImpl = fakeFetch([TOKEN, readRoute(), createRoute()]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl })).toBe(true);

    // Le jeton de Pipedream, puis deux requêtes par son proxy, avec le compte qu'elle a branché.
    const [, read, create] = fetchImpl.calls;
    expect(fetchImpl.calls).toHaveLength(3);
    expect(read?.method).toBe('GET');
    expect(target(read)).toBe(`${GMAIL}/threads/${thread.slice('thread:'.length)}${READ}`);
    expect(create?.method).toBe('POST');
    expect(target(create)).toBe(`${GMAIL}/drafts`);
    for (const call of [read, create]) {
      const query = new URL(call?.url ?? CONNECT).searchParams;
      expect(query.get('account_id')).toBe('apn_gm1');
      expect(query.get('external_user_id')).toBe('leon-essai');
      expect(call?.headers.authorization).toBe('Bearer pd');
    }
    expect(create?.headers['content-type']).toBe('application/json');

    // Le corps : le fil de la source, et le message de la réponse.
    const body = create?.body as { message: { threadId: string; raw: string } };
    expect(Object.keys(body)).toEqual(['message']);
    expect(Object.keys(body.message).sort()).toEqual(['raw', 'threadId']);
    expect(`thread:${body.message.threadId}`).toBe(thread);
    const message = Buffer.from(body.message.raw, 'base64url').toString('utf8');
    const cut = message.indexOf('\r\n\r\n');
    expect(message.slice(0, cut).split('\r\n')).toEqual([
      'To: lea@client.test',
      `Subject: =?UTF-8?B?${Buffer.from('Re: Devis été 2027').toString('base64')}?=`,
      'In-Reply-To: <m-devis@mail.client.test>',
      'References: <m-avant@acme.test>',
      ' <m-devis@mail.client.test>',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
    ]);
    const text = Buffer.from(message.slice(cut), 'base64').toString('utf8');
    expect(text.replaceAll('\r\n', '\n')).toBe(COMPLET);

    expect(await stored(id)).toMatchObject({
      brouillonGmail: 'r-1',
      texte: COMPLET,
      ecarteLe: null,
    });
    expect(errors).not.toHaveBeenCalled();
  });

  it('un brouillon déjà déposé n’est jamais redéposé', async () => {
    const [julie] = await team();
    const { id } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
    const first = fakeFetch([TOKEN, readRoute(), createRoute()]);
    expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl: first })).toBe(true);

    const again = fakeFetch([]);
    expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl: again })).toBe(false);

    expect(again.calls).toHaveLength(0);
    expect(await stored(id)).toMatchObject({ brouillonGmail: 'r-1' });
  });
});

describe('depositBrouillon : ce qui reste dans Leon seulement, sans aucune requête', () => {
  const cases: Array<[string, (julie: TenantContext, paul: TenantContext) => Promise<string>]> = [
    [
      'un brouillon qui porte un blanc entre crochets',
      async (julie) => (await drafted(julie, A_TROU, { connectionId: await gmailOf(julie) })).id,
    ],
    [
      'son « non » à l’agent, donné après l’écriture du brouillon',
      async (julie) => {
        const { id } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
        await adminPool.query('update reponses_agent set oui = false where user_id = $1', [
          julie.userId,
        ]);
        return id;
      },
    ],
    [
      'une relance, même complète : jamais déposée dans ce morceau, quoi que dise son oui',
      async (julie) => {
        const { id } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
        await adminPool.query(
          `insert into reponses_agent (tenant_id, user_id, agent, oui, acl)
           values ($1, $2, 'relance', true, array[$2::uuid])`,
          [julie.tenantId, julie.userId],
        );
        await adminPool.query("update brouillons set sorte = 'relance' where id = $1", [id]);
        return id;
      },
    ],
    [
      'un fil Outlook',
      async (julie) => (await drafted(julie, COMPLET, { provider: 'outlook' })).id,
    ],
    [
      'une boîte Gmail qui n’est pas branchée par Pipedream',
      async (julie) => (await drafted(julie, COMPLET)).id,
    ],
    [
      'sa boîte en pause',
      async (julie) => {
        const connectionId = await gmailOf(julie);
        await adminPool.query("update connections set status = 'paused' where id = $1", [
          connectionId,
        ]);
        return (await drafted(julie, COMPLET, { connectionId })).id;
      },
    ],
    [
      'le fil privé d’un collègue, relevé par sa boîte à lui',
      async (julie, paul) =>
        (await drafted(julie, COMPLET, { owner: paul, connectionId: await gmailOf(paul) })).id,
    ],
    [
      'une boîte partagée à l’équipe, branchée par un collègue, même quand elle a sa propre boîte',
      async (julie, paul) => {
        await gmailOf(julie);
        return (
          await drafted(julie, COMPLET, {
            owner: paul,
            connectionId: await gmailOf(paul),
            shared: true,
          })
        ).id;
      },
    ],
  ];

  it.each(cases)('%s', async (_, setup) => {
    const [julie, paul] = await team();
    const id = await setup(julie, paul);
    const fetchImpl = fakeFetch([]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl })).toBe(false);

    expect(fetchImpl.calls).toHaveLength(0);
    expect(await stored(id)).toMatchObject({ brouillonGmail: null, ecarteLe: null });
    expect(errors).not.toHaveBeenCalled();
  });

  it('un brouillon qu’elle a écarté entre-temps', async () => {
    const [julie] = await team();
    const { id } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
    await adminPool.query('update brouillons set ecarte_le = now() where id = $1', [id]);
    const fetchImpl = fakeFetch([]);

    expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl })).toBe(false);

    expect(fetchImpl.calls).toHaveLength(0);
    expect(await stored(id)).toMatchObject({ brouillonGmail: null });
  });

  it('un collègue ne dépose pas le brouillon d’une autre, même avec sa propre boîte', async () => {
    const [julie, paul] = await team();
    const { id } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
    await gmailOf(paul);
    const fetchImpl = fakeFetch([]);

    expect(await depositBrouillon(paul, { id, to: LEA }, { fetchImpl })).toBe(false);

    expect(fetchImpl.calls).toHaveLength(0);
    expect(await stored(id)).toMatchObject({ brouillonGmail: null });
  });
});

// Leon ne connaît sa boîte que telle qu'à la dernière relève : le fil se relit chez Gmail avant d'y écrire.
describe('depositBrouillon : chez Gmail, le fil n’attend plus sa réponse', () => {
  it.each([
    ['elle a déjà répondu depuis Gmail', [RECEIVED, inThread('m-reponse', 30, ['SENT'])]],
    ['on lui a récrit depuis', [RECEIVED, inThread('m-suite', 30, ['INBOX', 'UNREAD'])]],
    ['elle a mis le mail à la corbeille', [inThread('m-devis', 0, ['TRASH'])]],
    ['elle l’a classé en indésirable', [inThread('m-devis', 0, ['SPAM'])]],
  ])('%s : une lecture, aucune création, aucune erreur', async (_, messages) => {
    const [julie] = await team();
    const { id } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
    const fetchImpl = fakeFetch([TOKEN, readRoute({ json: { id: 't', messages } })]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl })).toBe(false);

    expect(fetchImpl.calls.slice(1).map((call) => call.method)).toEqual(['GET']);
    expect(await stored(id)).toMatchObject({ brouillonGmail: null, ecarteLe: null });
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('depositBrouillon : un dépôt qui échoue', () => {
  const connectionOf = async (id: string) =>
    (
      await adminPool.query(
        'select status, last_error, next_sync_at, sync_lock_at, updated_at from connections where id = $1',
        [id],
      )
    ).rows[0];

  it.each<[string, FakeRoute[], string[]]>([
    ['le fil a été supprimé', [TOKEN, readRoute({ status: 404, json: {} })], ['GET']],
    ['l’accès est refusé', [TOKEN, readRoute({ status: 403, json: {} })], ['GET']],
    [
      'l’accès est refusé par un 401, que le proxy rejoue une fois avec un jeton neuf',
      [TOKEN, readRoute({ status: 401, json: {} }), TOKEN, readRoute({ status: 401, json: {} })],
      ['GET', 'GET'],
    ],
    ['Gmail est en panne à la lecture', [TOKEN, readRoute({ status: 503, json: {} })], ['GET']],
    [
      'le message reçu n’a pas d’identifiant',
      [
        TOKEN,
        readRoute({ json: { messages: [inThread('m-devis', 0, ['INBOX'], HEADERS.slice(2))] } }),
      ],
      ['GET'],
    ],
    [
      'Gmail est en panne à la création',
      [TOKEN, readRoute(), createRoute({ status: 500, json: {} })],
      ['GET', 'POST'],
    ],
    [
      'la création rend une réponse inattendue',
      [TOKEN, readRoute(), createRoute({ json: { message: {} } })],
      ['GET', 'POST'],
    ],
    ['Pipedream refuse son jeton', [{ ...TOKEN, status: 500, json: {} }], []],
  ])(
    '%s : le brouillon reste, non déposé, sans nouvel essai, et rien de capté ne va au journal',
    async (_, routes, sent) => {
      const [julie] = await team();
      const connectionId = await gmailOf(julie);
      const { id } = await drafted(julie, COMPLET, { connectionId });
      const before = await connectionOf(connectionId);
      const fetchImpl = fakeFetch(routes);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl })).toBe(false);

      // Chaque requête au proxy est payée : aucune n'est rejouée, sauf sur un 401, une fois (pipedream.ts).
      const paid = fetchImpl.calls.filter((call) => call.url.includes('/proxy/'));
      expect(paid.map((call) => call.method)).toEqual(sent);
      expect(await stored(id)).toMatchObject({
        brouillonGmail: null,
        texte: COMPLET,
        ecarteLe: null,
      });
      // L'état de sa connexion n'est pas touché : la relève continue.
      expect(await connectionOf(connectionId)).toEqual(before);
      expect(errors).toHaveBeenCalledTimes(1);
      const [prefix, event, payload] = errors.mock.calls[0] ?? [];
      expect([prefix, event]).toEqual(['[leon]', 'brouillons.deposit_failed']);
      expect(JSON.parse(String(payload))).toEqual({
        userId: julie.userId,
        brouillonId: id,
        error: expect.stringMatching(/^Connector(?:Http|Auth)Error: [A-Za-z0-9 ’]+$/),
      });
      expect(JSON.stringify(errors.mock.calls)).not.toMatch(/Léa|lea@|Devis|Bonjour|client\.test/);
    },
  );

  it('Pipedream n’est pas configuré sur ce serveur : aucune requête, le brouillon reste', async () => {
    const [julie] = await team();
    const { id } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
    vi.stubEnv('PIPEDREAM_CLIENT_SECRET', '');
    const fetchImpl = fakeFetch([]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl })).toBe(false);

    expect(fetchImpl.calls).toHaveLength(0);
    expect(await stored(id)).toMatchObject({ brouillonGmail: null });
    expect(errors.mock.calls.map((args) => args[1])).toEqual(['brouillons.deposit_failed']);
  });

  it('Pipedream est injoignable : le brouillon reste', async () => {
    const [julie] = await team();
    const { id } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl })).toBe(false);

    expect(await stored(id)).toMatchObject({ brouillonGmail: null });
    expect(String(errors.mock.calls[0]?.[2])).toContain('Pipedream is unreachable');
  });
});

// « Écarter » retire aussi de Gmail le brouillon que Leon y a déposé : la seule suppression de Leon dans une boîte.
describe('withdrawBrouillon : un brouillon écarté quitte ses brouillons Gmail', () => {
  const deleteRoute = (over: Partial<FakeRoute> = {}): FakeRoute => ({
    method: 'DELETE',
    url: proxied(`${GMAIL}/drafts/`),
    json: {},
    ...over,
  });
  // Un brouillon déposé (identifiant « r/1 » chez Gmail), puis écarté par elle, sauf `discarded: false`.
  async function deposited(ctx: TenantContext, discarded = true): Promise<string> {
    const { id } = await drafted(ctx, COMPLET, { connectionId: await gmailOf(ctx) });
    await adminPool.query(
      `update brouillons set brouillon_gmail = 'r/1', ecarte_le = case when $2 then now() end where id = $1`,
      [id, discarded],
    );
    return id;
  }

  it('supprime chez Gmail le brouillon déposé, par sa boîte à elle, et oublie son identifiant', async () => {
    const [julie] = await team();
    const id = await deposited(julie);
    const fetchImpl = fakeFetch([TOKEN, deleteRoute()]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await withdrawBrouillon(julie, id, { fetchImpl })).toBe(true);

    const [, remove] = fetchImpl.calls;
    expect(fetchImpl.calls).toHaveLength(2);
    expect(remove?.method).toBe('DELETE');
    expect(target(remove)).toBe(`${GMAIL}/drafts/r%2F1`);
    expect(new URL(remove?.url ?? CONNECT).searchParams.get('account_id')).toBe('apn_gm1');
    expect(await stored(id)).toMatchObject({ brouillonGmail: null, ecarteLe: expect.any(Date) });
    expect(errors).not.toHaveBeenCalled();
  });

  it('un brouillon qui n’est plus dans Gmail (envoyé ou supprimé par elle) : plus rien à retirer', async () => {
    const [julie] = await team();
    const id = await deposited(julie);
    const fetchImpl = fakeFetch([TOKEN, deleteRoute({ status: 404 })]);

    expect(await withdrawBrouillon(julie, id, { fetchImpl })).toBe(true);

    expect(await stored(id)).toMatchObject({ brouillonGmail: null });
  });

  it('un brouillon écarté qui n’avait pas été déposé : aucune requête', async () => {
    const [julie] = await team();
    const { id } = await drafted(julie, A_TROU, { connectionId: await gmailOf(julie) });
    await adminPool.query('update brouillons set ecarte_le = now() where id = $1', [id]);
    const fetchImpl = fakeFetch([]);

    expect(await withdrawBrouillon(julie, id, { fetchImpl })).toBe(true);

    expect(fetchImpl.calls).toHaveLength(0);
  });

  it.each([
    [
      'un brouillon qu’elle n’a pas écarté',
      async (julie: TenantContext) => ({ who: julie, id: await deposited(julie, false) }),
    ],
    [
      'le brouillon d’une autre, même avec sa propre boîte',
      async (julie: TenantContext, paul: TenantContext) => {
        await gmailOf(paul);
        return { who: paul, id: await deposited(julie) };
      },
    ],
    [
      'sa boîte mise en pause depuis',
      async (julie: TenantContext) => {
        const id = await deposited(julie);
        await adminPool.query("update connections set status = 'paused' where tenant_id = $1", [
          julie.tenantId,
        ]);
        return { who: julie, id };
      },
    ],
  ])('%s : rien n’est supprimé, aucune requête', async (_, setup) => {
    const [julie, paul] = await team();
    const { who, id } = await setup(julie, paul);
    const fetchImpl = fakeFetch([]);

    expect(await withdrawBrouillon(who, id, { fetchImpl })).toBe(false);

    expect(fetchImpl.calls).toHaveLength(0);
    expect(await stored(id)).toMatchObject({ brouillonGmail: 'r/1' });
  });

  it('écarté pendant le dépôt : le brouillon tout juste créé repart de Gmail', async () => {
    const [julie] = await team();
    const { id } = await drafted(julie, COMPLET, { connectionId: await gmailOf(julie) });
    const routes = fakeFetch([TOKEN, readRoute(), createRoute(), deleteRoute()]);
    // Elle clique « Écarter » entre la lecture du fil et la création du brouillon : rien n'est encore déposé.
    const fetchImpl: typeof fetch = async (input, init) => {
      if (routes.calls.length === 2) {
        await adminPool.query('update brouillons set ecarte_le = now() where id = $1', [id]);
        expect(await withdrawBrouillon(julie, id, { fetchImpl: fakeFetch([]) })).toBe(true);
      }
      return routes(input, init);
    };

    expect(await depositBrouillon(julie, { id, to: LEA }, { fetchImpl })).toBe(false);

    expect(routes.calls.map((call) => call.method)).toEqual(['POST', 'GET', 'POST', 'DELETE']);
    expect(target(routes.calls[3])).toBe(`${GMAIL}/drafts/r-1`);
    expect(await stored(id)).toMatchObject({ brouillonGmail: null, ecarteLe: expect.any(Date) });
  });

  it.each([403, 500])(
    'une suppression qui échoue (%s) : il reste dans Gmail, et Leon le sait',
    async (status) => {
      const [julie] = await team();
      const id = await deposited(julie);
      const fetchImpl = fakeFetch([TOKEN, deleteRoute({ status })]);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await withdrawBrouillon(julie, id, { fetchImpl })).toBe(false);

      // Une seule tentative, et rien de capté au journal.
      expect(fetchImpl.calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
      expect(await stored(id)).toMatchObject({ brouillonGmail: 'r/1', ecarteLe: expect.any(Date) });
      expect(errors.mock.calls.map((args) => args[1])).toEqual(['brouillons.withdraw_failed']);
      expect(JSON.stringify(errors.mock.calls)).not.toMatch(/Devis|lea@client|Bonjour/);
    },
  );
});

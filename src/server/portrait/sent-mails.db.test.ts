import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestConnectorItems } from '@/server/connectors/ingest-items';
import { CONNECTOR_TURN_MAX, normalizeItem } from '@/server/connectors/normalize';
import type { ConnectorTurn } from '@/server/connectors/types';
import { users } from '@/server/db/schema/auth';
import { sources, turns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { computeFacts } from './facts';
import { readSentMails } from './sent-mails';

vi.mock('@/server/pipeline/queue');

// Les mails envoyés d'une personne, lus sous ses droits. Les fils passent par la normalisation et l'ingestion des
// connecteurs, comme une relève : les identifiants de tours sont ceux de la production. Données inventées : Julie et
// Paul dans une organisation, Zoé dans une autre, des adresses en .test qui n'existent pas.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// Une seule lecture de l'horloge : deux dates « il y a tant » gardent leur écart à la milliseconde près.
const START = Date.now();
const ago = (ms: number) => new Date(START - ms);
const LEA = 'lea@client.test';
const PAUL = 'paul@acme.test';
// Un long mail : des paragraphes numérotés, que la normalisation coupe en plusieurs tours.
const LONG_MAIL = Array.from({ length: 220 }, (_, i) => `Paragraphe ${i} `.padEnd(99, 'x')).join(
  '\n\n',
);

const tenantIds: string[] = [];
let julie: TenantContext;
let paul: TenantContext;
let zoe: TenantContext;
let domain: string;

const received = (at: Date, text: string): ConnectorTurn => ({
  externalId: `message:${randomUUID()}`,
  role: 'participant',
  author: { name: 'Léa Roy', email: LEA },
  recipients: { to: ['julie@acme.test'], cc: [] },
  text,
  ts: at.toISOString(),
});
const sent = (at: Date, text: string, to: string[], cc: string[] = []): ConnectorTurn => ({
  ...received(at, text),
  author: { name: 'Julie Martin', email: 'julie@acme.test' },
  side: 'team',
  recipients: { to, cc },
});

// Un fil de courrier relevé par la boîte de `owner` : privée, sauf `shared` (une boîte partagée à l'équipe).
async function thread(
  owner: TenantContext,
  messages: ConnectorTurn[],
  options: { provider?: 'gmail' | 'outlook' | 'crisp'; shared?: boolean } = {},
): Promise<void> {
  const provider = options.provider ?? 'gmail';
  const item = normalizeItem(
    {
      externalId: `thread:${randomUUID()}`,
      nature: 'fil',
      title: 'Devis',
      url: null,
      updatedAt: messages.at(-1)?.ts ?? '',
      origin: {},
      turns: messages,
    },
    provider,
  );
  if (!item) throw new Error('fil de test refusé par la normalisation');
  const connection = {
    id: await seedConnection(owner, { provider }),
    provider,
    createdBy: owner.userId,
    privateRaw: !options.shared,
  };
  await ingestConnectorItems(owner, connection, [item]);
}

beforeAll(async () => {
  const team = await createTestTenant(['Julie Martin', 'Paul Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  [julie, paul] = team.members as [TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
  // L'adresse de Julie est à sa société, celle de Paul chez une messagerie grand public.
  domain = `${randomUUID()}.test`;
  await adminDb
    .update(users)
    .set({ email: `julie@${domain}` })
    .where(eq(users.id, julie.userId));
  await adminDb
    .update(users)
    .set({ email: `${randomUUID()}@gmail.com` })
    .where(eq(users.id, paul.userId));

  // Julie répond à Léa 42 minutes après son mail, puis la relance le lendemain.
  await thread(julie, [
    received(ago(3 * DAY), 'Bonjour Julie, où en est le devis ?'),
    sent(ago(3 * DAY - 42 * MINUTE), 'Bonjour Léa,\nVoici le devis.', [LEA], [PAUL]),
    sent(ago(2 * DAY), 'Avez-vous pu regarder ?', [LEA]),
  ]);
  // Un long mail, le premier de son fil, depuis Outlook.
  await thread(julie, [sent(ago(DAY), LONG_MAIL, [PAUL, LEA])], { provider: 'outlook' });
  await thread(julie, [sent(ago(120 * DAY), 'Un mail de l’été dernier.', [LEA])]);
  // Une réunion de l'agenda Outlook de Julie, qu'elle organise : du côté de l'équipe, mais pas un mail.
  const meeting = normalizeItem(
    {
      externalId: `event:${randomUUID()}`,
      nature: 'reunion',
      title: 'Point devis',
      url: null,
      updatedAt: ago(DAY).toISOString(),
      origin: {},
      turns: [
        {
          externalId: 'body',
          role: 'document',
          author: { name: 'Julie Martin', email: 'julie@acme.test' },
          side: 'team',
          text: 'Début : 2026-11-17T09:00:00Z',
          ts: ago(DAY).toISOString(),
        },
      ],
    },
    'outlook',
  );
  if (!meeting) throw new Error('réunion de test refusée par la normalisation');
  await ingestConnectorItems(
    julie,
    {
      id: await seedConnection(julie, { provider: 'outlook' }),
      provider: 'outlook',
      createdBy: julie.userId,
      privateRaw: true,
    },
    [meeting],
  );
  // Une réponse de Julie dans Crisp : du côté de l'équipe, au même identifiant « message: », mais pas un mail.
  await thread(julie, [sent(ago(DAY), 'Réponse de Julie à un visiteur du site.', [])], {
    provider: 'crisp',
  });
  // Les mails de Paul : sa boîte privée, et une boîte qu'il partage à l'équipe.
  await thread(paul, [sent(ago(DAY), 'Mail privé de Paul.', [LEA])]);
  await thread(paul, [sent(ago(DAY), 'Mail de la boîte partagée par Paul.', [LEA])], {
    shared: true,
  });
});

afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

describe('readSentMails', () => {
  it('rend les mails envoyés des 90 derniers jours, du plus ancien au plus récent, avec leurs destinataires', async () => {
    const { mails } = await readSentMails(julie);
    expect(mails.map((mail) => [mail.text.slice(0, 12), mail.to, mail.cc])).toEqual([
      ['Bonjour Léa,', [LEA], [PAUL]],
      ['Avez-vous pu', [LEA], []],
      ['Paragraphe 0', [PAUL, LEA], []],
    ]);
    // La période se choisit : sur 200 jours, le mail de l'été dernier revient.
    const older = await readSentMails(julie, 200);
    expect(older.mails).toHaveLength(4);
    expect(older.mails[0]?.text).toBe('Un mail de l’été dernier.');
  });

  it('dit le fil de chaque mail', async () => {
    const { mails } = await readSentMails(julie);
    const [reply, followUp, long] = mails.map((mail) => mail.sourceId);
    // La réponse et la relance sont du même fil, le long mail d'un autre : tous sont des sources de Julie.
    expect(followUp).toBe(reply);
    expect(long).not.toBe(reply);
    const own = await adminDb
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.ownerUserId, julie.userId));
    expect(own.map((source) => source.id)).toEqual(expect.arrayContaining([reply, long]));
  });

  it('regroupe en un message un long mail coupé en plusieurs tours', async () => {
    const stored = await adminDb
      .select({ externalId: turns.externalId, text: turns.text })
      .from(turns)
      .innerJoin(sources, eq(sources.id, turns.sourceId))
      .where(eq(sources.ownerUserId, julie.userId));
    const parts = stored.filter((turn) => turn.text.startsWith('Paragraphe'));
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((turn) => turn.text.length <= CONNECTOR_TURN_MAX)).toBe(true);

    const { mails } = await readSentMails(julie);
    const long = mails.filter((mail) => mail.text.startsWith('Paragraphe 0 '));
    expect(long).toHaveLength(1);
    // Le texte recollé dans l'ordre (une ligne vide de coupe devient un saut de ligne), les destinataires une fois.
    expect(long[0]?.text.replace(/\n+/g, '\n')).toBe(LONG_MAIL.replace(/\n+/g, '\n'));
    expect(long[0]?.to).toEqual([PAUL, LEA]);
  });

  it('date le mail reçu auquel un envoi répond, pas une relance ni un premier mail', async () => {
    const { mails, domains } = await readSentMails(julie);
    const [reply, followUp, first] = mails;
    expect(reply?.repliesToAt && reply.sentAt.getTime() - reply.repliesToAt.getTime()).toBe(
      42 * MINUTE,
    );
    expect(followUp?.repliesToAt).toBeNull();
    expect(first?.repliesToAt).toBeNull();
    // La forme que lit computeFacts : une réponse à l'extérieur, en 42 minutes.
    expect(computeFacts(mails, { domains, timeZone: 'Europe/Paris' }).delaiReponse).toEqual({
      tous: { medianeMinutes: 42, reponses: 1 },
      interne: { medianeMinutes: null, reponses: 0 },
      externe: { medianeMinutes: 42, reponses: 1 },
    });
  });

  it('ne rend à chacun que ses mails', async () => {
    const texts = async (ctx: TenantContext) =>
      (await readSentMails(ctx)).mails.map((mail) => mail.text);
    expect(await texts(paul)).toEqual(
      expect.arrayContaining(['Mail privé de Paul.', 'Mail de la boîte partagée par Paul.']),
    );
    expect(await texts(paul)).toHaveLength(2);
    expect(await texts(zoe)).toEqual([]);
    // Julie voit la boîte que Paul partage (sécurité par ligne), mais ce ne sont pas ses mails.
    const visible = await withTenant(julie, (tx) =>
      tx
        .select({ text: turns.text })
        .from(turns)
        .where(eq(turns.text, 'Mail de la boîte partagée par Paul.')),
    );
    expect(visible).toHaveLength(1);
    expect((await texts(julie)).filter((text) => text.includes('Paul.'))).toEqual([]);
  });

  it('rend les domaines de la société, sans les messageries grand public', async () => {
    expect((await readSentMails(julie)).domains).toEqual([domain]);
    expect((await readSentMails(paul)).domains).toEqual([domain]);
  });
});

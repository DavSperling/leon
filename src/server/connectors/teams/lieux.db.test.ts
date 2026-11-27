import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { type ConnectionRef, ingestConnectorItems, removeConnectorTurns } from '../ingest-items';
import { type NormalizedItem, normalizeItem } from '../normalize';
import type { Audience, AudienceMember, ConnectorTurn } from '../types';

vi.mock('@/server/pipeline/queue');

// Migration 0097 : une conversation, un canal ou une réunion de Teams n'existe qu'une fois dans l'organisation, et
// n'est visible que de ses membres, retrouvés par leur adresse ou leur identifiant Microsoft. Organisation Paul, Marie
// et Léa (Léa n'est dans aucun lieu), et une autre organisation (Zoé).

const tenantIds: string[] = [];
let tenantId: string;
let paul: TenantContext;
let marie: TenantContext;
let lea: TenantContext;
let zoe: TenantContext;
const addresses = new Map<string, string>();

beforeAll(async () => {
  const team = await createTestTenant(['Paul', 'Marie', 'Léa']);
  const other = await createTestTenant(['Zoé']);
  tenantId = team.tenantId;
  [paul, marie, lea] = team.members as [TenantContext, TenantContext, TenantContext];
  [zoe] = other.members as [TenantContext];
  tenantIds.push(team.tenantId, other.tenantId);
  const { rows } = await adminPool.query<{ id: string; email: string }>(
    'select id, email from "user" where id = any($1)',
    [[paul.userId, marie.userId, lea.userId]],
  );
  for (const row of rows) addresses.set(row.id, row.email);
});

// Les connexions sont partagées par tous les fichiers de test : on retire les nôtres, et seulement elles.
afterAll(async () => {
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());

async function connect(
  ctx: TenantContext,
  provider: 'teams' | 'teamschats' = 'teamschats',
): Promise<ConnectionRef> {
  return { id: await seedConnection(ctx, { provider }), provider, createdBy: ctx.userId };
}

const who = (ctx: TenantContext, since: string | null = null): AudienceMember => ({
  email: addresses.get(ctx.userId) ?? null,
  id: null,
  since,
});
const members = (key: string, ...people: AudienceMember[]): Audience => ({ key, members: people });

const message = (place: string, n: number, ts: string): ConnectorTurn => ({
  externalId: `message:${place}/${n}`,
  role: 'participant',
  author: { name: 'Paul Martin', email: 'paul@acme.test' },
  text: `Message ${n}.`,
  ts,
});

// Un jour d'une conversation (Teams Chat), ou un fil d'un canal (Teams), dans son lieu.
function item(
  provider: 'teams' | 'teamschats',
  place: string,
  externalId: string,
  turnList: ConnectorTurn[],
): NormalizedItem {
  const result = normalizeItem(
    {
      externalId,
      nature: 'fil',
      title: 'Chantier Dubois',
      url: null,
      updatedAt: turnList.at(-1)?.ts ?? '2026-10-14T12:00:00Z',
      origin: { chat: 'Chantier Dubois' },
      turns: turnList,
      audience: place,
    },
    provider,
  );
  if (!result) throw new Error('élément refusé par la normalisation');
  return result;
}
const chatDay = (place: string, day: string, n = 1) =>
  item('teamschats', place, `chat:${place}:${day}`, [message(place, n, `${day}T10:00:00Z`)]);
const newPlace = () => `19:${randomUUID()}@thread.v2`;

// Hors RLS : ce que la base garde vraiment.
async function stored(externalId: string) {
  const { rows } = await adminPool.query<{ id: string; acl: string[]; owner_user_id: string }>(
    'select id, acl, owner_user_id from sources where tenant_id = $1 and external_id = $2',
    [tenantId, externalId],
  );
  return rows;
}
async function aclsBelow(sourceId: string) {
  const { rows } = await adminPool.query<{ acl: string[] }>(
    `select acl from turns where source_id = $1
     union all select acl from ingest_runs where source_id = $1`,
    [sourceId],
  );
  return rows.map((row) => row.acl);
}
const seenBy = (ctx: TenantContext, externalId: string) =>
  withTenant(ctx, (tx) =>
    tx.select({ id: sources.id }).from(sources).where(eq(sources.externalId, externalId)),
  );
const sorted = (...ids: string[]) => [...ids].sort();

describe('ingestConnectorItems : les lieux de Teams (0097)', () => {
  it('une conversation n’existe qu’une fois, visible de ses participants retrouvés par adresse, et de personne d’autre', async () => {
    const place = newPlace();
    const day = chatDay(place, '2026-10-14');
    const marieUpper = { ...who(marie), email: addresses.get(marie.userId)?.toUpperCase() ?? null };
    const audience = members(place, who(paul), marieUpper, {
      email: 'lea@fournisseur.test', // une personne d'une autre entreprise : lue, ne voit rien
      id: 'u-externe',
      since: null,
    });

    expect((await ingestConnectorItems(paul, await connect(paul), [day], [audience])).turns).toBe(
      1,
    );
    // Marie relit la même conversation avec sa propre connexion : rien de neuf.
    expect((await ingestConnectorItems(marie, await connect(marie), [day], [audience])).turns).toBe(
      0,
    );

    const rows = await stored(day.externalId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.acl).toEqual(sorted(paul.userId, marie.userId));
    expect(await aclsBelow(rows[0]?.id ?? '')).toEqual([
      sorted(paul.userId, marie.userId),
      sorted(paul.userId, marie.userId),
    ]);
    expect(await seenBy(marie, day.externalId)).toHaveLength(1);
    expect(await seenBy(lea, day.externalId)).toEqual([]);
    expect(await seenBy(zoe, day.externalId)).toEqual([]);
  });

  it('retrouve un collègue par l’identifiant Microsoft d’une de ses connexions, même sans Teams branché', async () => {
    const place = newPlace();
    const day = chatDay(place, '2026-10-14');
    const key = `ms-${randomUUID()}`;
    await seedConnection(marie, { provider: 'outlook', config: { accountKey: key } });

    await ingestConnectorItems(
      paul,
      await connect(paul),
      [day],
      [members(place, who(paul), { email: 'marie.durand@acme.test', id: key, since: null })],
    );

    expect((await stored(day.externalId))[0]?.acl).toEqual(sorted(paul.userId, marie.userId));
  });

  it('un membre parti perd l’accès à la lecture suivante, même sans message nouveau, avec tout ce qui en descend', async () => {
    const place = newPlace();
    const day = chatDay(place, '2026-10-14');
    const connection = await connect(paul);
    await ingestConnectorItems(paul, connection, [day], [members(place, who(paul), who(marie))]);

    await ingestConnectorItems(paul, connection, [], [members(place, who(paul))]);

    const [row] = await stored(day.externalId);
    expect(row?.acl).toEqual([paul.userId]);
    expect(await aclsBelow(row?.id ?? '')).toEqual([[paul.userId], [paul.userId]]);
    expect(await seenBy(marie, day.externalId)).toEqual([]);
  });

  it('un membre ajouté sans l’historique ne voit pas les jours d’avant son arrivée', async () => {
    const place = newPlace();
    const before = chatDay(place, '2026-10-13', 1);
    const after = chatDay(place, '2026-10-14', 2);

    await ingestConnectorItems(
      paul,
      await connect(paul),
      [before, after],
      [members(place, who(paul), who(marie, '2026-10-14T00:00:00Z'))],
    );

    expect((await stored(before.externalId))[0]?.acl).toEqual([paul.userId]);
    expect((await stored(after.externalId))[0]?.acl).toEqual(sorted(paul.userId, marie.userId));
  });

  it('qui relève un jour d’avant son arrivée ne l’écrit pas : un autre membre l’écrira', async () => {
    const place = newPlace();
    const before = chatDay(place, '2026-10-13');
    const audience = members(place, who(paul), who(marie, '2026-10-14T00:00:00Z'));

    expect(
      (await ingestConnectorItems(marie, await connect(marie), [before], [audience])).turns,
    ).toBe(0);
    expect(await stored(before.externalId)).toEqual([]);

    await ingestConnectorItems(paul, await connect(paul), [before], [audience]);
    expect((await stored(before.externalId))[0]?.acl).toEqual([paul.userId]);
  });

  it('un canal standard d’une équipe publique est visible de toute l’organisation, et seulement par Teams', async () => {
    const channel = `19:${randomUUID()}@thread.tacv2`;
    const thread = item('teams', channel, `thread:${channel}/1`, [
      message(channel, 1, '2026-10-14T09:00:00Z'),
    ]);

    await ingestConnectorItems(
      paul,
      await connect(paul, 'teams'),
      [thread],
      [{ key: channel, team: true }],
    );

    expect((await stored(thread.externalId))[0]?.acl).toEqual([tenantId]);
    expect(await seenBy(lea, thread.externalId)).toHaveLength(1);
    expect(await seenBy(zoe, thread.externalId)).toEqual([]);
    await expect(
      ingestConnectorItems(paul, await connect(paul), [], [{ key: newPlace(), team: true }]),
    ).rejects.toMatchObject({ cause: { message: 'lieu ouvert refusé' } });
  });

  it('refuse d’aligner un lieu avec la connexion d’un autre membre, ou d’un autre outil', async () => {
    const place = newPlace();
    const day = chatDay(place, '2026-10-14');
    const audience = members(place, who(paul), who(marie));
    const github: ConnectionRef = {
      id: await seedConnection(paul),
      provider: 'github',
      createdBy: paul.userId,
    };

    await expect(
      ingestConnectorItems(marie, await connect(paul), [day], [audience]),
    ).rejects.toMatchObject({ cause: { message: 'connexion refusée' } });
    await expect(ingestConnectorItems(paul, github, [], [audience])).rejects.toMatchObject({
      cause: { message: 'connexion refusée' },
    });
    expect(await stored(day.externalId)).toEqual([]);
  });

  it('un message supprimé part de la seule copie, signalé par un membre, jamais par un autre collègue', async () => {
    const place = newPlace();
    const day = item('teamschats', place, `chat:${place}:2026-10-14`, [
      message(place, 1, '2026-10-14T09:00:00Z'),
      message(place, 2, '2026-10-14T09:05:00Z'),
    ]);
    await ingestConnectorItems(
      paul,
      await connect(paul),
      [day],
      [members(place, who(paul), who(marie))],
    );
    const gone = [`message:${place}/1`];

    expect(await removeConnectorTurns(lea, await connect(lea), gone)).toBe(0);
    expect(await removeConnectorTurns(marie, await connect(marie), gone)).toBe(1);

    const [row] = await stored(day.externalId);
    const { rows } = await adminPool.query<{ n: number }>(
      'select count(*)::int as n from turns where source_id = $1',
      [row?.id],
    );
    expect(rows[0]?.n).toBe(1);
  });
});

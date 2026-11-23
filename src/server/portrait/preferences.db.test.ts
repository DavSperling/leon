import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { setManager } from '@/server/auth/organisation';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { ConnectorTurn } from '@/server/connectors/types';
import { members } from '@/server/db/schema/auth';
import { brouillons, reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { createFakeLlm } from '@/server/llm/fake-llm';
import type { Llm } from '@/server/llm/llm';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { extendThread, JULIE, LEA, mailThread, received, sent } from '@/test/mail-threads';
import { writeBrouillons } from './brouillons';
import { buildFiche } from './fiche';

vi.mock('@/server/pipeline/queue');

// Ce que Leon apprend de ses retouches, de bout en bout sous ses droits : la réponse qu'elle a vraiment envoyée, comparée
// au brouillon sans modèle, à la fin de la relève de sa boîte (le passage de la file). Données inventées : Julie, Paul
// et Marc dans une organisation, Zoé dans une autre, des adresses en .test qui n'existent pas.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);
const DRAFT =
  'Bonjour Léa,\n\nMerci pour votre message. Je vous envoie le devis vendredi, avec les deux options dont nous avons parlé.\n\nBien à vous';
const REWRITTEN =
  'Bonjour Léa,\n\nJe ne pourrai pas vous répondre avant mon retour de congés, le 4 décembre. Paul suit le dossier en attendant.\n\nBien à vous';
const PAUL = 'paul@acme.test';

const tenantIds: string[] = [];
const userIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from brouillons_par_jour where user_id = any($1)', [userIds]);
});
afterEach(() => vi.restoreAllMocks());

async function team(): Promise<[TenantContext, TenantContext, TenantContext]> {
  const { tenantId, members: people } = await createTestTenant([
    'Julie Martin',
    'Paul Durand',
    'Marc Petit',
  ]);
  tenantIds.push(tenantId);
  userIds.push(...people.map((one) => one.userId));
  return people as [TenantContext, TenantContext, TenantContext];
}

// Un faux modèle qui rend une réponse par appel, la dernière ensuite, et garde ses appels.
function answering(...answers: string[]) {
  const fake = createFakeLlm({ texts: [] });
  const llm: Llm = {
    ...fake,
    async *streamText(request) {
      yield* fake.streamText(request);
      yield answers[fake.calls.length - 1] ?? answers.at(-1) ?? '';
    },
  };
  return { llm, calls: fake.calls };
}

// Sa fiche (un échange avec Léa, à qui elle a répondu), son « oui » à l'agent, et un mail de Léa qui attend dans le
// fil `title`, après les messages `before` : le passage y écrit DRAFT. Rend le fil.
async function drafted(
  julie: TenantContext,
  title = 'Devis 2027',
  before: ConnectorTurn[] = [],
): Promise<string> {
  await mailThread(julie, 'Premier contact', [
    received(ago(10 * DAY), 'Bonjour Julie, travaillez-vous avec des collectivités ?'),
    sent(ago(10 * DAY - HOUR), 'Bonjour Léa,\nOui, depuis dix ans.\nBien à vous'),
  ]);
  await buildFiche(julie);
  await adminDb.insert(reponsesAgent).values({
    tenantId: julie.tenantId,
    userId: julie.userId,
    agent: 'brouillon-reponse',
    oui: true,
    acl: [julie.userId],
  });
  const thread = await mailThread(julie, title, [
    ...before,
    received(ago(2 * HOUR), 'Bonjour Julie, pouvez-vous m’envoyer le devis ?'),
  ]);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  expect(
    await writeBrouillons(julie, { llm: answering(JSON.stringify({ brouillon: DRAFT })).llm }),
  ).toBe(1);
  return thread;
}

// Un passage de la file, après la relève : aucun mail n'attend, le modèle ne doit pas être appelé.
async function pass(ctx: TenantContext): Promise<void> {
  const { llm, calls } = answering('{"sans_reponse": true}');
  await writeBrouillons(ctx, { llm });
  expect(calls).toEqual([]);
}

const issues = async (ctx: TenantContext) =>
  (
    await adminDb
      .select({ issue: brouillons.issue })
      .from(brouillons)
      .where(eq(brouillons.userId, ctx.userId))
  ).map((row) => row.issue);

// Un mail de Paul, son collègue : reçu dans la boîte de Julie, ou envoyé de la sienne (`side`).
const fromPaul = (at: Date, text: string, over: Partial<ConnectorTurn> = {}) =>
  received(at, text, {
    author: { name: 'Paul Durand', email: PAUL },
    recipients: { to: [LEA], cc: [JULIE] },
    ...over,
  });

describe('compareReplies : la réponse qu’elle a vraiment envoyée, à la fin de la relève de sa boîte', () => {
  it('envoyée telle quelle, sa signature et la citation en plus : « tel quel » se pose sur la ligne, sans appel au modèle', async () => {
    const [julie] = await team();
    const thread = await drafted(julie);
    expect(await issues(julie)).toEqual([null]);

    await extendThread(julie, thread, [
      sent(
        ago(HOUR),
        `${DRAFT}\n\n-- \nJulie Martin\n\nLe lun. 23 nov. 2026 à 09:12, Léa Roy <${LEA}> a écrit :\n> Bonjour Julie`,
      ),
    ]);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await pass(julie);

    expect(await issues(julie)).toEqual(['tel-quel']);
    // Le journal ne porte que des identifiants et des nombres : rien du mail ni du brouillon.
    const [row] = await adminDb
      .select({ id: brouillons.id })
      .from(brouillons)
      .where(eq(brouillons.userId, julie.userId));
    expect(
      info.mock.calls.filter((args) => args[1] === 'brouillons.issue').map((args) => args[2]),
    ).toEqual([JSON.stringify({ userId: julie.userId, brouillonId: row?.id, issue: 'tel-quel' })]);
  });

  it('le premier de ses envois après le message reçu : pas un envoi d’avant, pas le mail d’un collègue, pas un autre fil ni une autre boîte', async () => {
    const [julie, paul] = await team();
    // Le même texte : envoyé par elle dans le fil avant le message reçu ; puis par Paul, dans le fil de Julie (reçu chez
    // elle) et depuis sa propre boîte, partagée à l'équipe ; puis par elle, dans un autre fil.
    const thread = await drafted(julie, 'Devis 2027', [sent(ago(3 * HOUR), DRAFT)]);
    await extendThread(julie, thread, [fromPaul(ago(90 * 60_000), DRAFT)]);
    await mailThread(
      paul,
      'Devis 2027',
      [
        received(ago(2 * HOUR), 'Bonjour Paul, pouvez-vous m’envoyer le devis ?', {
          recipients: { to: [PAUL], cc: [] },
        }),
        fromPaul(ago(80 * 60_000), DRAFT, { side: 'team' }),
      ],
      { shared: true },
    );
    await mailThread(julie, 'Nouveau devis', [sent(ago(70 * 60_000), DRAFT)]);
    await pass(julie);
    expect(await issues(julie)).toEqual([null]);

    // Puis sa réponse : réécrite. Le premier envoi compte, et l'issue ne change plus.
    await extendThread(julie, thread, [sent(ago(HOUR), REWRITTEN)]);
    await pass(julie);
    expect(await issues(julie)).toEqual(['reecrit']);
    await extendThread(julie, thread, [sent(ago(30 * 60_000), DRAFT)]);
    await pass(julie);
    expect(await issues(julie)).toEqual(['reecrit']);
  });

  it('seulement ses brouillons écrits, qu’elle n’a pas écartés, d’un mail de moins de trente jours', async () => {
    const [julie] = await team();
    const thread = await drafted(julie);
    // Des lignes posées à la main, sur des fils où elle répond aussi : une demande sans texte, et deux brouillons dont
    // le mail reçu a 29 et 31 jours.
    const line = async (title: string, at: Date, texte: string | null) => {
      const source = await mailThread(julie, title, [
        received(at, 'Bonjour Julie.', { externalId: `message:${title}` }),
        sent(ago(HOUR), DRAFT),
      ]);
      await adminDb.insert(brouillons).values({
        tenantId: julie.tenantId,
        userId: julie.userId,
        sourceId: source,
        message: `message:${title}`,
        texte,
        questions: texte ? null : ['Quel jour ?'],
        acl: [julie.userId],
      });
    };
    await line('Demande', ago(2 * DAY), null);
    await line('Vingt-neuf jours', ago(29 * DAY), DRAFT);
    await line('Trente et un jours', ago(31 * DAY), DRAFT);
    // Elle écarte le brouillon de Devis 2027, puis répond quand même.
    await adminDb
      .update(brouillons)
      .set({ ecarteLe: new Date() })
      .where(and(eq(brouillons.userId, julie.userId), eq(brouillons.sourceId, thread)));
    await extendThread(julie, thread, [sent(ago(HOUR), DRAFT)]);

    await pass(julie);

    const { rows } = await adminPool.query<{ title: string; issue: string | null }>(
      `select s.title, b.issue from brouillons b join sources s on s.id = b.source_id
       where b.user_id = $1 order by s.title`,
      [julie.userId],
    );
    expect(rows.map((row) => [row.title, row.issue])).toEqual([
      ['Demande', null],
      ['Devis 2027', null],
      ['Trente et un jours', null],
      ['Vingt-neuf jours', 'tel-quel'],
    ]);
  });
});

describe('l’issue d’un brouillon : privée, posée une fois', () => {
  const poser = (ctx: TenantContext, id: string, issue: string) =>
    withTenant(ctx, async (tx) => {
      const { rows } = await tx.execute<{ ok: boolean }>(
        sql`select poser_issue(${id}, ${issue}) as ok`,
      );
      return rows[0]?.ok;
    });

  it('seulement sur une ligne à elle, une fois ; ni un collègue, ni son manager avec la vue de l’équipe, ni une autre organisation ; et l’app ne la modifie jamais', async () => {
    const [julie, paul, marc] = await team();
    const other = await createTestTenant(['Zoé Bernard']);
    tenantIds.push(other.tenantId);
    const [zoe] = other.members as [TenantContext];
    // Marc, propriétaire de l'organisation et manager de Julie.
    const memberOf = async (ctx: TenantContext) =>
      (
        await adminDb
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
      )[0]?.id ?? '';
    await adminDb.update(members).set({ role: 'owner' }).where(eq(members.userId, marc.userId));
    expect(await setManager(marc, await memberOf(julie), await memberOf(marc))).toBe('ok');
    await drafted(julie);
    const [row] = await adminDb
      .select({ id: brouillons.id })
      .from(brouillons)
      .where(eq(brouillons.userId, julie.userId));
    const id = row?.id ?? '';

    for (const ctx of [paul, marc, { ...marc, equipe: true }, zoe])
      expect(await poser(ctx, id, 'tel-quel')).toBe(false);
    await expect(poser(julie, id, 'parfait')).rejects.toMatchObject({ cause: { code: '23514' } });
    expect(await poser(julie, id, 'retouche')).toBe(true);
    expect(await poser(julie, id, 'tel-quel')).toBe(false);
    await expect(
      withTenant(julie, (tx) =>
        tx.update(brouillons).set({ issue: 'reecrit' }).where(eq(brouillons.id, id)),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    expect(await issues(julie)).toEqual(['retouche']);
  });

  it('jamais sur une demande sans texte, ni sur un brouillon écarté', async () => {
    const [julie] = await team();
    const thread = await drafted(julie);
    const [row] = await adminDb
      .select({ id: brouillons.id })
      .from(brouillons)
      .where(eq(brouillons.userId, julie.userId));
    await adminDb
      .update(brouillons)
      .set({ ecarteLe: new Date() })
      .where(eq(brouillons.sourceId, thread));
    expect(await poser(julie, row?.id ?? '', 'tel-quel')).toBe(false);

    await expect(
      adminPool.query(
        `insert into brouillons (tenant_id, user_id, source_id, message, questions, issue, acl)
         values ($1, $2, $3, 'message:2', '{Quel jour ?}', 'tel-quel', array[$2::uuid])`,
        [julie.tenantId, julie.userId, thread],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

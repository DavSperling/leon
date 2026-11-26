import { and, eq, ne, sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAccount } from '@/server/auth/delete-account';
import { setManager } from '@/server/auth/organisation';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { ConnectorTurn } from '@/server/connectors/types';
import { members, users } from '@/server/db/schema/auth';
import { brouillons, lignesFiche, reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { createFakeLlm } from '@/server/llm/fake-llm';
import { type Llm, LlmError } from '@/server/llm/llm';
import { DATA_GUARD_LINE } from '@/server/llm/prompt-guard';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { extendThread, JULIE, LEA, mailThread, received, sent } from '@/test/mail-threads';
import { BROUILLONS_DAILY_CAP, writeBrouillons } from './brouillons';
import { buildFiche } from './fiche';
import { buildPreferencePrompt } from './preference-prompt';
import { answerPreference, readProposedPreferences } from './preferences';
import { readHomeBrouillons } from './screen';

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
// Retouché : ses formules au lieu de celles du brouillon (19 mots sur 23 gardés), sous sa signature et la citation.
const OWN = DRAFT.replace('Bonjour', 'Hello').replace('Bien à vous', 'Belle journée');
const RETOUCHED = `${OWN}\n\n-- \nJulie Martin\n\nLe lun. 23 nov. 2026 à 09:12, Léa Roy <${LEA}> a écrit :\n> Bonjour Julie`;
const LESSON = 'Vous terminez vos mails par « Belle journée ».';
const PREFERENCE = JSON.stringify({ preference: LESSON });
const NOTHING = '{"rien_a_retenir": true}';

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

// Sa fiche (un échange avec Léa, à qui elle a répondu) et son « oui » à l'agent.
async function ready(julie: TenantContext): Promise<void> {
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
}

// Un mail de Léa qui attend dans le fil `title`, après les messages `before` : le passage y écrit DRAFT. Rend le fil.
async function draftIn(
  julie: TenantContext,
  title: string,
  before: ConnectorTurn[] = [],
): Promise<string> {
  const thread = await mailThread(julie, title, [
    ...before,
    received(ago(2 * HOUR), 'Bonjour Julie, pouvez-vous m’envoyer le devis ?'),
  ]);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const { llm } = answering(JSON.stringify({ brouillon: DRAFT }));
  expect(await writeBrouillons(julie, { llm })).toBe(1);
  return thread;
}

// Prête, avec le brouillon de Leon dans le fil `title`. Rend le fil.
async function drafted(
  julie: TenantContext,
  title = 'Devis 2027',
  before: ConnectorTurn[] = [],
): Promise<string> {
  await ready(julie);
  return draftIn(julie, title, before);
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

  it('le premier de ses envois à Léa après le message reçu : pas un envoi d’avant, pas un transfert à un collègue, pas le mail d’un collègue, pas un autre fil ni une autre boîte', async () => {
    const [julie, paul] = await team();
    // Le même texte : envoyé par elle dans le fil avant le message reçu ; puis par Paul, dans le fil de Julie (reçu chez
    // elle) ; par elle à Paul seul, dans le même fil (un transfert) ; par Paul depuis sa propre boîte, partagée à
    // l'équipe ; puis par elle, dans un autre fil.
    const thread = await drafted(julie, 'Devis 2027', [sent(ago(3 * HOUR), DRAFT)]);
    await extendThread(julie, thread, [
      fromPaul(ago(90 * 60_000), DRAFT),
      sent(ago(85 * 60_000), DRAFT, [PAUL]),
    ]);
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

    // Puis sa réponse, réécrite, et un second envoi, relevés ensemble : le premier compte, et l'issue ne change plus.
    await extendThread(julie, thread, [sent(ago(HOUR), REWRITTEN), sent(ago(45 * 60_000), DRAFT)]);
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
    // Elle écarte le brouillon de Devis 2027, puis répond quand même, en le retouchant : aucun appel (pass).
    await adminDb
      .update(brouillons)
      .set({ ecarteLe: new Date() })
      .where(and(eq(brouillons.userId, julie.userId), eq(brouillons.sourceId, thread)));
    await extendThread(julie, thread, [sent(ago(HOUR), RETOUCHED)]);

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

// Ses préférences, telles que sa fiche les garde.
const preferenceLines = (ctx: TenantContext) =>
  adminDb
    .select({
      cle: lignesFiche.cle,
      valeur: lignesFiche.valeur,
      provenance: lignesFiche.provenance,
      mails: lignesFiche.mails,
      acl: lignesFiche.acl,
    })
    .from(lignesFiche)
    .where(and(eq(lignesFiche.userId, ctx.userId), eq(lignesFiche.genre, 'preference')));
// Des préférences déjà là : `retiree` la dit retirée par elle.
const seedPreferences = (
  ctx: TenantContext,
  rows: Array<{ texte: string; etat: string; retiree?: boolean }>,
) =>
  adminDb.insert(lignesFiche).values(
    rows.map((row, index) => ({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      genre: 'preference' as const,
      cle: `deja-${index}`,
      valeur: { texte: row.texte, etat: row.etat },
      provenance: 'apprise' as const,
      retireeLe: row.retiree ? new Date() : null,
      acl: [ctx.userId],
    })),
  );
const counted = async (ctx: TenantContext) => {
  const { rows } = await adminPool.query<{ nombre: number }>(
    'select nombre from brouillons_par_jour where user_id = $1',
    [ctx.userId],
  );
  return rows[0]?.nombre ?? 0;
};
const idOf = async (ctx: TenantContext, thread: string) =>
  (
    await adminDb
      .select({ id: brouillons.id })
      .from(brouillons)
      .where(and(eq(brouillons.userId, ctx.userId), eq(brouillons.sourceId, thread)))
  )[0]?.id ?? '';
// Julie a retouché le brouillon de Leon dans le fil `title`, et l'a envoyé. Rend la ligne du brouillon.
async function retouched(julie: TenantContext, title = 'Devis 2027'): Promise<string> {
  const thread = await drafted(julie, title);
  await extendThread(julie, thread, [sent(ago(HOUR), RETOUCHED)]);
  return idOf(julie, thread);
}
// Un passage de la file, le modèle rendant `answers`.
async function learn(ctx: TenantContext, ...answers: string[]) {
  const { llm, calls } = answering(...answers);
  await writeBrouillons(ctx, { llm });
  return calls;
}

describe('writeBrouillons : une retouche, un appel au modèle, une préférence proposée', () => {
  it('au passage qui suit la relève, un appel lit son brouillon et ce qu’elle a envoyé ; la préférence entre dans sa fiche, proposée, et l’issue se pose', async () => {
    const [julie] = await team();
    const id = await retouched(julie);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    const calls = await learn(julie, PREFERENCE);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.step).toBe('brouillon');
    // La consigne de preference-prompt.ts ; son texte à elle, sans sa signature ni la citation ; aucune préférence
    // encore.
    const prompt = buildPreferencePrompt({ brouillon: DRAFT, envoye: OWN, preferences: [] });
    expect(call?.system).toBe(prompt.system);
    expect(call?.messages).toEqual(prompt.messages);
    expect(call?.messages[0]?.content.startsWith(DATA_GUARD_LINE)).toBe(true);
    expect(await preferenceLines(julie)).toEqual([
      {
        cle: id,
        valeur: { texte: LESSON, etat: 'proposee' },
        provenance: 'apprise',
        mails: null,
        acl: [julie.userId],
      },
    ]);
    expect(await issues(julie)).toEqual(['retouche']);
    // Le brouillon, puis la préférence : deux appels sous le plafond du jour.
    expect(await counted(julie)).toBe(2);
    // Des identifiants et des nombres seulement : rien du mail, du brouillon ni de la préférence.
    expect(
      info.mock.calls
        .filter((args) => args[1] === 'brouillons.preference')
        .map((args) => JSON.parse(String(args[2]))),
    ).toEqual([
      { userId: julie.userId, brouillonId: id, preference: true, chars: PREFERENCE.length },
    ]);

    // Plus aucun appel ensuite.
    await pass(julie);
    expect(await preferenceLines(julie)).toHaveLength(1);
  });

  it('« rien à retenir » : l’issue se pose, rien n’entre dans sa fiche, et plus aucun appel', async () => {
    const [julie] = await team();
    await retouched(julie);

    expect(await learn(julie, NOTHING)).toHaveLength(1);

    expect(await issues(julie)).toEqual(['retouche']);
    expect(await preferenceLines(julie)).toEqual([]);
    await pass(julie);
  });

  it('une réponse illisible, un refus du modèle : rien ne s’écrit, et la retouche est retentée au passage suivant, puis un jour plus tard après deux ratés', async () => {
    const [julie] = await team();
    await retouched(julie);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await learn(julie, 'Elle préfère « Belle journée ».')).toHaveLength(1);
    expect(await learn(julie, JSON.stringify({ preference: 'x'.repeat(201) }))).toHaveLength(1);
    const fake = answering(PREFERENCE);
    const refusing: Llm = {
      ...fake.llm,
      async *streamText(request) {
        yield* fake.llm.streamText(request);
        throw new LlmError('refus du modèle');
      },
    };
    // Deux ratés de suite : le passage suivant ne la retente pas, celui du lendemain si.
    await writeBrouillons(julie, { llm: refusing });
    expect(fake.calls).toHaveLength(0);
    await writeBrouillons(julie, { llm: refusing, now: new Date(Date.now() + 86_400_000) });
    expect(fake.calls).toHaveLength(1);
    expect(await issues(julie)).toEqual([null]);
    expect(await preferenceLines(julie)).toEqual([]);

    const good = answering(PREFERENCE);
    await writeBrouillons(julie, { llm: good.llm, now: new Date(Date.now() + 2 * 86_400_000) });
    expect(good.calls).toHaveLength(1);
    expect(await issues(julie)).toEqual(['retouche']);
    expect(await preferenceLines(julie)).toMatchObject([{ valeur: { texte: LESSON } }]);
  });

  it('le plafond du jour est celui des brouillons : atteint, aucun appel, et la retouche attend', async () => {
    const [julie] = await team();
    await retouched(julie);
    await adminPool.query(
      "update brouillons_par_jour set nombre = $2 where user_id = $1 and jour = (now() at time zone 'UTC')::date",
      [julie.userId, BROUILLONS_DAILY_CAP],
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await learn(julie, PREFERENCE)).toHaveLength(0);

    expect(warn.mock.calls.map((args) => args[1])).toEqual(['brouillons.daily_cap']);
    expect(await issues(julie)).toEqual([null]);
    expect(await preferenceLines(julie)).toEqual([]);
  });

  it('son non à « Brouillons de réponse », même avec son oui à « Relances » : aucun appel, et la retouche attend', async () => {
    const [julie] = await team();
    await retouched(julie);
    await adminPool.query('update reponses_agent set oui = false where user_id = $1', [
      julie.userId,
    ]);
    // « Relances » lui est proposé : sa fiche dit qu'elle envoie des mails chaque semaine.
    await adminPool.query("delete from lignes_fiche where user_id = $1 and genre = 'rythme'", [
      julie.userId,
    ]);
    await adminDb.insert(lignesFiche).values({
      tenantId: julie.tenantId,
      userId: julie.userId,
      genre: 'rythme',
      valeur: { mailsParSemaine: 12 },
      provenance: 'calcul',
      mails: 40,
      acl: [julie.userId],
    });
    await adminDb.insert(reponsesAgent).values({
      tenantId: julie.tenantId,
      userId: julie.userId,
      agent: 'relance',
      oui: true,
      acl: [julie.userId],
    });

    expect(await learn(julie, PREFERENCE)).toHaveLength(0);

    expect(await issues(julie)).toEqual([null]);
    expect(await preferenceLines(julie)).toEqual([]);
  });

  it('dans les cinq appels du passage, après ses mails qui attendent', async () => {
    const [julie] = await team();
    await retouched(julie);
    for (const title of ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq'])
      await mailThread(julie, title, [
        received(ago(HOUR / 2), `Bonjour Julie, et pour ${title} ?`),
      ]);

    const first = await learn(julie, JSON.stringify({ brouillon: DRAFT }));
    expect(first).toHaveLength(5);
    for (const call of first)
      expect(call.system).not.toBe(
        buildPreferencePrompt({ brouillon: '', envoye: '', preferences: [] }).system,
      );
    expect(await preferenceLines(julie)).toEqual([]);

    const next = await learn(julie, PREFERENCE);
    expect(next).toHaveLength(1);
    expect(await preferenceLines(julie)).toHaveLength(1);
  });

  it('ses préférences déjà tirées vont au modèle, une retirée comme refusée ; une préférence déjà tirée n’est pas reproposée', async () => {
    const [julie] = await team();
    await seedPreferences(julie, [
      { texte: 'Vous écrivez des mails courts.', etat: 'acceptee' },
      { texte: 'Vous tutoyez vos clients.', etat: 'refusee' },
      { texte: 'Vous signez de votre prénom.', etat: 'acceptee', retiree: true },
      { texte: LESSON, etat: 'proposee' },
    ]);
    await retouched(julie);

    // Le modèle redit, en minuscules, une préférence qu'elle a refusée.
    const calls = await learn(julie, JSON.stringify({ preference: 'vous tutoyez vos clients.' }));

    expect(calls[0]?.messages[0]?.content).toContain(
      [
        'Ses préférences déjà tirées :',
        '<preference etat="acceptee">Vous écrivez des mails courts.</preference>',
        '<preference etat="refusee">Vous tutoyez vos clients.</preference>',
        '<preference etat="refusee">Vous signez de votre prénom.</preference>',
        `<preference etat="proposee">${LESSON}</preference>`,
      ].join('\n'),
    );
    expect(await issues(julie)).toEqual(['retouche']);
    expect(await preferenceLines(julie)).toHaveLength(4);
  });

  it('dix au plus, proposées ou acceptées : la dixième se propose, puis plus aucun appel ; les refusées et les retirées ne comptent pas', async () => {
    const [julie] = await team();
    await seedPreferences(julie, [
      ...Array.from({ length: 6 }, (_, n) => ({ texte: `Acceptée ${n}.`, etat: 'acceptee' })),
      ...Array.from({ length: 3 }, (_, n) => ({ texte: `Proposée ${n}.`, etat: 'proposee' })),
      ...Array.from({ length: 3 }, (_, n) => ({ texte: `Refusée ${n}.`, etat: 'refusee' })),
      { texte: 'Retirée.', etat: 'acceptee', retiree: true },
    ]);
    await ready(julie);
    const threads = [await draftIn(julie, 'Un'), await draftIn(julie, 'Deux')];
    for (const thread of threads) await extendThread(julie, thread, [sent(ago(HOUR), RETOUCHED)]);

    expect(await learn(julie, PREFERENCE)).toHaveLength(1);

    expect(await issues(julie)).toEqual(['retouche', 'retouche']);
    const kept = await preferenceLines(julie);
    expect(kept).toHaveLength(14);
    expect(kept.filter((one) => (one.valeur as { etat: string }).etat !== 'refusee')).toHaveLength(
      11,
    );
    // Dix sans la retirée : plus aucun appel.
    expect(await learn(julie, PREFERENCE)).toHaveLength(0);
  });

  it('un compte supprimé pendant l’appel ne reçoit rien', async () => {
    const [julie] = await team();
    await retouched(julie);
    const fake = answering(PREFERENCE);
    const llm: Llm = {
      ...fake.llm,
      async *streamText(request) {
        await adminDb
          .update(users)
          .set({ deletedAt: new Date() })
          .where(eq(users.id, julie.userId));
        yield* fake.llm.streamText(request);
      },
    };

    await writeBrouillons(julie, { llm });

    expect(fake.calls).toHaveLength(1);
    expect(await issues(julie)).toEqual([null]);
    expect(await preferenceLines(julie)).toEqual([]);
  });
});

describe('writeBrouillons : ses préférences acceptées servent aux brouillons suivants', () => {
  it('le brouillon suivant reçoit celles qu’elle a acceptées, et aucune autre : ni proposée, ni refusée, ni retirée', async () => {
    const [julie] = await team();
    await seedPreferences(julie, [
      { texte: LESSON, etat: 'acceptee' },
      { texte: 'Vous écrivez des mails courts.', etat: 'proposee' },
      { texte: 'Vous tutoyez vos clients.', etat: 'refusee' },
      { texte: 'Vous signez de votre prénom.', etat: 'acceptee', retiree: true },
    ]);
    await ready(julie);
    await mailThread(julie, 'Devis 2027', [received(ago(HOUR), 'Bonjour Julie, le devis ?')]);

    const calls = await learn(julie, JSON.stringify({ brouillon: DRAFT }));

    expect(calls).toHaveLength(1);
    const text = calls[0]?.messages[0]?.content ?? '';
    expect(text).toContain(`Ses préférences :\n<preference>${LESSON}</preference>\n`);
    expect(text.split('<preference>')).toHaveLength(2);
    expect(text).not.toMatch(/courts|tutoyez|prénom/);
    expect(calls[0]?.system).toContain("- des balises <preference> : ses préférences d'écriture");
  });
});

describe('answerPreference et readProposedPreferences : son oui ou son non à une préférence proposée', () => {
  // Julie a retouché deux brouillons, et Leon lui propose une préférence pour chacun.
  async function proposed(julie: TenantContext): Promise<string[]> {
    await ready(julie);
    const threads = [await draftIn(julie, 'Un'), await draftIn(julie, 'Deux')];
    for (const thread of threads) await extendThread(julie, thread, [sent(ago(HOUR), RETOUCHED)]);
    await learn(
      julie,
      PREFERENCE,
      JSON.stringify({ preference: 'Vous écrivez des mails de trois phrases au plus.' }),
    );
    return (await readProposedPreferences(julie, 20)).map((one) => one.id);
  }

  it('chaque préférence proposée se lit avec le correspondant, la date du mail reçu et son fil : rien d’autre', async () => {
    const [julie] = await team();
    await proposed(julie);

    const read = await readProposedPreferences(julie, 20);

    expect(read).toHaveLength(2);
    for (const one of read) {
      expect(Object.keys(one).sort()).toEqual([
        'from',
        'id',
        'preference',
        'receivedAt',
        'sourceId',
      ]);
      expect(one.from).toBe('Léa Roy');
      expect(one.receivedAt.getTime()).toBeGreaterThan(Date.now() - 3 * HOUR);
    }
    expect(read.map((one) => one.preference).sort()).toEqual([
      LESSON,
      'Vous écrivez des mails de trois phrases au plus.',
    ]);
    expect(await readProposedPreferences(julie, 1)).toHaveLength(1);
  });

  it('« Oui » l’accepte, « Non » la refuse : une fois, et elle ne se propose plus ; une préférence retirée ne se répond pas', async () => {
    const [julie] = await team();
    const [first, second] = (await proposed(julie)) as [string, string];

    expect(await answerPreference(julie, first, true)).toBe(true);
    expect(await answerPreference(julie, first, false)).toBe(false);
    expect(await answerPreference(julie, second, false)).toBe(true);
    expect(await answerPreference(julie, second, true)).toBe(false);

    const etats = (await preferenceLines(julie)).map((one) => one.valeur);
    expect(etats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ etat: 'acceptee' }),
        expect.objectContaining({ etat: 'refusee' }),
      ]),
    );
    expect(await readProposedPreferences(julie, 20)).toEqual([]);

    // Retirée avant sa réponse : plus rien à répondre.
    const [julie2] = await team();
    const [one] = (await proposed(julie2)) as [string];
    await adminDb.update(lignesFiche).set({ retireeLe: new Date() }).where(eq(lignesFiche.id, one));
    expect(await answerPreference(julie2, one, true)).toBe(false);
  });

  it('ni un collègue, ni son manager avec la vue de l’équipe, ni une autre organisation ne la lisent ni n’y répondent ; une ligne qui n’est pas une préférence ne se répond pas', async () => {
    const [julie, paul, marc] = await team();
    const other = await createTestTenant(['Zoé Bernard']);
    tenantIds.push(other.tenantId);
    const [zoe] = other.members as [TenantContext];
    const [id] = (await proposed(julie)) as [string];

    for (const ctx of [paul, marc, { ...marc, equipe: true }, zoe]) {
      expect(await readProposedPreferences(ctx, 20)).toEqual([]);
      expect(await answerPreference(ctx, id, true)).toBe(false);
    }
    expect(await answerPreference(julie, 'pas-un-id', true)).toBe(false);
    // Une ligne de sa fiche qui n'est pas une préférence : une mesure de ses mails.
    const [mesure] = await adminDb
      .select({ id: lignesFiche.id })
      .from(lignesFiche)
      .where(and(eq(lignesFiche.userId, julie.userId), ne(lignesFiche.genre, 'preference')));
    expect(mesure).toBeDefined();
    expect(await answerPreference(julie, mesure?.id ?? '', true)).toBe(false);
    expect(await readProposedPreferences(julie, 20)).toHaveLength(2);
  });
});

describe('readHomeBrouillons : une préférence proposée est une demande de plus pour l’accueil', () => {
  it('avec le correspondant, la date du mail et le fil lié à son outil, rien d’autre ; répondue, elle ne se montre plus', async () => {
    const [julie] = await team();
    await retouched(julie);
    await learn(julie, PREFERENCE);

    const home = await readHomeBrouillons(julie);

    // Le brouillon retouché, envoyé, ne se montre plus : le fil a bougé.
    expect(home.prets).toEqual([]);
    expect(home.demandes).toEqual([
      {
        id: expect.any(String),
        from: 'Léa Roy',
        receivedAt: expect.any(Date),
        preference: LESSON,
        source: { title: 'Devis 2027', url: null, kind: 'gmail', mailText: expect.any(String) },
      },
    ]);
    const [one] = home.demandes;
    expect(one && 'preference' in one && (await answerPreference(julie, one.id, false))).toBe(true);
    expect((await readHomeBrouillons(julie)).demandes).toEqual([]);
  });

  it('sans son oui à l’agent, rien ne part vers l’accueil ; ni vers celui d’un collègue', async () => {
    const [julie, paul] = await team();
    await retouched(julie);
    await learn(julie, PREFERENCE);

    expect((await readHomeBrouillons(paul)).demandes).toEqual([]);
    await adminDb
      .update(reponsesAgent)
      .set({ oui: false })
      .where(eq(reponsesAgent.userId, julie.userId));
    expect(await readHomeBrouillons(julie)).toEqual({ demandes: [], prets: [] });
  });
});

describe('ses préférences sont privées, et partent avec le compte', () => {
  it('ni un collègue, ni son manager avec la vue de l’équipe, ni une autre organisation ne les lisent ; la suppression du compte les efface avec ses brouillons', async () => {
    const [julie, paul, marc] = await team();
    const other = await createTestTenant(['Zoé Bernard']);
    tenantIds.push(other.tenantId);
    const [zoe] = other.members as [TenantContext];
    const memberOf = async (ctx: TenantContext) =>
      (
        await adminDb
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
      )[0]?.id ?? '';
    await adminDb.update(members).set({ role: 'owner' }).where(eq(members.userId, marc.userId));
    expect(await setManager(marc, await memberOf(julie), await memberOf(marc))).toBe('ok');
    await retouched(julie);
    await learn(julie, PREFERENCE);
    expect(await preferenceLines(julie)).toHaveLength(1);

    for (const ctx of [paul, marc, { ...marc, equipe: true }, zoe]) {
      const seen = await withTenant(ctx, (tx) =>
        tx
          .select({ id: lignesFiche.id })
          .from(lignesFiche)
          .where(eq(lignesFiche.userId, julie.userId)),
      );
      expect(seen).toEqual([]);
    }

    await deleteAccount(julie, null, false);
    expect(await preferenceLines(julie)).toEqual([]);
    expect(await issues(julie)).toEqual([]);
  });
});

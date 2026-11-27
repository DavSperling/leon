import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import { brouillons, reponsesAgent } from '@/server/db/schema/portrait';
import { createFakeLlm } from '@/server/llm/fake-llm';
import type { Llm } from '@/server/llm/llm';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { extendThread, mailThread, received, sent } from '@/test/mail-threads';
import { readShown, writeBrouillons } from './brouillons';
import { buildFiche } from './fiche';
import { prepareReply, readSansReponse } from './sans-reponse';

vi.mock('@/server/pipeline/queue');

// Les mails qu'elle a reçus et que Leon a jugés sans réponse à donner : leur liste, pour l'accueil, et « Préparer une
// réponse », qui fait de la ligne son oui. Sous ses droits, sans modèle pour la liste. Données inventées : Julie et
// Paul dans une organisation, Zoé dans une autre, des adresses en .test qui n'existent pas.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);
const DRAFT = 'Bonjour Léa,\n\nMerci, c’est bien noté.\n\nBien à vous';

const tenantIds: string[] = [];
const userIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from brouillons_par_jour where user_id = any($1)', [userIds]);
});
afterEach(() => vi.restoreAllMocks());

async function people(): Promise<[TenantContext, TenantContext, TenantContext]> {
  const team = await createTestTenant(['Julie Martin', 'Paul Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  tenantIds.push(team.tenantId, other.tenantId);
  const all = [...team.members, ...other.members];
  userIds.push(...all.map((one) => one.userId));
  return all as [TenantContext, TenantContext, TenantContext];
}

// Un mail de Léa, le dernier de son fil, reçu il y a `hours` heures.
async function mail(ctx: TenantContext, title: string, hours: number) {
  const last = received(ago(hours * HOUR), `Bonjour Julie, merci pour ${title}.`);
  return { sourceId: await mailThread(ctx, title, [last]), message: last.externalId };
}
// Sa ligne, telle que le passage l'écrit : sans rien, un mail jugé sans réponse à donner.
type Row = {
  texte?: string;
  questions?: string[];
  indications?: string;
  ecarte?: boolean;
  sorte?: 'reponse' | 'relance';
};
async function line(
  ctx: TenantContext,
  one: { sourceId: string; message: string },
  over: Row = {},
): Promise<string> {
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into brouillons (tenant_id, user_id, source_id, message, texte, questions, indications, ecarte_le, sorte, acl)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, array[$2::uuid]) returning id`,
    [
      ctx.tenantId,
      ctx.userId,
      one.sourceId,
      one.message,
      over.texte ?? null,
      over.questions ?? null,
      over.indications ?? null,
      over.ecarte ? new Date() : null,
      over.sorte ?? 'reponse',
    ],
  );
  return rows[0]?.id ?? '';
}
// Un mail de Léa jugé sans réponse à donner. Rend sa ligne.
const quiet = async (ctx: TenantContext, title: string, hours: number, over: Row = {}) =>
  line(ctx, await mail(ctx, title, hours), over);
const stored = (ctx: TenantContext) =>
  adminDb.select().from(brouillons).where(eq(brouillons.userId, ctx.userId));
// Les objets des fils de sa liste, dans l'ordre.
const titles = async (ctx: TenantContext, max = 20) => {
  const { rows } = await adminPool.query<{ id: string; title: string }>(
    'select id, title from sources where tenant_id = $1',
    [ctx.tenantId],
  );
  const byId = new Map(rows.map((row) => [row.id, row.title]));
  return (await readSansReponse(ctx, max)).map((one) => byId.get(one.sourceId));
};

describe('readSansReponse : ses mails que Leon a jugés sans réponse à donner', () => {
  it('rend la ligne, le fil, le correspondant et la date de chaque mail, le plus récent d’abord : rien de son texte', async () => {
    const [julie] = await people();
    const older = await mail(julie, 'la visite', 30);
    const recent = await mail(julie, 'le devis', 2);
    const olderId = await line(julie, older);
    const recentId = await line(julie, recent);

    const found = await readSansReponse(julie, 20);

    expect(found).toEqual([
      { id: recentId, sourceId: recent.sourceId, from: 'Léa Roy', receivedAt: expect.any(Date) },
      { id: olderId, sourceId: older.sourceId, from: 'Léa Roy', receivedAt: expect.any(Date) },
    ]);
    expect(Date.now() - (found[0]?.receivedAt.getTime() ?? 0)).toBeLessThan(2 * HOUR + 60_000);
    expect(JSON.stringify(found)).not.toMatch(/merci|message:|lea@client/);
    expect(await titles(julie, 1)).toEqual(['le devis']);
  });

  it('ni un brouillon prêt, ni des questions, ni son oui, ni une ligne écartée, ni son non à une relance', async () => {
    const [julie] = await people();
    await quiet(julie, 'Brouillon', 1, { texte: 'Bonjour Léa.' });
    await quiet(julie, 'Questions', 2, { questions: ['Mardi ?'] });
    await quiet(julie, 'Son oui', 3, { indications: '' });
    await quiet(julie, 'Écartée', 4, { ecarte: true });
    await quiet(julie, 'Relance refusée', 5, { sorte: 'relance' });
    await quiet(julie, 'Sans réponse', 6);

    expect(await titles(julie)).toEqual(['Sans réponse']);
  });

  it('un fil qui a bougé, ou un mail de plus de sept jours, quitte la liste', async () => {
    const [julie] = await people();
    const replied = await mail(julie, 'Répondu', 3);
    await line(julie, replied);
    const followed = await mail(julie, 'Suivi', 4);
    await line(julie, followed);
    await quiet(julie, 'Ancien', 7 * 24 + 1);
    await quiet(julie, 'Récent', 6 * 24);
    expect(await titles(julie)).toEqual(['Répondu', 'Suivi', 'Récent']);

    await extendThread(julie, replied.sourceId, [sent(ago(HOUR), 'Bonjour Léa,\nAvec plaisir.')]);
    await extendThread(julie, followed.sourceId, [received(ago(HOUR), 'Une question, au fait ?')]);

    expect(await titles(julie)).toEqual(['Récent']);
  });

  it('seulement les siens : ni ceux d’un collègue, ni ceux d’une autre organisation', async () => {
    const [julie, paul, zoe] = await people();
    await quiet(julie, 'À Julie', 1);
    await quiet(paul, 'À Paul', 1);
    await quiet(zoe, 'À Zoé', 1);

    expect(await titles(julie)).toEqual(['À Julie']);
    expect(await titles(paul)).toEqual(['À Paul']);
    expect(await titles(zoe)).toEqual(['À Zoé']);
  });
});

describe('prepareReply : « Préparer une réponse » à un mail jugé sans réponse', () => {
  it('la ligne devient son oui, avec ses indications : elle quitte la liste, et l’accueil dit que Leon écrit', async () => {
    const [julie] = await people();
    const one = await mail(julie, 'la visite', 2);
    const id = await line(julie, one);

    const kept = await prepareReply(julie, id, 'Remerciez-la.');

    expect(kept).toEqual(expect.any(String));
    expect(await stored(julie)).toMatchObject([
      {
        id: kept,
        sourceId: one.sourceId,
        message: one.message,
        sorte: 'reponse',
        texte: null,
        questions: null,
        indications: 'Remerciez-la.',
        ecarteLe: null,
        acl: [julie.userId],
      },
    ]);
    expect(await readSansReponse(julie, 20)).toEqual([]);
    expect(await readShown(julie)).toMatchObject({
      demandes: [{ id: kept, from: 'Léa Roy', repondue: true, questions: [] }],
      prets: [],
    });
    // Une seconde fois, plus rien à demander.
    expect(await prepareReply(julie, id, '')).toBeNull();
    expect(await prepareReply(julie, kept ?? '', '')).toBeNull();
    expect(await stored(julie)).toHaveLength(1);
  });

  it('sans indications, son oui se garde vide', async () => {
    const [julie] = await people();
    const kept = await prepareReply(julie, await quiet(julie, 'la visite', 2), '');

    expect(await stored(julie)).toMatchObject([{ id: kept, indications: '' }]);
  });

  it('rien ne change pour ce qui n’est pas un mail sans réponse à elle', async () => {
    const [julie, paul] = await people();
    const pauls = await quiet(paul, 'À Paul', 1);
    const others = [
      await quiet(julie, 'Brouillon', 1, { texte: 'Bonjour Léa.' }),
      await quiet(julie, 'Questions', 2, { questions: ['Mardi ?'] }),
      await quiet(julie, 'Son oui', 3, { indications: 'Déjà demandé.' }),
      await quiet(julie, 'Écartée', 4, { ecarte: true }),
      await quiet(julie, 'Relance refusée', 5, { sorte: 'relance' }),
    ];
    // Un fil qui a bougé : le mail n'est plus le dernier.
    const moved = await mail(julie, 'Répondu', 6);
    others.push(await line(julie, moved));
    await extendThread(julie, moved.sourceId, [sent(ago(HOUR), 'Bonjour Léa,\nAvec plaisir.')]);
    const before = await stored(julie);

    for (const id of [pauls, ...others, 'pas-un-identifiant', crypto.randomUUID()])
      expect(await prepareReply(julie, id, 'Répondez.'), id).toBeNull();

    expect(await stored(julie)).toEqual(before);
    expect(await stored(paul)).toMatchObject([{ id: pauls, indications: null }]);
  });

  it('deux demandes simultanées n’en gardent qu’une', async () => {
    const [julie] = await people();
    const id = await quiet(julie, 'la visite', 2);

    const both = await Promise.all([
      prepareReply(julie, id, 'Un.'),
      prepareReply(julie, id, 'Deux.'),
    ]);

    expect(both.filter(Boolean)).toHaveLength(1);
    expect(await stored(julie)).toHaveLength(1);
  });

  it('un compte supprimé n’écrit rien', async () => {
    const [julie] = await people();
    const id = await quiet(julie, 'la visite', 2);
    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, julie.userId));

    expect(await prepareReply(julie, id, '')).toBeNull();
    expect(await stored(julie)).toMatchObject([{ id, indications: null }]);
  });
});

describe('du jugement de Leon au brouillon qu’elle demande', () => {
  // Un faux modèle : son tri juge tout mail sans réponse à donner ; pour un brouillon, une réponse par appel, la
  // dernière ensuite. Garde les appels du brouillon, et compte ceux du tri.
  function answering(...answers: string[]) {
    const fake = createFakeLlm({ texts: [] });
    let sorted = 0;
    const llm: Llm = {
      ...fake,
      async *streamText(request) {
        if (request.step === 'tri') {
          sorted += 1;
          yield '{"reponse": false}';
          return;
        }
        yield* fake.streamText(request);
        yield answers[fake.calls.length - 1] ?? answers.at(-1) ?? '';
      },
    };
    return { llm, calls: fake.calls, sorted: () => sorted };
  }

  it('un mail jugé sans réponse entre dans la liste sans autre appel ; « Préparer une réponse » fait écrire le brouillon, d’un appel compté dans le plafond du jour, sans repasser par le tri', async () => {
    const [julie] = await people();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    // Sa fiche et son oui à l'agent : un échange avec Léa, à qui elle a répondu.
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
    await mail(julie, 'la visite', 2);
    const { llm, calls, sorted } = answering(JSON.stringify({ brouillon: DRAFT }));
    const counted = async () => {
      const { rows } = await adminPool.query<{ nombre: number }>(
        'select nombre from brouillons_par_jour where user_id = $1',
        [julie.userId],
      );
      return rows[0]?.nombre ?? 0;
    };

    // Leon lit le mail : le tri le juge sans réponse à donner, et l'appel du brouillon n'a pas lieu.
    expect(await writeBrouillons(julie, { llm })).toBe(0);
    const [listed] = await readSansReponse(julie, 20);
    expect(listed).toMatchObject({ from: 'Léa Roy' });
    expect(await writeBrouillons(julie, { llm })).toBe(0);
    expect([sorted(), calls.length, await counted()]).toEqual([1, 0, 0]);

    // Elle demande quand même une réponse : l'appel du brouillon, avec ses indications, et jamais « sans réponse ».
    const kept = await prepareReply(julie, listed?.id ?? '', 'Remerciez-la pour la visite.');
    expect(await writeBrouillons(julie, { llm })).toBe(1);

    expect([sorted(), calls.length, await counted()]).toEqual([1, 1, 1]);
    expect(calls[0]?.system).toContain("elle t'a demandé ce brouillon");
    expect(calls[0]?.system).not.toContain('sans_reponse');
    expect(calls[0]?.messages[0]?.content).toContain(
      '<indications>Remerciez-la pour la visite.</indications>',
    );
    expect((await readShown(julie)).prets).toMatchObject([{ id: kept, texte: DRAFT }]);
    expect(await readSansReponse(julie, 20)).toEqual([]);
  });
});

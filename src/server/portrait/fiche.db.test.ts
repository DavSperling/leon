import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { deleteAccount } from '@/server/auth/delete-account';
import { setManager } from '@/server/auth/organisation';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestConnectorItems } from '@/server/connectors/ingest-items';
import { normalizeItem } from '@/server/connectors/normalize';
import type { ConnectorTurn } from '@/server/connectors/types';
import { members } from '@/server/db/schema/auth';
import { turns } from '@/server/db/schema/memory';
import { lignesFiche } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import {
  buildFiche,
  correctFields,
  correctLine,
  type FicheLine,
  readFiche,
  retireLine,
} from './fiche';

vi.mock('@/server/pipeline/queue');

// La fiche d'une personne, construite d'après ses mails envoyés puis relue, corrigée et retirée par elle seule. Les
// mails passent par la normalisation et l'ingestion des connecteurs, comme une relève. Données inventées : Julie, Paul
// et Marc dans une organisation, Zoé dans une autre, des adresses qui n'existent pas.

const DAY = 24 * 60 * 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);
// Les membres de test ont une adresse en @test.leon : c'est le domaine de leur société.
const PAUL = 'paul@test.leon';
const NOA = 'noa@test.leon';
const LEA = 'lea@client.test';

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

async function team(): Promise<[TenantContext, TenantContext, TenantContext]> {
  const { tenantId, members: people } = await createTestTenant([
    'Julie Martin',
    'Paul Durand',
    'Marc Petit',
  ]);
  tenantIds.push(tenantId);
  return people as [TenantContext, TenantContext, TenantContext];
}

const mail = (at: Date, text: string, to: string[]): ConnectorTurn => ({
  externalId: `message:${randomUUID()}`,
  role: 'participant',
  author: { name: 'Julie Martin', email: 'julie@test.leon' },
  side: 'team',
  recipients: { to, cc: [] },
  text,
  ts: at.toISOString(),
});

// Un fil de courrier relevé par la boîte privée de `owner`.
async function thread(owner: TenantContext, messages: ConnectorTurn[]): Promise<void> {
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
    'gmail',
  );
  if (!item) throw new Error('fil de test refusé par la normalisation');
  const connection = {
    id: await seedConnection(owner, { provider: 'gmail' }),
    provider: 'gmail' as const,
    createdBy: owner.userId,
    privateRaw: true,
  };
  await ingestConnectorItems(owner, connection, [item]);
}

// Les mails envoyés de Julie : deux à Paul, un collègue qu'elle tutoie, un à Léa, une cliente qu'elle vouvoie. Puis sa
// fiche, construite.
async function built(julie: TenantContext): Promise<FicheLine[]> {
  await thread(julie, [
    mail(ago(10 * DAY), 'Salut Paul,\nPeux-tu relire le devis ?\nMerci', [PAUL]),
    mail(ago(2 * DAY), 'Salut Paul,\nTu as le contrat ?\nMerci', [PAUL]),
    mail(ago(DAY), 'Bonjour Léa,\nVoici votre devis.\nCordialement', [LEA]),
  ]);
  await buildFiche(julie);
  return readFiche(julie);
}

const keys = (fiche: FicheLine[]) => fiche.map((line) => `${line.genre}:${line.cle}`).sort();
function line(fiche: FicheLine[], genre: string, cle = ''): FicheLine {
  const found = fiche.find((one) => one.genre === genre && one.cle === cle);
  if (!found) throw new Error(`ligne ${genre}:${cle} absente de la fiche`);
  return found;
}
const stored = (ctx: TenantContext) =>
  adminDb.select().from(lignesFiche).where(eq(lignesFiche.userId, ctx.userId));

describe('buildFiche et readFiche', () => {
  it('construit la fiche d’après les mails envoyés, une ligne par fait, et la relit', async () => {
    const [julie] = await team();

    const fiche = await built(julie);

    expect(keys(fiche)).toEqual([
      'appels:externe',
      'appels:interne',
      'appels:tous',
      'horaires:',
      `interlocuteur:${LEA}`,
      `interlocuteur:${PAUL}`,
      'langues:',
      'mots:externe',
      'mots:interne',
      'mots:tous',
      'politesses:externe',
      'politesses:interne',
      'politesses:tous',
      'registre:externe',
      'registre:interne',
      'registre:tous',
      'rythme:',
    ]);
    expect(line(fiche, 'interlocuteur', PAUL)).toEqual({
      id: expect.any(String),
      genre: 'interlocuteur',
      cle: PAUL,
      valeur: {
        a: 2,
        copie: 0,
        dernier: expect.any(String),
        type: 'interne',
        registre: 'tutoiement',
        tutoiement: 2,
        vouvoiement: 0,
      },
      provenance: 'calcul',
      mails: 2,
      corrigeeLe: null,
    });
    expect(line(fiche, 'registre', 'externe')).toMatchObject({
      valeur: { tutoiement: 0, vouvoiement: 1 },
      mails: 1,
    });
    // Chaque ligne est un calcul, dit sur combien de mails il repose, et n'est qu'à elle.
    const rows = await stored(julie);
    expect(rows).toHaveLength(fiche.length);
    for (const row of rows)
      expect(row).toMatchObject({
        provenance: 'calcul',
        mails: expect.any(Number),
        acl: [julie.userId],
      });
  });

  it('reconstruit sans écraser une correction ni faire revenir un retrait', async () => {
    const [julie] = await team();
    const before = await built(julie);
    const paul = line(before, 'interlocuteur', PAUL);
    const lea = line(before, 'interlocuteur', LEA);
    const corrected = { ...paul.valeur, registre: 'vouvoiement' };

    expect(await correctLine(julie, paul.id, corrected)).toBe('ok');
    expect(await retireLine(julie, lea.id)).toBe(true);
    // Un mail de plus, à Paul, à Léa et à Noa : chaque calcul change.
    await thread(julie, [mail(ago(60_000), 'Salut,\nTu viens demain ?\nMerci', [PAUL, LEA, NOA])]);
    await buildFiche(julie);

    const after = await readFiche(julie);
    expect(line(after, 'interlocuteur', PAUL)).toEqual({
      ...paul,
      valeur: corrected,
      provenance: 'personne',
      mails: null,
      corrigeeLe: expect.any(Date),
    });
    // La ligne retirée ne revient pas, et reste en base avec sa valeur d'avant.
    expect(keys(after)).not.toContain(`interlocuteur:${LEA}`);
    const rows = await stored(julie);
    expect(rows.filter((row) => row.cle === LEA)).toEqual([
      expect.objectContaining({ id: lea.id, valeur: lea.valeur, retireeLe: expect.any(Date) }),
    ]);
    // Les autres lignes calculées prennent leur nouvelle valeur en place, et une ligne neuve s'ajoute.
    expect(line(after, 'langues')).toMatchObject({
      id: line(before, 'langues').id,
      valeur: { fr: 4 },
      provenance: 'calcul',
      mails: 4,
    });
    expect(line(after, 'interlocuteur', NOA)).toMatchObject({ provenance: 'calcul', mails: 1 });
    expect(rows).toHaveLength(before.length + 1);
  });

  it('ne montre pas une valeur gardée qui n’a plus la forme de son genre', async () => {
    const [julie] = await team();
    await adminPool.query(
      `insert into lignes_fiche (tenant_id, user_id, genre, valeur, provenance, acl)
       values ($1, $2, 'signature', '{"texte": "Julie Martin"}', 'personne', array[$2::uuid]),
              ($1, $2, 'rythme', '{"parJour": 3}', 'personne', array[$2::uuid])`,
      [julie.tenantId, julie.userId],
    );

    expect(keys(await readFiche(julie))).toEqual(['signature:']);
  });
});

describe('correctLine et retireLine', () => {
  it('refuse une valeur qui n’a pas la forme du genre de la ligne, sans rien changer', async () => {
    const [julie] = await team();
    const before = await built(julie);
    const paul = line(before, 'interlocuteur', PAUL);

    expect(await correctLine(julie, paul.id, { ...paul.valeur, registre: 'familier' })).toBe(
      'invalide',
    );
    // La forme d'un autre genre.
    expect(await correctLine(julie, paul.id, { texte: 'Julie Martin' })).toBe('invalide');
    expect(await correctLine(julie, randomUUID(), paul.valeur)).toBe('introuvable');
    expect(await correctLine(julie, 'pas-un-id', paul.valeur)).toBe('introuvable');

    expect(await readFiche(julie)).toEqual(before);
  });

  it('une ligne retirée sort de la fiche, et ne se corrige ni ne se retire plus', async () => {
    const [julie] = await team();
    const before = await built(julie);
    const lea = line(before, 'interlocuteur', LEA);

    expect(await retireLine(julie, lea.id)).toBe(true);

    expect(keys(await readFiche(julie))).toEqual(
      keys(before).filter((key) => key !== `interlocuteur:${LEA}`),
    );
    expect(await retireLine(julie, lea.id)).toBe(false);
    expect(await correctLine(julie, lea.id, lea.valeur)).toBe('introuvable');
  });
});

describe('correctFields : la personne ne corrige que son rôle et ses tâches', () => {
  // Une tâche et un rôle comme la synthèse les écrit.
  async function synthesized(julie: TenantContext, sources: string[]): Promise<FicheLine[]> {
    await adminDb.insert(lignesFiche).values(
      [
        { genre: 'role' as const, cle: '', valeur: { texte: 'Commerciale.' } },
        {
          genre: 'tache' as const,
          cle: '1',
          valeur: { titre: 'Envoyer les devis', detail: 'Un client demande un prix.', sources },
        },
      ].map((one) => ({
        ...one,
        tenantId: julie.tenantId,
        userId: julie.userId,
        provenance: 'synthese' as const,
        acl: [julie.userId],
      })),
    );
    return readFiche(julie);
  }

  it('le titre et le détail d’une tâche se corrigent, ses sources restent celles de la ligne', async () => {
    const [julie] = await team();
    const sources = [randomUUID(), randomUUID(), randomUUID()];
    const tache = line(await synthesized(julie, sources), 'tache', '1');

    expect(
      await correctFields(julie, tache.id, { titre: '  Chiffrer les devis ', detail: '' }),
    ).toBe('ok');

    expect(line(await readFiche(julie), 'tache', '1')).toMatchObject({
      valeur: { titre: 'Chiffrer les devis', detail: '', sources },
      provenance: 'personne',
    });
    // La personne ne fournit pas de sources, et un titre ne se vide pas.
    for (const champs of [
      { titre: 'Autre', detail: '', sources: [] },
      { titre: ' ', detail: 'Sans titre.' },
      { titre: 'x'.repeat(81), detail: '' },
      { titre: 'Sans détail' },
    ])
      expect(await correctFields(julie, tache.id, champs), JSON.stringify(champs)).toBe('invalide');
    expect(line(await readFiche(julie), 'tache', '1').valeur).toMatchObject({
      titre: 'Chiffrer les devis',
    });
  });

  it('le rôle se corrige par son texte ; trop long, vide ou illisible pour la base, il est refusé', async () => {
    const [julie] = await team();
    const role = line(await synthesized(julie, []), 'role');

    expect(await correctFields(julie, role.id, { texte: 'Responsable des devis.' })).toBe('ok');

    for (const texte of ['', 'x'.repeat(301), 'Nul \u0000 caché', 'Moitié \ud83d d’emoji', 12])
      expect(await correctFields(julie, role.id, { texte }), JSON.stringify(texte)).toBe(
        'invalide',
      );
    expect(line(await readFiche(julie), 'role').valeur).toEqual({
      texte: 'Responsable des devis.',
    });
  });

  it('une mesure ne se corrige pas : ni sa valeur, ni le registre d’un interlocuteur', async () => {
    const [julie] = await team();
    const before = await built(julie);

    expect(await correctFields(julie, line(before, 'mots', 'tous').id, { mediane: 3 })).toBe(
      'invalide',
    );
    expect(
      await correctFields(julie, line(before, 'registre', 'tous').id, {
        tutoiement: 1,
        vouvoiement: 0,
      }),
    ).toBe('invalide');
    const paul = line(before, 'interlocuteur', PAUL);
    expect(await correctFields(julie, paul.id, { registre: 'vouvoiement' })).toBe('invalide');
    expect(await correctFields(julie, paul.id, null)).toBe('invalide');

    expect(await readFiche(julie)).toEqual(before);
  });

  it('la ligne d’un collègue, une ligne retirée ou un identifiant mal écrit sont introuvables', async () => {
    const [julie, paul] = await team();
    const before = await built(julie);
    const lea = line(before, 'interlocuteur', LEA);

    expect(await correctFields(paul, lea.id, { registre: 'tutoiement' })).toBe('introuvable');
    expect(await correctFields(julie, 'pas-un-id', { registre: 'tutoiement' })).toBe('introuvable');
    await retireLine(julie, lea.id);
    expect(await correctFields(julie, lea.id, { registre: 'tutoiement' })).toBe('introuvable');

    expect(await stored(julie)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: lea.id, provenance: 'calcul' })]),
    );
  });
});

describe('la fiche est privée à la personne', () => {
  it('ni un collègue, ni son manager avec la vue de l’équipe, ni une autre organisation n’en lisent ou n’en changent une ligne', async () => {
    const [julie, paul, marc] = await team();
    const other = await createTestTenant(['Zoé Bernard']);
    const [zoe] = other.members as [TenantContext];
    tenantIds.push(other.tenantId);
    const fiche = await built(julie);
    // Marc, propriétaire de l'organisation, est le manager de Julie.
    const memberOf = async (ctx: TenantContext) =>
      (
        await adminDb
          .select({ id: members.id })
          .from(members)
          .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)))
      )[0]?.id ?? '';
    await adminDb.update(members).set({ role: 'owner' }).where(eq(members.userId, marc.userId));
    expect(await setManager(marc, await memberOf(julie), await memberOf(marc))).toBe('ok');
    const manager = { ...marc, equipe: true };

    const visible = (ctx: TenantContext) =>
      withTenant(ctx, (tx) => tx.select({ id: lignesFiche.id }).from(lignesFiche));
    expect(await visible(julie)).toHaveLength(fiche.length);
    for (const ctx of [paul, marc, manager, zoe]) expect(await visible(ctx)).toEqual([]);
    // La vue de l'équipe est bien ouverte : avec elle, Marc lit les mails privés de Julie, pas sa fiche.
    const mails = (ctx: TenantContext) =>
      withTenant(ctx, (tx) => tx.select({ id: turns.id }).from(turns));
    expect(await mails(marc)).toEqual([]);
    expect(await mails(manager)).not.toEqual([]);

    const lea = line(fiche, 'interlocuteur', LEA);
    for (const ctx of [paul, manager, zoe]) {
      expect(await readFiche(ctx)).toEqual([]);
      expect(await correctLine(ctx, lea.id, lea.valeur)).toBe('introuvable');
      expect(await retireLine(ctx, lea.id)).toBe(false);
    }
    // La base refuse une ligne écrite au nom d'une autre personne, et une ligne ouverte à l'organisation, même écrite
    // par elle : l'organisation est dans ses principals, seul le check de la table (acl = [user_id]) l'arrête.
    const write = (ctx: TenantContext, acl: string[]) =>
      withTenant(ctx, (tx) =>
        tx.insert(lignesFiche).values({
          tenantId: julie.tenantId,
          userId: julie.userId,
          genre: 'signature',
          valeur: { texte: 'Julie Martin' },
          provenance: 'personne',
          acl,
        }),
      );
    await expect(write(paul, [julie.userId])).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(write(julie, [julie.tenantId])).rejects.toMatchObject({
      cause: { code: '23514' },
    });
    // L'app ne change pas l'accès d'une ligne déjà écrite : elle n'a pas le droit de mettre à jour cette colonne.
    await expect(
      withTenant(julie, (tx) => tx.update(lignesFiche).set({ acl: [julie.tenantId] })),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    expect(await readFiche(julie)).toEqual(fiche);
  });
});

describe('la fiche part avec le compte', () => {
  it('la suppression du compte efface ses lignes, retirées comprises, et une reconstruction, lancée en même temps ou après, n’en récrit aucune', async () => {
    const [julie, paul] = await team();
    const fiche = await built(julie);
    await retireLine(julie, line(fiche, 'langues').id);
    await adminPool.query(
      `insert into lignes_fiche (tenant_id, user_id, genre, valeur, provenance, acl)
       values ($1, $2, 'signature', '{"texte": "Paul Durand"}', 'personne', array[$2::uuid])`,
      [paul.tenantId, paul.userId],
    );

    // Une reconstruction lancée au même instant écrit avant la suppression, qui l'efface, ou après, et n'écrit rien.
    await Promise.all([buildFiche(julie), deleteAccount(julie, null, false)]);

    expect(await stored(julie)).toEqual([]);
    // Ses mails restent (ses sources ne partent pas) : sans compte, ils ne refont pas sa fiche.
    await buildFiche(julie);
    expect(await stored(julie)).toEqual([]);
    expect(await stored(paul)).toHaveLength(1);
  });
});

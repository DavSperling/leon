import { afterAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { JULIE, LEA, mailThread, received, sent } from '@/test/mail-threads';
import { readUnansweredMails } from './unanswered-mails';

vi.mock('@/server/pipeline/queue');

// Ses mails restés sans réponse, lus sous ses droits, sans modèle. Données inventées : Julie et Paul dans une
// organisation, Zoé dans une autre, des adresses en .test qui n'existent pas.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Une seule lecture de l'horloge : les écarts entre deux dates « il y a tant » sont exacts.
const NOW = new Date();
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const PAUL = 'paul@acme.test';
const MARC = 'marc@client.test';
// Neuf mots, sans question ; puis dix.
const NEUF = 'Bonjour Léa, voici le devis signé pour le projet.';
const DIX = `${NEUF}\nCordialement`;

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

async function people(): Promise<[TenantContext, TenantContext, TenantContext]> {
  const team = await createTestTenant(['Julie Martin', 'Paul Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  tenantIds.push(team.tenantId, other.tenantId);
  return [...team.members, ...other.members] as [TenantContext, TenantContext, TenantContext];
}

// Les fils de ses mails sans réponse, le plus récent d'abord.
const subjects = async (ctx: TenantContext, max = 20) => {
  const { rows } = await adminPool.query<{ id: string; title: string }>(
    'select id, title from sources where owner_user_id = $1',
    [ctx.userId],
  );
  const titles = new Map(rows.map((row) => [row.id, row.title]));
  return (await readUnansweredMails(ctx, max, NOW)).map((mail) => titles.get(mail.sourceId));
};

describe('readUnansweredMails : son mail resté sans réponse', () => {
  it('rend son fil, son message, le nom de son destinataire pris dans le fil et la date de son mail : rien de son texte', async () => {
    const [julie] = await people();
    const mine = sent(ago(6 * DAY), 'Bonjour Léa,\nAvez-vous pu relire le contrat ?');
    const sourceId = await mailThread(julie, 'Contrat', [
      received(ago(8 * DAY), 'Bonjour Julie, je vous envoie le contrat.'),
      mine,
    ]);
    // Dans Outlook aussi ; sans message de lui dans le fil, son adresse.
    const toMarc = sent(ago(7 * DAY), 'Bonjour Marc,\nLe devis vous convient-il ?', [MARC]);
    const outlook = await mailThread(julie, 'Devis', [toMarc], { provider: 'outlook' });

    const found = await readUnansweredMails(julie, 20, NOW);

    expect(found).toEqual([
      { sourceId, message: mine.externalId, to: 'Léa Roy', others: 0, sentAt: ago(6 * DAY) },
      { sourceId: outlook, message: toMarc.externalId, to: MARC, others: 0, sentAt: ago(7 * DAY) },
    ]);
    expect(JSON.stringify(found)).not.toMatch(/contrat|devis|Bonjour/i);
  });

  it('avec plusieurs destinataires : le premier en « à » qui n’est pas elle, et le nombre des autres', async () => {
    const [julie] = await people();
    await mailThread(julie, 'Réunion', [
      received(ago(9 * DAY), 'Bonjour à tous.', {
        author: { name: 'Marc Petit', email: MARC },
        recipients: { to: [JULIE, LEA], cc: [] },
      }),
      sent(ago(6 * DAY), 'Bonjour,\nQuelle date vous convient ?', [JULIE, MARC, LEA], [PAUL]),
    ]);

    expect(await readUnansweredMails(julie, 20, NOW)).toMatchObject([
      { to: 'Marc Petit', others: 1 },
    ]);
  });

  it('un collègue destinataire : proposé, comme l’extérieur', async () => {
    const [julie] = await people();
    await mailThread(julie, 'À Paul', [sent(ago(6 * DAY), 'Paul, as-tu le chiffre ?', [PAUL])]);

    expect(await subjects(julie)).toEqual(['À Paul']);
  });
});

describe('readUnansweredMails : ce qui n’en est pas un', () => {
  it('moins de cinq jours, ou plus de trente : les bords comptent', async () => {
    const [julie] = await people();
    for (const days of [4, 5, 30, 31])
      await mailThread(julie, `${days} jours`, [sent(ago(days * DAY), 'Une question ?')]);

    expect(await subjects(julie)).toEqual(['5 jours', '30 jours']);
  });

  it('un fil où quelqu’un a répondu après elle, même à tous et par une question', async () => {
    const [julie] = await people();
    await mailThread(julie, 'Répondu', [
      sent(ago(8 * DAY), 'Une question ?'),
      received(ago(7 * DAY), 'Voici la réponse.'),
    ]);
    // Le dernier message a un destinataire qui n'est pas elle, mais il n'est pas d'elle.
    await mailThread(julie, 'Répondu à tous', [
      sent(ago(8 * DAY), 'Le devis vous convient-il ?', [LEA, MARC]),
      received(ago(6 * DAY), 'Oui. Pouvez-vous nous envoyer le bon de commande ?', {
        recipients: { to: [JULIE, MARC], cc: [] },
      }),
    ]);

    expect(await subjects(julie)).toEqual([]);
  });

  it('un mail qu’elle s’envoie : dans Gmail, à elle seule ; dans Outlook, la copie reçue vient après', async () => {
    const [julie] = await people();
    const note = 'Penser à rappeler le fournisseur, et à quelle date ?';
    await mailThread(julie, 'Note Gmail', [sent(ago(6 * DAY), note, [JULIE])]);
    await mailThread(
      julie,
      'Note Outlook',
      [
        sent(ago(6 * DAY), note, [JULIE]),
        received(ago(6 * DAY - 2000), note, { author: { name: 'Julie Martin', email: JULIE } }),
      ],
      { provider: 'outlook' },
    );

    expect(await subjects(julie)).toEqual([]);
  });

  it('dix destinataires, « à » et copie, au plus : au-delà, c’est une annonce', async () => {
    const [julie] = await people();
    const copies = (count: number) =>
      Array.from({ length: count }, (_, index) => `copie${index}@client.test`);
    await mailThread(julie, 'Dix', [sent(ago(6 * DAY), 'Une question ?', [LEA], copies(9))]);
    await mailThread(julie, 'Onze', [sent(ago(7 * DAY), 'Une question ?', [LEA], copies(10))]);

    expect(await subjects(julie)).toEqual(['Dix']);
  });

  it('un destinataire qui est une adresse de machine, en « à » ou en copie', async () => {
    const [julie] = await people();
    const ask = 'Une question ?';
    await mailThread(julie, 'No-reply', [sent(ago(6 * DAY), ask, [LEA], ['no-reply@outil.test'])]);
    await mailThread(julie, 'Notifications', [
      sent(ago(7 * DAY), ask, ['Notifications@outil.test']),
    ]);
    await mailThread(julie, 'Une personne', [
      sent(ago(8 * DAY), ask, ['julie.notifications@client.test']),
    ]);

    expect(await subjects(julie)).toEqual(['Une personne']);
  });

  it('un simple accusé ou remerciement : moins de dix mots à elle, sans question', async () => {
    const [julie] = await people();
    await mailThread(julie, 'Neuf mots', [sent(ago(6 * DAY), NEUF)]);
    await mailThread(julie, 'Dix mots', [sent(ago(7 * DAY), DIX)]);
    await mailThread(julie, 'Une question', [sent(ago(8 * DAY), 'Et demain ?')]);
    await mailThread(julie, 'Merci', [sent(ago(9 * DAY), 'Merci, bien reçu.')]);
    // Ses mots seulement : la citation et la signature ne comptent pas.
    await mailThread(julie, 'Merci, et la citation', [
      sent(
        ago(10 * DAY),
        'Merci, bien reçu.\n-- \nJulie Martin, Acme, une signature de plus de dix mots en tout ?\n\nLe 2 nov. 2026, Léa Roy a écrit :\n> Pouvez-vous relire le devis, et me dire ce que vous en pensez ?',
      ),
    ]);

    expect(await subjects(julie)).toEqual(['Dix mots', 'Une question']);
  });

  it('un mail déjà traité : son oui ou son non à une relance', async () => {
    const [julie] = await people();
    const mails = {
      Oui: sent(ago(6 * DAY), 'Une question ?'),
      Non: sent(ago(7 * DAY), 'Une autre question ?'),
      'Pas encore traité': sent(ago(8 * DAY), 'Une dernière question ?'),
    };
    const ids: Record<string, string> = {};
    for (const [title, mail] of Object.entries(mails))
      ids[title] = await mailThread(julie, title, [mail]);
    await adminPool.query(
      `insert into brouillons (tenant_id, user_id, source_id, message, indications, sorte, acl)
       values ($1, $2, $3, $4, '', 'relance', array[$2::uuid]),
              ($1, $2, $5, $6, null, 'relance', array[$2::uuid])`,
      [julie.tenantId, julie.userId, ids.Oui, mails.Oui.externalId, ids.Non, mails.Non.externalId],
    );

    expect(await subjects(julie)).toEqual(['Pas encore traité']);
  });
});

describe('readUnansweredMails : ses seuls fils', () => {
  it('ni le fil d’un collègue, ni la boîte qu’il partage à l’équipe, ni une autre organisation', async () => {
    const [julie, paul, zoe] = await people();
    const byPaul = (at: Date) =>
      received(at, 'Léa, une question ?', {
        author: { name: 'Paul Durand', email: PAUL },
        side: 'team',
        recipients: { to: [LEA], cc: [] },
      });
    await mailThread(paul, 'Fil de Paul', [byPaul(ago(6 * DAY))]);
    // La boîte que Paul partage à l'équipe : Julie la voit, ce n'est pas son fil.
    await mailThread(paul, 'Boîte partagée', [byPaul(ago(7 * DAY))], { shared: true });
    await mailThread(julie, 'Fil de Julie', [sent(ago(8 * DAY), 'Léa, une question ?')]);

    expect(await subjects(julie)).toEqual(['Fil de Julie']);
    expect(await subjects(paul)).toEqual(['Fil de Paul', 'Boîte partagée']);
    expect(await readUnansweredMails(zoe, 20, NOW)).toEqual([]);
  });
});

describe('readUnansweredMails : l’ordre et le plafond', () => {
  it('rend les plus récents d’abord, autant qu’on en demande', async () => {
    const [julie] = await people();
    for (const days of [7, 5, 9, 6, 8])
      await mailThread(julie, `Il y a ${days} jours`, [sent(ago(days * DAY), 'Une question ?')]);

    expect(await subjects(julie)).toEqual([5, 6, 7, 8, 9].map((days) => `Il y a ${days} jours`));
    expect(await subjects(julie, 3)).toEqual([5, 6, 7].map((days) => `Il y a ${days} jours`));
  });
});

import { afterAll, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestConnectorItems } from '@/server/connectors/ingest-items';
import { normalizeItem } from '@/server/connectors/normalize';
import { sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { extendThread, JULIE, LEA, mailThread, received, sent } from '@/test/mail-threads';
import { readUnknownMails, readWaitingMails } from './waiting-mails';

vi.mock('@/server/pipeline/queue');

// Les mails qui attendent la réponse d'une personne, lus sous ses droits, sans modèle. Données inventées : Julie et
// Paul dans une organisation, Zoé dans une autre, des adresses en .test qui n'existent pas.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Une seule lecture de l'horloge : les écarts entre deux dates « il y a tant » sont exacts.
const NOW = new Date();
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const PAUL = 'paul@acme.test';

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
});

// Julie et Paul, collègues, et Zoé, d'une autre organisation. Julie a écrit à Léa il y a dix jours : Léa est une de
// ses correspondantes, et julie@acme.test une de ses adresses.
async function people(): Promise<[TenantContext, TenantContext, TenantContext]> {
  const team = await createTestTenant(['Julie Martin', 'Paul Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  tenantIds.push(team.tenantId, other.tenantId);
  const [julie, paul] = team.members as [TenantContext, TenantContext];
  await mailThread(julie, 'Premier contact', [sent(ago(10 * DAY), 'Bonjour Léa,\nEnchantée.')]);
  return [julie, paul, ...other.members] as [TenantContext, TenantContext, TenantContext];
}

const subjects = async (ctx: TenantContext) =>
  (await readWaitingMails(ctx, NOW)).map((mail) => mail.subject);

describe('readWaitingMails : un mail qui attend', () => {
  it('rend le dernier message de son fil, reçu d’une correspondante et adressé à elle, avec les quatre derniers messages', async () => {
    const [julie] = await people();
    const last = received(ago(2 * HOUR), 'Pouvez-vous m’envoyer le devis avant vendredi ?');
    const sourceId = await mailThread(julie, 'Devis 2027', [
      received(ago(5 * DAY), 'Message un, hors des quatre derniers.'),
      sent(ago(4 * DAY), 'Bonjour Léa,\nMessage deux.'),
      received(ago(3 * DAY), 'Message trois.'),
      sent(ago(2 * DAY), 'Message quatre.'),
      last,
    ]);

    const waiting = await readWaitingMails(julie, NOW);

    expect(waiting).toEqual([
      {
        sourceId,
        message: last.externalId,
        from: LEA,
        subject: 'Devis 2027',
        messages: [
          {
            author: 'Julie Martin',
            own: true,
            at: ago(4 * DAY),
            text: 'Bonjour Léa,\nMessage deux.',
          },
          { author: 'Léa Roy', own: false, at: ago(3 * DAY), text: 'Message trois.' },
          { author: 'Julie Martin', own: true, at: ago(2 * DAY), text: 'Message quatre.' },
          {
            author: 'Léa Roy',
            own: false,
            at: ago(2 * HOUR),
            text: 'Pouvez-vous m’envoyer le devis avant vendredi ?',
          },
        ],
      },
    ]);
  });

  it('recolle un long mail coupé en plusieurs tours, coupe son texte, et nomme l’auteur par son adresse faute de nom', async () => {
    const [julie] = await people();
    const long = Array.from({ length: 220 }, (_, i) => `Paragraphe ${i} `.padEnd(99, 'x')).join(
      '\n\n',
    );
    const last = received(ago(HOUR), long, { author: { name: null, email: 'Lea@Client.test' } });
    await mailThread(julie, 'Long mail', [last]);

    const [mail] = await readWaitingMails(julie, NOW);

    // Une adresse écrite avec des majuscules est la même correspondante.
    expect(mail).toMatchObject({ message: last.externalId, from: LEA });
    expect(mail?.messages).toHaveLength(1);
    expect(mail?.messages[0]?.author).toBe('Lea@Client.test');
    expect(mail?.messages[0]?.text).toHaveLength(1500);
    expect(mail?.messages[0]?.text.startsWith('Paragraphe 0 ')).toBe(true);
  });
});

describe('readWaitingMails : ce qui n’attend pas', () => {
  it('un fil où elle a écrit en dernier', async () => {
    const [julie] = await people();
    await mailThread(julie, 'Déjà répondu', [
      received(ago(2 * HOUR), 'Où en est le devis ?'),
      sent(ago(HOUR), 'Bonjour Léa,\nLe voici.'),
    ]);

    expect(await subjects(julie)).toEqual([]);
  });

  it('un mail qu’elle s’est envoyé : Outlook en garde une copie reçue, sous un autre identifiant et sans côté', async () => {
    const [julie] = await people();
    const note = 'Penser à rappeler le fournisseur.';
    await mailThread(
      julie,
      'Note pour moi',
      [
        sent(ago(2 * HOUR), note, [JULIE]),
        received(ago(2 * HOUR - 2000), note, { author: { name: 'Julie Martin', email: JULIE } }),
      ],
      { provider: 'outlook' },
    );

    expect(await subjects(julie)).toEqual([]);
  });

  it('un mail de sept jours ou plus', async () => {
    const [julie] = await people();
    await mailThread(julie, 'Trop vieux', [received(ago(7 * DAY + HOUR), 'Où en est le devis ?')]);
    await mailThread(julie, 'Encore frais', [received(ago(7 * DAY - HOUR), 'Et le contrat ?')]);

    expect(await subjects(julie)).toEqual(['Encore frais']);
  });

  it('un mail où elle n’est qu’en copie, ou qui ne lui est pas adressé', async () => {
    const [julie] = await people();
    await mailThread(julie, 'En copie', [
      received(ago(HOUR), 'Pour info.', { recipients: { to: [PAUL], cc: [JULIE] } }),
    ]);
    await mailThread(julie, 'À une liste', [
      received(ago(HOUR), 'À tous.', { recipients: { to: ['equipe@acme.test'], cc: [] } }),
    ]);
    await mailThread(julie, 'À elle et à Paul', [
      received(ago(HOUR), 'Qu’en pensez-vous ?', { recipients: { to: [PAUL, JULIE], cc: [] } }),
    ]);

    expect(await subjects(julie)).toEqual(['À elle et à Paul']);
  });

  it('un mail de quelqu’un à qui elle n’a pas écrit depuis 90 jours : lettre d’information, prospection, notification', async () => {
    const [julie] = await people();
    const from = (email: string) => ({ author: { name: 'Expéditeur', email } });
    // Elle a écrit à Marc il y a 91 jours, à Nina il y a 89 jours, et mis Omar en copie hier.
    await mailThread(julie, 'Ancien', [sent(ago(91 * DAY), 'Bonjour Marc.', ['marc@client.test'])]);
    await mailThread(julie, 'Récent', [sent(ago(89 * DAY), 'Bonjour Nina.', ['nina@client.test'])]);
    await mailThread(julie, 'Copie', [sent(ago(DAY), 'Bonjour Léa.', [LEA], ['omar@client.test'])]);
    await mailThread(julie, 'Lettre du mois', [
      received(ago(HOUR), 'Nos nouveautés.', from('lettre@editeur.test')),
    ]);
    await mailThread(julie, 'De Marc', [
      received(ago(2 * HOUR), 'Un point ?', from('marc@client.test')),
    ]);
    await mailThread(julie, 'De Nina', [
      received(ago(3 * HOUR), 'Un point ?', from('nina@client.test')),
    ]);
    await mailThread(julie, 'D’Omar', [
      received(ago(4 * HOUR), 'Un point ?', from('omar@client.test')),
    ]);
    await mailThread(julie, 'Sans adresse', [
      received(ago(5 * HOUR), 'Un point ?', { author: { name: 'Léa Roy', email: null } }),
    ]);

    expect(await subjects(julie)).toEqual(['De Nina', 'D’Omar']);
  });

  it('un mail déjà traité : un brouillon écrit, même écarté, ou un mail jugé sans réponse à donner', async () => {
    const [julie] = await people();
    const mails = {
      'Brouillon écrit': received(ago(HOUR), 'Où en est le devis ?'),
      'Brouillon écarté': received(ago(2 * HOUR), 'Et le contrat ?'),
      'Sans réponse': received(ago(3 * HOUR), 'Merci !'),
      'Pas encore traité': received(ago(4 * HOUR), 'Et la facture ?'),
    };
    const ids: Record<string, string> = {};
    for (const [title, mail] of Object.entries(mails))
      ids[title] = await mailThread(julie, title, [mail]);
    await adminPool.query(
      `insert into brouillons (tenant_id, user_id, source_id, message, texte, ecarte_le, acl)
       values ($1, $2, $3, $4, 'Bonjour Léa,', null, array[$2::uuid]),
              ($1, $2, $5, $6, 'Bonjour Léa,', now(), array[$2::uuid]),
              ($1, $2, $7, $8, null, null, array[$2::uuid])`,
      [
        julie.tenantId,
        julie.userId,
        ids['Brouillon écrit'],
        mails['Brouillon écrit'].externalId,
        ids['Brouillon écarté'],
        mails['Brouillon écarté'].externalId,
        ids['Sans réponse'],
        mails['Sans réponse'].externalId,
      ],
    );

    expect(await subjects(julie)).toEqual(['Pas encore traité']);

    // Un nouveau message dans un fil déjà traité attend à son tour : le résultat vaut pour un message, pas pour le fil.
    await extendThread(julie, ids['Sans réponse'] ?? '', [received(ago(HOUR / 2), 'Une relance.')]);

    expect(await subjects(julie)).toEqual(['Sans réponse', 'Pas encore traité']);
  });

  it('ce qui n’est pas un fil de courrier : une réunion de son agenda, une conversation d’un autre outil', async () => {
    const [julie] = await people();
    const meeting = normalizeItem(
      {
        externalId: 'event:1',
        nature: 'reunion',
        title: 'Point devis',
        url: null,
        updatedAt: ago(HOUR).toISOString(),
        origin: {},
        turns: [received(ago(HOUR), 'Début : 2026-11-17T09:00:00Z')],
      },
      'outlook',
    );
    if (!meeting) throw new Error('réunion de test refusée par la normalisation');
    const connection = {
      id: await seedConnection(julie, { provider: 'outlook' }),
      provider: 'outlook' as const,
      createdBy: julie.userId,
      privateRaw: true,
    };
    await ingestConnectorItems(julie, connection, [meeting]);
    await mailThread(julie, 'Visiteur du site', [received(ago(HOUR), 'Une question.')], {
      provider: 'crisp',
    });
    await mailThread(julie, 'Mail Outlook', [received(ago(HOUR), 'Une question.')], {
      provider: 'outlook',
    });

    expect(await subjects(julie)).toEqual(['Mail Outlook']);
  });
});

describe('readWaitingMails : ses seuls fils', () => {
  it('ni le fil d’un collègue, ni la boîte qu’il partage à l’équipe, ni une autre organisation', async () => {
    const [julie, paul, zoe] = await people();
    // Paul a écrit à Léa lui aussi, de son adresse.
    await mailThread(paul, 'Contact de Paul', [
      received(ago(9 * DAY), 'Bonjour Léa.', {
        author: { name: 'Paul Durand', email: PAUL },
        side: 'team',
        recipients: { to: [LEA], cc: [] },
      }),
    ]);
    const toPaul = { recipients: { to: [PAUL], cc: [] } };
    await mailThread(paul, 'Fil de Paul', [received(ago(HOUR), 'Paul, un point ?', toPaul)]);
    // Dans la boîte que Paul partage à l'équipe, un mail adressé à Julie : elle le voit, ce n'est pas son fil.
    await mailThread(paul, 'Boîte partagée', [received(ago(2 * HOUR), 'Julie, un point ?')], {
      shared: true,
    });
    await mailThread(julie, 'Fil de Julie', [received(ago(3 * HOUR), 'Julie, un point ?')]);

    expect(await subjects(julie)).toEqual(['Fil de Julie']);
    expect(await subjects(paul)).toEqual(['Fil de Paul']);
    expect(await subjects(zoe)).toEqual([]);
    const visible = await withTenant(julie, (tx) =>
      tx.select({ title: sources.title }).from(sources),
    );
    expect(visible.map((source) => source.title)).toContain('Boîte partagée');
  });
});

describe('readWaitingMails : l’ordre et le plafond', () => {
  it('rend les cinq plus récents, le plus récent d’abord', async () => {
    const [julie] = await people();
    for (const hours of [3, 1, 7, 5, 2, 6, 4])
      await mailThread(julie, `Reçu il y a ${hours} h`, [
        received(ago(hours * HOUR), 'Un point ?'),
      ]);

    expect(await subjects(julie)).toEqual([1, 2, 3, 4, 5].map((hours) => `Reçu il y a ${hours} h`));
  });
});

// Les mails d'inconnus : Inès Garnier n'a jamais reçu de mail de Julie. Ses mails sont marqués « pas automatique » à la
// relève, sauf mention contraire.
const INES = { name: 'Inès Garnier', email: 'ines@inconnue.test' };
const fromStranger = (at: Date, text = 'Bonjour, je me permets de vous écrire.', over = {}) =>
  received(at, text, { author: INES, automated: false, ...over });
const strangers = async (ctx: TenantContext, max = 5) =>
  (await readUnknownMails(ctx, max, NOW)).map((mail) => mail.from);
const unknownSubjects = async (ctx: TenantContext) => {
  const { rows } = await adminPool.query<{ id: string; title: string }>(
    'select id, title from sources where owner_user_id = $1',
    [ctx.userId],
  );
  const titles = new Map(rows.map((row) => [row.id, row.title]));
  return (await readUnknownMails(ctx, 5, NOW)).map((mail) => titles.get(mail.sourceId));
};

describe('readUnknownMails : le mail d’un inconnu qui attend', () => {
  it('rend son fil, son message, son auteur et sa date : rien de son texte ; à défaut de nom, son adresse', async () => {
    const [julie] = await people();
    const mail = fromStranger(ago(2 * HOUR), 'Pourriez-vous me rappeler ?');
    const sourceId = await mailThread(julie, 'Partenariat', [mail]);
    const noName = fromStranger(ago(3 * HOUR), 'Bonjour.', {
      author: { name: null, email: 'Hugo@Inconnu.test' },
    });
    await mailThread(julie, 'Sans nom', [noName]);

    const found = await readUnknownMails(julie, 5, NOW);

    expect(found).toEqual([
      { sourceId, message: mail.externalId, from: 'Inès Garnier', receivedAt: ago(2 * HOUR) },
      {
        sourceId: expect.any(String),
        message: noName.externalId,
        from: 'Hugo@Inconnu.test',
        receivedAt: ago(3 * HOUR),
      },
    ]);
    expect(JSON.stringify(found)).not.toMatch(/rappeler|Bonjour/);
  });

  it('rend les plus récents d’abord, autant qu’on en demande', async () => {
    const [julie] = await people();
    for (const hours of [3, 1, 4, 2])
      await mailThread(julie, `Reçu il y a ${hours} h`, [fromStranger(ago(hours * HOUR))]);

    expect(await unknownSubjects(julie)).toEqual(
      [1, 2, 3, 4].map((hours) => `Reçu il y a ${hours} h`),
    );
    expect(await strangers(julie, 3)).toHaveLength(3);
  });
});

describe('readUnknownMails : ce qui n’en est pas un', () => {
  it('un fil où elle a répondu en dernier, un mail de sept jours ou plus', async () => {
    const [julie] = await people();
    // Hugo lui a écrit, elle a répondu : il est désormais un correspondant, et son fil n'attend plus rien.
    const hugo = { name: 'Hugo Blanc', email: 'hugo@inconnu.test' };
    await mailThread(julie, 'Déjà répondu', [
      fromStranger(ago(2 * HOUR), 'Bonjour.', { author: hugo }),
      sent(ago(HOUR), 'Bonjour Hugo,\nAvec plaisir.', [hugo.email]),
    ]);
    await mailThread(julie, 'Trop vieux', [fromStranger(ago(7 * DAY + HOUR))]);
    await mailThread(julie, 'Encore frais', [fromStranger(ago(7 * DAY - HOUR))]);

    expect(await unknownSubjects(julie)).toEqual(['Encore frais']);
  });

  it('un mail où elle n’est qu’en copie, ou qui ne lui est pas adressé', async () => {
    const [julie] = await people();
    await mailThread(julie, 'En copie', [
      fromStranger(ago(HOUR), 'Pour info.', { recipients: { to: [PAUL], cc: [JULIE] } }),
    ]);
    await mailThread(julie, 'À une liste', [
      fromStranger(ago(HOUR), 'À tous.', { recipients: { to: ['equipe@acme.test'], cc: [] } }),
    ]);
    await mailThread(julie, 'À elle et à Paul', [
      fromStranger(ago(HOUR), 'Bonjour.', { recipients: { to: [PAUL, JULIE], cc: [] } }),
    ]);

    expect(await unknownSubjects(julie)).toEqual(['À elle et à Paul']);
  });

  it('un envoi automatique, ou un tour au fait inconnu : relevé avant, ou par Outlook', async () => {
    const [julie] = await people();
    await mailThread(julie, 'Lettre du mois', [
      fromStranger(ago(HOUR), 'Nos nouveautés.', { automated: true }),
    ]);
    await mailThread(julie, 'Relevé avant', [
      fromStranger(ago(2 * HOUR), 'Bonjour.', { automated: undefined }),
    ]);
    await mailThread(
      julie,
      'Mail Outlook',
      [fromStranger(ago(3 * HOUR), 'Bonjour.', { automated: undefined })],
      {
        provider: 'outlook',
      },
    );
    await mailThread(julie, 'Une personne', [fromStranger(ago(4 * HOUR))]);

    expect(await unknownSubjects(julie)).toEqual(['Une personne']);
  });

  it('un mail sans adresse d’auteur : la réponse n’irait nulle part', async () => {
    const [julie] = await people();
    await mailThread(julie, 'Sans adresse', [
      fromStranger(ago(HOUR), 'Bonjour.', { author: { name: 'Inès Garnier', email: null } }),
    ]);

    expect(await strangers(julie)).toEqual([]);
  });

  it('un mail déjà traité : son oui, son non, ou une ligne écartée ; un nouveau message dans le fil attend à son tour', async () => {
    const [julie] = await people();
    const mails = {
      Oui: fromStranger(ago(HOUR)),
      Non: fromStranger(ago(2 * HOUR)),
      Écarté: fromStranger(ago(3 * HOUR)),
      'Pas encore traité': fromStranger(ago(4 * HOUR)),
    };
    const ids: Record<string, string> = {};
    for (const [title, mail] of Object.entries(mails))
      ids[title] = await mailThread(julie, title, [mail]);
    await adminPool.query(
      `insert into brouillons (tenant_id, user_id, source_id, message, indications, ecarte_le, acl)
       values ($1, $2, $3, $4, 'Dites-lui oui.', null, array[$2::uuid]),
              ($1, $2, $5, $6, null, null, array[$2::uuid]),
              ($1, $2, $7, $8, '', now(), array[$2::uuid])`,
      [
        julie.tenantId,
        julie.userId,
        ids.Oui,
        mails.Oui.externalId,
        ids.Non,
        mails.Non.externalId,
        ids.Écarté,
        mails.Écarté.externalId,
      ],
    );

    expect(await unknownSubjects(julie)).toEqual(['Pas encore traité']);

    await extendThread(julie, ids.Non ?? '', [fromStranger(ago(HOUR / 2), 'Une relance.')]);
    expect(await unknownSubjects(julie)).toEqual(['Non', 'Pas encore traité']);
  });
});

describe('readUnknownMails : le complément exact des mails qui attendent', () => {
  it('un mail est soit d’un correspondant, soit d’un inconnu, jamais les deux, et rien ne se perd entre les deux', async () => {
    const [julie] = await people();
    const from = (email: string) => ({ author: { name: email, email }, automated: false });
    // Elle a écrit à Marc il y a 91 jours, à Nina il y a 89 jours, et mis Omar en copie hier ; jamais à Inès.
    await mailThread(julie, 'Ancien', [sent(ago(91 * DAY), 'Bonjour Marc.', ['marc@client.test'])]);
    await mailThread(julie, 'Récent', [sent(ago(89 * DAY), 'Bonjour Nina.', ['nina@client.test'])]);
    await mailThread(julie, 'Copie', [sent(ago(DAY), 'Bonjour Léa.', [LEA], ['omar@client.test'])]);
    for (const [hours, email] of [
      [1, LEA],
      [2, 'marc@client.test'],
      [3, 'nina@client.test'],
      [4, 'omar@client.test'],
      [5, INES.email],
    ] as const)
      await mailThread(julie, email, [received(ago(hours * HOUR), 'Un point ?', from(email))]);

    const known = await subjects(julie);
    const unknown = await unknownSubjects(julie);

    expect(known).toEqual([LEA, 'nina@client.test', 'omar@client.test']);
    expect(unknown).toEqual(['marc@client.test', INES.email]);
    expect([...known, ...unknown].sort()).toEqual(
      [LEA, 'marc@client.test', 'nina@client.test', 'omar@client.test', INES.email].sort(),
    );
  });
});

describe('readUnknownMails : ses seuls fils', () => {
  it('ni le fil d’un collègue, ni la boîte qu’il partage à l’équipe, ni une autre organisation', async () => {
    const [julie, paul, zoe] = await people();
    await mailThread(paul, 'Contact de Paul', [
      received(ago(9 * DAY), 'Bonjour Léa.', {
        author: { name: 'Paul Durand', email: PAUL },
        side: 'team',
        recipients: { to: [LEA], cc: [] },
      }),
    ]);
    const toPaul = { recipients: { to: [PAUL], cc: [] } };
    await mailThread(paul, 'Fil de Paul', [fromStranger(ago(HOUR), 'Paul, un point ?', toPaul)]);
    // Dans la boîte que Paul partage à l'équipe, un mail adressé à Julie : elle le voit, ce n'est pas son fil.
    await mailThread(paul, 'Boîte partagée', [fromStranger(ago(2 * HOUR), 'Julie, un point ?')], {
      shared: true,
    });
    await mailThread(julie, 'Fil de Julie', [fromStranger(ago(3 * HOUR), 'Julie, un point ?')]);

    expect(await unknownSubjects(julie)).toEqual(['Fil de Julie']);
    expect(await unknownSubjects(paul)).toEqual(['Fil de Paul']);
    expect(await strangers(zoe)).toEqual([]);
  });
});

import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { linesOf } from '@/lib/fiche-view';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { lignesFiche } from '@/server/db/schema/portrait';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { seedRun } from '@/test/seed-search';
import { type FicheLine, readFiche, retireLine } from './fiche';
import { answerProposal } from './propositions';
import { getFicheBoss } from './queue';
import { readFicheScreen, readHomeBrouillons } from './screen';

// La fiche telle que l'écran « Ma fiche » la reçoit, sous les droits de la personne : son rôle et ses tâches, où en est
// sa construction, et les sources de ses tâches qu'elle voit encore. Et ce que l'accueil reçoit de l'agent « Brouillons
// de réponse ». Aucune construction n'est demandée ici : la file est lue, vide (l'état
// « en cours » se teste avec elle, queue.db.test.ts). Données inventées : Julie et Paul dans une organisation, Zoé dans
// une autre.

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from connections where tenant_id = any($1)', [tenantIds]);
  await (await getFicheBoss()).stop();
});

async function people(): Promise<[TenantContext, TenantContext, TenantContext]> {
  const team = await createTestTenant(['Julie Martin', 'Paul Durand']);
  const other = await createTestTenant(['Zoé Bernard']);
  tenantIds.push(team.tenantId, other.tenantId);
  return [...team.members, ...other.members] as [TenantContext, TenantContext, TenantContext];
}

// Une ligne de sa fiche, comme la construction (« calcul ») ou la synthèse l'écrivent.
async function seedLine(
  ctx: TenantContext,
  line: Pick<FicheLine, 'genre' | 'cle' | 'valeur'>,
): Promise<void> {
  await adminDb.insert(lignesFiche).values({
    ...line,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    provenance: line.genre === 'role' || line.genre === 'tache' ? 'synthese' : 'calcul',
    mails: line.genre === 'role' || line.genre === 'tache' ? null : 12,
    acl: [ctx.userId],
  });
}
const RYTHME = { genre: 'rythme' as const, cle: '', valeur: { mailsParSemaine: 12 } };
const ROLE = { genre: 'role' as const, cle: '', valeur: { texte: 'Commerciale.' } };
const side = { medianeMinutes: 42, reponses: 3 };
const DELAI = {
  genre: 'delai-reponse' as const,
  cle: '',
  valeur: { tous: side, interne: side, externe: side },
};

// Sa boîte Gmail branchée par elle et une fiche qui compte une réponse : l'agent « Brouillons de réponse » lui est
// proposé, et elle lui a répondu.
async function answered(ctx: TenantContext, oui = true): Promise<void> {
  await seedConnection(ctx, { provider: 'gmail' });
  await seedLine(ctx, DELAI);
  await adminPool.query(
    `insert into reponses_agent (tenant_id, user_id, agent, oui, acl)
     values ($1, $2, 'brouillon-reponse', $3, array[$2::uuid])`,
    [ctx.tenantId, ctx.userId, oui],
  );
}

describe('readFicheScreen : où en est la fiche', () => {
  it('sans fiche ni boîte à elle, il lui faut une boîte : celle d’un collègue ou un autre outil ne comptent pas', async () => {
    const [julie, paul] = await people();
    expect(await readFicheScreen(julie)).toEqual({
      etat: 'sans-boite',
      lines: [],
      sources: {},
      agents: [],
    });

    await seedConnection(paul, { provider: 'gmail' });
    await seedConnection(julie, { provider: 'notion' });

    expect((await readFicheScreen(julie)).etat).toBe('sans-boite');
  });

  it.each(['gmail', 'outlook'] as const)(
    'sans fiche, avec sa boîte %s branchée, la fiche est à construire',
    async (provider) => {
      const [julie] = await people();
      await seedConnection(julie, { provider });

      expect((await readFicheScreen(julie)).etat).toBe('a-construire');
    },
  );

  it('des mesures calculées sans rôle ni tâche : la fiche reste à compléter, et les mesures ne partent pas vers l’écran', async () => {
    const [julie] = await people();
    await seedLine(julie, RYTHME);

    expect(await readFicheScreen(julie)).toEqual({
      etat: 'a-completer',
      lines: [],
      sources: {},
      agents: [],
    });
  });

  it('l’écran ne reçoit que son rôle et ses tâches : les mesures restent en base', async () => {
    const [julie] = await people();
    await seedLine(julie, RYTHME);
    await seedLine(julie, ROLE);

    expect((await readFicheScreen(julie)).lines.map((line) => line.genre)).toEqual(['role']);
    expect((await readFiche(julie)).map((line) => line.genre).sort()).toEqual(['role', 'rythme']);
  });

  it('une fois le rôle écrit, même retiré depuis, la fiche est faite', async () => {
    const [julie] = await people();
    await seedConnection(julie, { provider: 'gmail' });
    await seedLine(julie, RYTHME);
    await seedLine(julie, ROLE);
    expect((await readFicheScreen(julie)).etat).toBe('faite');

    const role = (await readFiche(julie)).find((line) => line.genre === 'role');
    await retireLine(julie, role?.id ?? '');

    // Sa boîte et la mesure de son rythme lui valent des propositions (propositions.db.test.ts) : pas le sujet ici.
    expect(await readFicheScreen(julie)).toMatchObject({ etat: 'faite', lines: [], sources: {} });
  });

  it('la fiche d’un collègue ne change rien à la sienne', async () => {
    const [julie, paul] = await people();
    await seedLine(paul, ROLE);

    expect(await readFicheScreen(julie)).toEqual({
      etat: 'sans-boite',
      lines: [],
      sources: {},
      agents: [],
    });
  });
});

describe('readFicheScreen : les agents proposés', () => {
  it('l’écran reçoit les agents proposés d’après sa fiche entière, avec sa réponse, sans la mesure qui les propose', async () => {
    const [julie, paul] = await people();
    await seedConnection(julie, { provider: 'gmail' });
    await seedConnection(paul, { provider: 'fathom' });
    await seedLine(julie, RYTHME);
    await seedLine(julie, ROLE);
    await answerProposal(julie, 'relance', false);

    const screen = await readFicheScreen(julie);

    expect(screen.agents).toEqual([
      { agent: 'relance', oui: false, enService: false },
      { agent: 'point-du-jour', oui: null, enService: false },
    ]);
    expect(screen.lines.map((line) => line.genre)).toEqual(['role']);
  });
});

// Un fil de courrier de la personne, son dernier message reçu de Léa, et le brouillon qui y répond, ou les questions
// de Leon avant de l'écrire.
async function seedBrouillon(
  ctx: TenantContext,
  title: string,
  hoursAgo: number,
  over: {
    texte?: string | null;
    ecarte?: boolean;
    depot?: string;
    questions?: string[];
    choix?: string[][];
    reponses?: string[];
  } = {},
): Promise<{ sourceId: string; receivedAt: Date }> {
  const receivedAt = new Date(Date.now() - hoursAgo * 3_600_000);
  const { sourceId } = await seedRun(ctx, {
    kind: 'gmail',
    title,
    metadata: { nature: 'fil', url: `https://mail.google.test/${hoursAgo}` },
    turns: [
      {
        text: 'Bonjour Julie, et le devis ?',
        ts: receivedAt,
        role: 'participant',
        authorName: 'Léa Roy',
        authorEmail: 'lea@client.test',
      },
    ],
    lastTurnAt: receivedAt,
  });
  // L'identifiant d'un tour de courrier, comme la relève l'écrit.
  await adminPool.query(
    "update turns set external_id = 'message:42#0123456789ab' where source_id = $1",
    [sourceId],
  );
  await adminPool.query(
    `insert into brouillons
       (tenant_id, user_id, source_id, message, texte, ecarte_le, brouillon_gmail, questions, reponses, choix, acl)
     values ($1, $2, $3, 'message:42', $4, $5, $6, $7, $8, $9, array[$2::uuid])`,
    [
      ctx.tenantId,
      ctx.userId,
      sourceId,
      over.texte === undefined ? `Brouillon pour ${title}.` : over.texte,
      over.ecarte ? new Date() : null,
      over.depot ?? null,
      over.questions ?? null,
      over.reponses ?? null,
      over.choix ? JSON.stringify(over.choix) : null,
    ],
  );
  return { sourceId, receivedAt };
}
// Elle répond elle-même dans le fil : il a bougé.
const reply = (sourceId: string) =>
  adminPool.query(
    `insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, author_side, acl)
     select tenant_id, id, 'message:43#0123456789ab', 'participant', 'Bonjour Léa.', now(), 'connector',
            'team', acl
     from sources where id = $1`,
    [sourceId],
  );

describe('readFicheScreen : « Ma fiche » ne lit plus ses brouillons de réponse', () => {
  it('un brouillon prêt, une demande de Leon : rien n’en part vers l’écran des réglages, tout part vers l’accueil', async () => {
    const [julie] = await people();
    await answered(julie);
    await seedBrouillon(julie, 'Brouillon prêt', 1);
    await seedBrouillon(julie, 'Demande', 2, { texte: null, questions: ['Mardi ?'] });

    const screen = await readFicheScreen(julie);

    expect(Object.keys(screen).sort()).toEqual(['agents', 'etat', 'lines', 'sources']);
    // Ni le texte d'un brouillon, ni une question, ni leur fil parmi les sources des tâches.
    expect(JSON.stringify(screen)).not.toMatch(/Brouillon pour|Mardi|mail\.google\.test/);
    expect(screen.sources).toEqual({});
    const home = await readHomeBrouillons(julie);
    expect(home.prets.map((one) => one.source.title)).toEqual(['Brouillon prêt']);
    expect(home.demandes.map((one) => one.source.title)).toEqual(['Demande']);
  });
});

describe('readHomeBrouillons : ce que l’agent « Brouillons de réponse » a pour elle, pour l’accueil', () => {
  const QUESTIONS = ['Acceptez-vous le rendez-vous de mardi ?', 'Quel prix lui annoncer ?'];
  const CHOIX = [
    ['Oui', 'Non, proposer jeudi'],
    ['1 200 €', '1 500 €', 'Le tarif habituel'],
  ];
  const asked = (ctx: TenantContext, title: string, hoursAgo: number, over = {}) =>
    seedBrouillon(ctx, title, hoursAgo, {
      texte: null,
      questions: QUESTIONS,
      choix: CHOIX,
      ...over,
    });
  // Les objets des fils montrés, de chaque sorte.
  const titles = async (ctx: TenantContext) => {
    const { demandes, prets } = await readHomeBrouillons(ctx);
    return {
      demandes: demandes.map((one) => one.source.title),
      prets: prets.map((one) => one.source.title),
    };
  };
  const NOTHING = { demandes: [], prets: [] };

  it('l’accueil reçoit, pour chaque demande, le correspondant, le fil lié à son outil, la date du mail reçu, les questions avec leurs choix, et si elle y a répondu : rien d’autre', async () => {
    const [julie, paul] = await people();
    await answered(julie);
    await answered(paul);
    const older = await asked(julie, 'Contrat', 5);
    const recent = await asked(julie, 'Devis 2027', 2, {
      questions: ['Mardi ?'],
      choix: [['Oui', 'Non']],
    });
    // Elle a répondu : la demande reste, le temps que Leon écrive. Ses réponses ne partent pas vers l'accueil.
    const replied = await asked(julie, 'Répondue', 1, { reponses: ['Jeudi à 10 h.', ''] });
    // Ce qui ne se montre pas : écartée, ou un mail sans réponse à donner.
    await asked(julie, 'Écartée', 1, { ecarte: true });
    await seedBrouillon(julie, 'Sans réponse', 1, { texte: null });
    await asked(paul, 'Fil de Paul', 1);

    const home = await readHomeBrouillons(julie);

    // La plus récente d'abord. Ni l'identifiant du fil, ni celui du message, ni une adresse, ni ses réponses.
    expect(home).toEqual({
      demandes: [
        {
          id: expect.any(String),
          from: 'Léa Roy',
          receivedAt: replied.receivedAt,
          questions: QUESTIONS,
          choix: CHOIX,
          repondue: true,
          source: { title: 'Répondue', url: 'https://mail.google.test/1', kind: 'gmail' },
        },
        {
          id: expect.any(String),
          from: 'Léa Roy',
          receivedAt: recent.receivedAt,
          questions: ['Mardi ?'],
          choix: [['Oui', 'Non']],
          repondue: false,
          source: { title: 'Devis 2027', url: 'https://mail.google.test/2', kind: 'gmail' },
        },
        {
          id: expect.any(String),
          from: 'Léa Roy',
          receivedAt: older.receivedAt,
          questions: QUESTIONS,
          choix: CHOIX,
          repondue: false,
          source: { title: 'Contrat', url: 'https://mail.google.test/5', kind: 'gmail' },
        },
      ],
      prets: [],
    });
    expect(JSON.stringify(home)).not.toMatch(/message:|lea@client\.test|Jeudi à 10 h/);
    expect(JSON.stringify(home)).not.toContain(recent.sourceId);
    expect(await titles(paul)).toEqual({ demandes: ['Fil de Paul'], prets: [] });
  });

  it('une demande posée avant les choix garde ses questions, sans choix à proposer', async () => {
    const [julie] = await people();
    await answered(julie);
    await asked(julie, 'Ancienne demande', 1, { choix: undefined });

    expect((await readHomeBrouillons(julie)).demandes).toMatchObject([
      { questions: QUESTIONS, choix: [[], []], repondue: false },
    ]);
  });

  it('l’accueil reçoit, pour chaque brouillon prêt, le correspondant, le fil lié à son outil, la date du mail reçu, le texte, et s’il est déposé dans Gmail : rien d’autre', async () => {
    const [julie, paul] = await people();
    await answered(julie);
    await answered(paul);
    const older = await seedBrouillon(julie, 'Contrat', 5, { depot: 'r-contrat-1789' });
    const recent = await seedBrouillon(julie, 'Devis 2027', 2);
    // Écrit avec ses réponses : un brouillon prêt comme un autre, plus une demande.
    await asked(julie, 'Écrit au second appel', 6, {
      texte: 'Bonjour Léa,\n\nJeudi me convient.',
      reponses: ['Jeudi.', ''],
    });
    await seedBrouillon(julie, 'Écarté', 1, { ecarte: true });
    await seedBrouillon(julie, 'Sans réponse', 1, { texte: null });
    await seedBrouillon(paul, 'Fil de Paul', 1);

    const home = await readHomeBrouillons(julie);

    // Le mail le plus récent d'abord. Ni l'identifiant du fil, ni celui du message, ni une adresse ; un oui ou un non
    // pour le dépôt, jamais l'identifiant du brouillon Gmail.
    expect(home).toEqual({
      demandes: [],
      prets: [
        {
          id: expect.any(String),
          from: 'Léa Roy',
          receivedAt: recent.receivedAt,
          texte: 'Brouillon pour Devis 2027.',
          depose: false,
          source: { title: 'Devis 2027', url: 'https://mail.google.test/2', kind: 'gmail' },
        },
        {
          id: expect.any(String),
          from: 'Léa Roy',
          receivedAt: older.receivedAt,
          texte: 'Brouillon pour Contrat.',
          depose: true,
          source: { title: 'Contrat', url: 'https://mail.google.test/5', kind: 'gmail' },
        },
        {
          id: expect.any(String),
          from: 'Léa Roy',
          receivedAt: expect.any(Date),
          texte: 'Bonjour Léa,\n\nJeudi me convient.',
          depose: false,
          source: {
            title: 'Écrit au second appel',
            url: 'https://mail.google.test/6',
            kind: 'gmail',
          },
        },
      ],
    });
    expect(JSON.stringify(home)).not.toMatch(/message:|lea@client\.test|r-contrat-1789/);
    expect(JSON.stringify(home)).not.toContain(recent.sourceId);
    expect(await titles(paul)).toEqual({ demandes: [], prets: ['Fil de Paul'] });
  });

  it('trois au plus de chaque sorte, les plus récents d’abord ; sans rien pour elle, rien', async () => {
    const [julie, paul] = await people();
    await answered(julie);
    await answered(paul);
    for (const hours of [4, 1, 3, 2]) await asked(julie, `Demande ${hours}`, hours);
    for (const hours of [8, 5, 7, 6]) await seedBrouillon(julie, `Prêt ${hours}`, hours);

    expect(await titles(julie)).toEqual({
      demandes: ['Demande 1', 'Demande 2', 'Demande 3'],
      prets: ['Prêt 5', 'Prêt 6', 'Prêt 7'],
    });
    expect(await readHomeBrouillons(paul)).toEqual(NOTHING);
  });

  it('parmi les trois demandes, celles qui attendent sa réponse passent avant celles où Leon écrit, même sur des mails plus récents', async () => {
    const [julie] = await people();
    await answered(julie);
    for (const hours of [1, 2, 3])
      await asked(julie, `Répondue ${hours}`, hours, { reponses: ['Oui.', ''] });
    for (const hours of [5, 4]) await asked(julie, `Demande ${hours}`, hours);

    // Les deux qui attendent un geste d'elle, puis la plus récente de celles où Leon écrit ; montrées par date du mail.
    expect((await titles(julie)).demandes).toEqual(['Répondue 1', 'Demande 4', 'Demande 5']);
  });

  it('sans son oui à l’agent, ou quand il ne lui est plus proposé, rien ne part vers l’accueil ; un nouveau oui remontre tout', async () => {
    const [julie, paul] = await people();
    await answered(julie, false);
    await asked(julie, 'Devis', 1);
    await asked(julie, 'Répondue', 2, { reponses: ['Oui.', ''] });
    await seedBrouillon(julie, 'Prêt', 3);
    // Paul n'a jamais répondu à l'agent, qui ne lui est pas proposé.
    await asked(paul, 'Jamais répondu', 1);
    await seedBrouillon(paul, 'Jamais répondu non plus', 2);

    expect(await readHomeBrouillons(julie)).toEqual(NOTHING);
    expect(await readHomeBrouillons(paul)).toEqual(NOTHING);

    await adminPool.query('update reponses_agent set oui = true where user_id = $1', [
      julie.userId,
    ]);
    expect(await titles(julie)).toEqual({ demandes: ['Devis', 'Répondue'], prets: ['Prêt'] });

    // Sa boîte débranchée : son oui ne suffit plus.
    await adminPool.query('delete from connections where created_by = $1', [julie.userId]);
    expect(await readHomeBrouillons(julie)).toEqual(NOTHING);
  });

  it('une ligne dont le fil a bougé ou a disparu ne se montre plus, ni la demande d’un mail de plus de trente jours, répondue ou non', async () => {
    const [julie] = await people();
    await answered(julie);
    const moved = await asked(julie, 'Elle a répondu dans le fil', 3);
    const gone = await asked(julie, 'Fil supprimé', 2);
    await asked(julie, 'Intacte', 1);
    // Trop ancien pour le second appel : ses réponses ne feraient plus rien écrire, et Leon n'écrit plus.
    await asked(julie, 'Trop ancien', 31 * 24);
    await asked(julie, 'Trop ancien, répondue', 31 * 24, { reponses: ['Oui.', ''] });
    await asked(julie, 'Encore à temps', 29 * 24, { reponses: ['Oui.', ''] });
    const movedDraft = await seedBrouillon(julie, 'Brouillon, fil qui a bougé', 3);
    const goneDraft = await seedBrouillon(julie, 'Brouillon, fil supprimé', 2);
    await seedBrouillon(julie, 'Brouillon intact', 1);
    for (const one of [moved, movedDraft]) await reply(one.sourceId);
    await adminPool.query('delete from sources where id = any($1)', [
      [gone.sourceId, goneDraft.sourceId],
    ]);

    expect(await titles(julie)).toEqual({
      demandes: ['Intacte', 'Encore à temps'],
      prets: ['Brouillon intact'],
    });
  });

  it('rien de ce que l’agent a pour une personne ne part vers l’accueil d’un collègue, de son manager avec la vue de l’équipe, ni d’une autre organisation', async () => {
    const [julie, paul, zoe] = await people();
    for (const ctx of [julie, paul, zoe]) await answered(ctx);
    await asked(julie, 'Devis', 1);
    await asked(julie, 'Répondue', 2, { reponses: ['Oui.', ''] });
    await seedBrouillon(julie, 'Prêt', 3);

    for (const ctx of [paul, { ...paul, equipe: true }, zoe])
      expect(await readHomeBrouillons(ctx)).toEqual(NOTHING);
  });
});

describe('readFicheScreen : les sources d’une tâche, sous ses droits', () => {
  it('ne rend que les sources qu’elle voit encore : ni supprimée, ni devenue invisible, ni d’une autre organisation', async () => {
    const [julie, paul, zoe] = await people();
    const mine = await seedRun(julie, {
      kind: 'hubspot',
      title: 'Demande de devis',
      metadata: { url: 'https://app.hubspot.test/deal/1' },
    });
    const shared = await seedRun(paul, {
      kind: 'notion',
      title: 'Modèle de devis',
      acl: [paul.tenantId],
    });
    const deleted = await seedRun(julie, { kind: 'hubspot', title: 'Fiche supprimée' });
    const hidden = await seedRun(julie, { kind: 'gmail', title: 'Fil repris par Paul' });
    const foreign = await seedRun(zoe, { kind: 'notion', title: 'Page de Zoé' });
    await seedLine(julie, {
      genre: 'tache',
      cle: '1',
      valeur: {
        titre: 'Envoyer les devis',
        detail: 'Un client demande un prix.',
        sources: [mine, shared, deleted, hidden, foreign].map((run) => run.sourceId),
      },
    });
    await adminDb.delete(sources).where(eq(sources.id, deleted.sourceId));
    await adminDb
      .update(sources)
      .set({ acl: [paul.userId] })
      .where(eq(sources.id, hidden.sourceId));

    const screen = await readFicheScreen(julie);

    expect(screen.sources).toEqual({
      [mine.sourceId]: {
        title: 'Demande de devis',
        url: 'https://app.hubspot.test/deal/1',
        kind: 'hubspot',
      },
      [shared.sourceId]: { title: 'Modèle de devis', url: null, kind: 'notion' },
    });
    // La ligne garde ses cinq sources : c'est l'écran qui ne compte que celles-là.
    expect(linesOf(screen.lines, 'tache')[0]?.valeur.sources).toHaveLength(5);
  });
});

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
import { readFicheScreen } from './screen';

// La fiche telle que l'écran « Ma fiche » la reçoit, sous les droits de la personne : son rôle et ses tâches, où en est
// sa construction, et les sources de ses tâches qu'elle voit encore. Aucune construction n'est demandée ici : la file est lue, vide (l'état
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
    mails: line.genre === 'rythme' ? 12 : null,
    acl: [ctx.userId],
  });
}
const RYTHME = { genre: 'rythme' as const, cle: '', valeur: { mailsParSemaine: 12 } };
const ROLE = { genre: 'role' as const, cle: '', valeur: { texte: 'Commerciale.' } };

describe('readFicheScreen : où en est la fiche', () => {
  it('sans fiche ni boîte à elle, il lui faut une boîte : celle d’un collègue ou un autre outil ne comptent pas', async () => {
    const [julie, paul] = await people();
    expect(await readFicheScreen(julie)).toEqual({
      etat: 'sans-boite',
      lines: [],
      sources: {},
      agents: [],
      brouillons: [],
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
      brouillons: [],
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
      brouillons: [],
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

describe('readFicheScreen : les brouillons prêts', () => {
  // Un fil de courrier de la personne, son dernier message reçu de Léa, et le brouillon qui y répond.
  async function seedBrouillon(
    ctx: TenantContext,
    title: string,
    hoursAgo: number,
    over: { texte?: string | null; ecarte?: boolean } = {},
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
      `insert into brouillons (tenant_id, user_id, source_id, message, texte, ecarte_le, acl)
       values ($1, $2, $3, 'message:42', $4, $5, array[$2::uuid])`,
      [
        ctx.tenantId,
        ctx.userId,
        sourceId,
        over.texte === undefined ? `Brouillon pour ${title}.` : over.texte,
        over.ecarte ? new Date() : null,
      ],
    );
    return { sourceId, receivedAt };
  }

  it('l’écran reçoit, pour chacun, le correspondant, le fil lié à son outil, la date du mail reçu et le texte : rien d’autre', async () => {
    const [julie, paul] = await people();
    const older = await seedBrouillon(julie, 'Contrat', 5);
    const recent = await seedBrouillon(julie, 'Devis 2027', 2);
    await seedBrouillon(julie, 'Écarté', 1, { ecarte: true });
    await seedBrouillon(julie, 'Sans réponse', 1, { texte: null });
    await seedBrouillon(paul, 'Fil de Paul', 1);

    const screen = await readFicheScreen(julie);

    // Le mail le plus récent d'abord. Ni l'identifiant du fil, ni celui du message, ni une adresse.
    expect(screen.brouillons).toEqual([
      {
        id: expect.any(String),
        from: 'Léa Roy',
        receivedAt: recent.receivedAt,
        texte: 'Brouillon pour Devis 2027.',
        source: { title: 'Devis 2027', url: 'https://mail.google.test/2', kind: 'gmail' },
      },
      {
        id: expect.any(String),
        from: 'Léa Roy',
        receivedAt: older.receivedAt,
        texte: 'Brouillon pour Contrat.',
        source: { title: 'Contrat', url: 'https://mail.google.test/5', kind: 'gmail' },
      },
    ]);
    expect(JSON.stringify(screen.brouillons)).not.toMatch(/message:|lea@client\.test/);
    expect(JSON.stringify(screen.brouillons)).not.toContain(recent.sourceId);
    // Les fils des brouillons ne se mêlent pas aux sources des tâches.
    expect(screen.sources).toEqual({});
    expect((await readFicheScreen(paul)).brouillons.map((one) => one.texte)).toEqual([
      'Brouillon pour Fil de Paul.',
    ]);
  });

  it('un brouillon dont le fil a bougé ou a disparu ne part pas vers l’écran', async () => {
    const [julie] = await people();
    const moved = await seedBrouillon(julie, 'Elle a répondu', 3);
    const gone = await seedBrouillon(julie, 'Fil supprimé', 2);
    await seedBrouillon(julie, 'Intact', 1);
    await adminPool.query(
      `insert into turns (tenant_id, source_id, external_id, role, text, ts, capture_mode, author_side, acl)
       select tenant_id, id, 'message:43#0123456789ab', 'participant', 'Bonjour Léa.', now(), 'connector',
              'team', acl
       from sources where id = $1`,
      [moved.sourceId],
    );
    await adminPool.query('delete from sources where id = $1', [gone.sourceId]);

    const screen = await readFicheScreen(julie);

    expect(screen.brouillons.map((one) => one.source.title)).toEqual(['Intact']);
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

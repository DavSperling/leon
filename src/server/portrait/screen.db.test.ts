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
      { agent: 'relance', oui: false },
      { agent: 'point-du-jour', oui: null },
    ]);
    expect(screen.lines.map((line) => line.genre)).toEqual(['role']);
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

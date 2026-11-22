import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { deleteAccount } from '@/server/auth/delete-account';
import { setManager } from '@/server/auth/organisation';
import type { TenantContext } from '@/server/auth/tenant-context';
import { members } from '@/server/db/schema/auth';
import { lignesFiche, reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { type FicheLine, readFiche } from './fiche';
import { answerProposal, readProposals } from './propositions';

// Les agents de départ proposés à une personne, et sa réponse à chacun, oui ou non : enregistrée, changée, privée à
// elle, partie avec son compte. Données inventées : Julie, Paul et Marc dans une organisation, Zoé dans une autre.

const tenantIds: string[] = [];
afterAll(async () => {
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

// Une ligne de sa fiche, comme la construction l'écrit.
async function seedLine(
  ctx: TenantContext,
  line: Pick<FicheLine, 'genre' | 'cle' | 'valeur'>,
): Promise<void> {
  await adminDb.insert(lignesFiche).values({
    ...line,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    provenance: 'calcul',
    mails: 40,
    acl: [ctx.userId],
  });
}
const RYTHME = { genre: 'rythme' as const, cle: '', valeur: { mailsParSemaine: 12 } };
const side = { medianeMinutes: 42, reponses: 3 };
const DELAI = {
  genre: 'delai-reponse' as const,
  cle: '',
  valeur: { tous: side, interne: side, externe: side },
};

// Sa boîte Gmail branchée par elle, et une fiche qui montre qu'elle envoie des mails : la relance et le point du jour.
async function withMailbox(ctx: TenantContext): Promise<void> {
  await seedConnection(ctx, { provider: 'gmail' });
  await seedLine(ctx, RYTHME);
}

const proposals = async (ctx: TenantContext) => readProposals(ctx, await readFiche(ctx));
const stored = (ctx: TenantContext) =>
  adminDb
    .select({ agent: reponsesAgent.agent, oui: reponsesAgent.oui })
    .from(reponsesAgent)
    .where(eq(reponsesAgent.userId, ctx.userId));

describe('readProposals : ce que Leon propose à la personne', () => {
  it('sans fiche, aucune proposition, même avec sa boîte et un enregistreur branchés', async () => {
    const [julie] = await team();
    await seedConnection(julie, { provider: 'gmail' });
    await seedConnection(julie, { provider: 'fathom' });

    expect(await proposals(julie)).toEqual([]);
  });

  it('ne compte que les outils qu’elle a branchés elle-même, et que sa fiche à elle', async () => {
    const [julie, paul] = await team();
    await seedLine(julie, RYTHME);
    await seedConnection(paul, { provider: 'gmail' });
    await seedConnection(paul, { provider: 'fathom' });
    // La boîte et l'enregistreur de Paul ne proposent rien à Julie ; sans fiche, rien à Paul non plus.
    expect(await proposals(julie)).toEqual([]);
    expect(await proposals(paul)).toEqual([]);

    await seedConnection(julie, { provider: 'gmail' });

    expect(await proposals(julie)).toEqual([
      { agent: 'relance', oui: null, enService: false },
      { agent: 'point-du-jour', oui: null, enService: false },
    ]);
  });

  it('avec un enregistreur, Outlook et une fiche qui compte des réponses : les cinq, dans l’ordre du catalogue', async () => {
    const [julie] = await team();
    await seedConnection(julie, { provider: 'outlook' });
    await seedConnection(julie, { provider: 'granola' });
    await seedLine(julie, DELAI);
    await seedLine(julie, RYTHME);

    expect((await proposals(julie)).map((one) => one.agent)).toEqual([
      'suite-reunion',
      'brouillon-reponse',
      'brief-rendez-vous',
      'relance',
      'point-du-jour',
    ]);
    // Un seul est en service : « Brouillons de réponse ». Les quatre autres se proposent sans tourner encore.
    expect((await proposals(julie)).filter((one) => one.enService)).toEqual([
      { agent: 'brouillon-reponse', oui: null, enService: true },
    ]);
  });
});

describe('answerProposal : sa réponse, oui ou non', () => {
  it('s’enregistre, se relit avec la proposition, et se change', async () => {
    const [julie] = await team();
    await withMailbox(julie);

    expect(await answerProposal(julie, 'relance', true)).toBe(true);
    expect(await proposals(julie)).toEqual([
      { agent: 'relance', oui: true, enService: false },
      { agent: 'point-du-jour', oui: null, enService: false },
    ]);

    expect(await answerProposal(julie, 'relance', false)).toBe(true);
    expect(await answerProposal(julie, 'point-du-jour', true)).toBe(true);

    expect(await proposals(julie)).toEqual([
      { agent: 'relance', oui: false, enService: false },
      { agent: 'point-du-jour', oui: true, enService: false },
    ]);
    // Une ligne par agent : changer d'avis ne garde pas l'ancienne réponse.
    expect(await stored(julie)).toHaveLength(2);
  });

  it('un agent inconnu, ou qui ne lui est pas proposé à ce moment-là, est refusé, et rien ne s’écrit', async () => {
    const [julie] = await team();
    await withMailbox(julie);

    // Ni enregistreur, ni Outlook, ni réponse comptée dans sa fiche.
    for (const agent of [
      'agent-inconnu',
      '',
      'suite-reunion',
      'brief-rendez-vous',
      'brouillon-reponse',
    ])
      expect(await answerProposal(julie, agent, true), agent).toBe(false);

    expect(await stored(julie)).toEqual([]);
  });

  it('sans fiche, aucune réponse ne s’enregistre', async () => {
    const [julie] = await team();
    await seedConnection(julie, { provider: 'gmail' });

    expect(await answerProposal(julie, 'point-du-jour', true)).toBe(false);
    expect(await stored(julie)).toEqual([]);
  });

  it('une réponse dont l’agent n’est plus proposé reste enregistrée sans se montrer, et revient avec lui', async () => {
    const [julie] = await team();
    await withMailbox(julie);
    await answerProposal(julie, 'point-du-jour', true);

    // Elle débranche sa boîte.
    await adminPool.query('delete from connections where created_by = $1', [julie.userId]);

    expect(await proposals(julie)).toEqual([]);
    expect(await answerProposal(julie, 'point-du-jour', false)).toBe(false);
    expect(await stored(julie)).toEqual([{ agent: 'point-du-jour', oui: true }]);

    await seedConnection(julie, { provider: 'outlook' });

    expect(await proposals(julie)).toContainEqual({
      agent: 'point-du-jour',
      oui: true,
      enService: false,
    });
  });
});

describe('ses réponses sont privées à la personne', () => {
  it('ni un collègue, ni son manager avec la vue de l’équipe, ni une autre organisation ne les lisent ni ne les écrivent', async () => {
    const [julie, paul, marc] = await team();
    const other = await createTestTenant(['Zoé Bernard']);
    const [zoe] = other.members as [TenantContext];
    tenantIds.push(other.tenantId);
    await withMailbox(julie);
    await withMailbox(paul);
    await answerProposal(julie, 'point-du-jour', true);
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
    const others = [paul, marc, manager, zoe];

    const visible = (ctx: TenantContext) =>
      withTenant(ctx, (tx) => tx.select({ agent: reponsesAgent.agent }).from(reponsesAgent));
    expect(await visible(julie)).toEqual([{ agent: 'point-du-jour' }]);
    for (const ctx of others) expect(await visible(ctx)).toEqual([]);

    // Personne d'autre ne change ni ne supprime sa réponse : pour eux, la ligne n'existe pas.
    const hers = eq(reponsesAgent.userId, julie.userId);
    for (const ctx of others) {
      const changed = await withTenant(ctx, (tx) =>
        tx.update(reponsesAgent).set({ oui: false }).where(hers).returning(),
      );
      const removed = await withTenant(ctx, (tx) =>
        tx.delete(reponsesAgent).where(hers).returning(),
      );
      expect([changed, removed]).toEqual([[], []]);
    }
    // Un collègue qui répond au même agent écrit sa propre ligne.
    expect(await answerProposal(paul, 'point-du-jour', false)).toBe(true);
    expect(await stored(julie)).toEqual([{ agent: 'point-du-jour', oui: true }]);

    // La base refuse une réponse écrite au nom d'une autre personne, et une réponse ouverte à l'organisation, même
    // écrite par elle : l'organisation est dans ses principals, seul le check de la table (acl = [user_id]) l'arrête.
    const write = (ctx: TenantContext, acl: string[]) =>
      withTenant(ctx, (tx) =>
        tx.insert(reponsesAgent).values({
          tenantId: julie.tenantId,
          userId: julie.userId,
          agent: 'relance',
          oui: true,
          acl,
        }),
      );
    await expect(write(paul, [julie.userId])).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(write(julie, [julie.tenantId])).rejects.toMatchObject({
      cause: { code: '23514' },
    });
    // L'app ne change pas l'accès d'une réponse déjà écrite : elle n'a pas le droit de mettre à jour cette colonne.
    await expect(
      withTenant(julie, (tx) => tx.update(reponsesAgent).set({ acl: [julie.tenantId] })),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    // Un agent hors du catalogue est refusé par la base aussi.
    await expect(
      adminPool.query(
        `insert into reponses_agent (tenant_id, user_id, agent, oui, acl)
         values ($1, $2, 'agent-inconnu', true, array[$2::uuid])`,
        [julie.tenantId, julie.userId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await stored(julie)).toEqual([{ agent: 'point-du-jour', oui: true }]);
  });
});

describe('ses réponses partent avec le compte', () => {
  it('la suppression du compte efface ses réponses, pas celles d’un collègue, et un compte supprimé n’en reçoit plus', async () => {
    const [julie, paul] = await team();
    await withMailbox(julie);
    await withMailbox(paul);
    await answerProposal(julie, 'point-du-jour', true);
    await answerProposal(julie, 'relance', false);
    await answerProposal(paul, 'point-du-jour', true);

    await deleteAccount(julie, null, false);

    expect(await stored(julie)).toEqual([]);
    expect(await stored(paul)).toEqual([{ agent: 'point-du-jour', oui: true }]);
    // Sa fiche et sa boîte sont parties avec elle : plus rien ne lui est proposé.
    expect(await answerProposal(julie, 'point-du-jour', true)).toBe(false);
    // Même s'il lui restait une ligne et une boîte (une réponse en course avec la suppression), rien ne s'écrit pour
    // un compte supprimé.
    await withMailbox(julie);
    expect(await proposals(julie)).not.toEqual([]);
    expect(await answerProposal(julie, 'point-du-jour', true)).toBe(false);
    expect(await stored(julie)).toEqual([]);
  });
});

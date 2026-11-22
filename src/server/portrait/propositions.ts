import { and, eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listConnections } from '@/server/connectors/connections';
import { reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import { type AgentId, EN_SERVICE, proposeAgents } from './agents';
import { requestBrouillons } from './brouillons-queue';
import { type FicheLine, lockAccount, readFiche } from './fiche';

// Les agents de départ proposés à une personne, et sa réponse à chacun. La proposition se calcule à chaque lecture
// (agents.ts), sous ses droits ; seule sa réponse, oui ou non, s'enregistre (0078). Seul l'agent en service la lit :
// « Brouillons de réponse » ne travaille que pour qui lui a dit oui (brouillons.ts).

// `oui` : la réponse enregistrée ; null tant qu'elle n'a pas répondu.
export type Proposal = { agent: AgentId; oui: boolean | null };

// Les agents proposés à la personne à cet instant. `lines` : les lignes de sa fiche (readFiche). Les outils qui
// comptent sont ceux qu'elle a branchés elle-même : celui d'un collègue, même partagé à l'équipe, ne propose rien.
async function proposedTo(ctx: TenantContext, lines: FicheLine[]): Promise<AgentId[]> {
  // Sans fiche, aucune proposition : inutile de lire ses connexions.
  if (lines.length === 0) return [];
  const tools = (await listConnections(ctx)).flatMap((one) =>
    one.isCreator ? [one.provider] : [],
  );
  return proposeAgents(tools, lines);
}

// Chaque agent proposé, avec sa réponse. Une réponse donnée à un agent qui ne lui est plus proposé (un outil
// débranché depuis) reste enregistrée, sans se montrer.
export async function readProposals(ctx: TenantContext, lines: FicheLine[]): Promise<Proposal[]> {
  const agents = await proposedTo(ctx, lines);
  if (agents.length === 0) return [];
  const answers = await withTenant(ctx, (tx) =>
    tx
      .select({ agent: reponsesAgent.agent, oui: reponsesAgent.oui })
      .from(reponsesAgent)
      .where(and(eq(reponsesAgent.tenantId, ctx.tenantId), eq(reponsesAgent.userId, ctx.userId))),
  );
  const given = new Map(answers.map((one) => [one.agent, one.oui]));
  return agents.map((agent) => ({ agent, oui: given.get(agent) ?? null }));
}

// Sa réponse à un agent, oui ou non : elle remplace la précédente. Rend false, sans rien écrire, pour un agent hors
// du catalogue ou qui ne lui est pas proposé à ce moment-là, et pour un compte supprimé (lockAccount). Son « oui » à
// l'agent en service lui demande un premier passage.
export async function answerProposal(
  ctx: TenantContext,
  agent: string,
  oui: boolean,
): Promise<boolean> {
  const proposed = (await proposedTo(ctx, await readFiche(ctx))).find((one) => one === agent);
  if (!proposed) return false;
  const saved = await withTenant(ctx, async (tx) => {
    if (!(await lockAccount(tx, ctx))) return false;
    await tx
      .insert(reponsesAgent)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        agent: proposed,
        oui,
        acl: [ctx.userId],
      })
      .onConflictDoUpdate({
        target: [reponsesAgent.tenantId, reponsesAgent.userId, reponsesAgent.agent],
        set: { oui },
      });
    return true;
  });
  if (saved && oui && proposed === EN_SERVICE) await requestBrouillons(ctx);
  return saved;
}

import { and, eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { listConnections } from '@/server/connectors/connections';
import { reponsesAgent } from '@/server/db/schema/portrait';
import { withTenant } from '@/server/db/with-tenant';
import {
  AGENTS,
  type AgentId,
  EN_SERVICE,
  type Missing,
  missingFor,
  proposeAgents,
} from './agents';
import { requestBrouillons } from './brouillons-queue';
import { type FicheLine, lockAccount, readFiche } from './fiche';

// Les agents de départ proposés à une personne, et sa réponse à chacun. La proposition se calcule à chaque lecture
// (agents.ts), sous ses droits ; seule sa réponse, oui ou non, s'enregistre (0078). Seuls les agents en service la
// lisent : chacun ne travaille que pour qui lui a dit oui (brouillons.ts).

// `oui` : la réponse enregistrée ; null tant qu'elle n'a pas répondu. `enService` : l'agent travaille déjà pour qui lui
// a dit oui ; les autres se proposent sans tourner encore.
export type Proposal = { agent: AgentId; oui: boolean | null; enService: boolean };

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

// Ses réponses enregistrées, par agent, sous ses droits.
async function readAnswers(ctx: TenantContext): Promise<Map<AgentId, boolean>> {
  const answers = await withTenant(ctx, (tx) =>
    tx
      .select({ agent: reponsesAgent.agent, oui: reponsesAgent.oui })
      .from(reponsesAgent)
      .where(and(eq(reponsesAgent.tenantId, ctx.tenantId), eq(reponsesAgent.userId, ctx.userId))),
  );
  return new Map(answers.map((one) => [one.agent, one.oui]));
}

// Chaque agent proposé, avec sa réponse. Une réponse donnée à un agent qui ne lui est plus proposé (un outil
// débranché depuis) reste enregistrée, sans se montrer.
export async function readProposals(ctx: TenantContext, lines: FicheLine[]): Promise<Proposal[]> {
  const agents = await proposedTo(ctx, lines);
  if (agents.length === 0) return [];
  const given = await readAnswers(ctx);
  return agents.map((agent) => ({
    agent,
    oui: given.get(agent) ?? null,
    enService: EN_SERVICE.includes(agent),
  }));
}

// Un agent du catalogue tel que l'écran Agents le montre : proposé ou non, et ce qui lui manque sinon. `oui` est nul
// pour un agent qui ne lui est pas proposé : une réponse d'avant reste enregistrée, sans compter ni se montrer.
export type AgentState = Proposal & { missing: Missing | null };

// Les cinq agents du catalogue, dans son ordre, pour l'écran Agents. `lines` : les lignes de sa fiche (readFiche).
// Ses connexions se lisent même sans fiche : l'écran lui dit alors quel outil brancher.
export async function readAgentStates(
  ctx: TenantContext,
  lines: FicheLine[],
): Promise<AgentState[]> {
  const [connections, given] = await Promise.all([listConnections(ctx), readAnswers(ctx)]);
  const tools = connections.flatMap((one) => (one.isCreator ? [one.provider] : []));
  return AGENTS.map((agent) => {
    const missing = missingFor(agent, tools, lines);
    return {
      agent,
      oui: missing ? null : (given.get(agent) ?? null),
      enService: EN_SERVICE.includes(agent),
      missing,
    };
  });
}

// Sa réponse à un agent, oui ou non : elle remplace la précédente. Rend false, sans rien écrire, pour un agent hors
// du catalogue ou qui ne lui est pas proposé à ce moment-là, et pour un compte supprimé (lockAccount). Son « oui » à
// un agent en service lui demande un premier passage.
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
  if (saved && oui && EN_SERVICE.includes(proposed)) await requestBrouillons(ctx);
  return saved;
}

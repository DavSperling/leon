import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { BriefingResponse } from '@/capture/api-contract';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { briefings } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import { type Llm, LlmError } from '@/server/llm/llm';
import { createReferenceFilter } from '@/server/llm/references';
import { logError } from '@/server/log';
import { buildBriefingPrompt, renderBriefing, renderEmptyBriefing } from './briefing-prompt';
import {
  BRIEFING_DAYS,
  gatherBriefingMaterial,
  isEmptyMaterial,
  materialSourceIds,
} from './gather';
import { requestBriefingRefreshNow } from './queue';

// Le point du matin (T13) : préparé à l'avance par un seul appel au modèle (D8 du plan du deuxième jet), gardé dans
// `briefings`, et lu par le crochet de démarrage de Claude Code, la route `GET /api/v1/briefing` et l'outil MCP
// `briefing`. C'est un cache, pas une fiche : refait en place, jamais traité comme une source, et revérifié à chaque
// lecture (vigilance 3 : une source qu'il a reçue et que l'utilisateur ne voit plus le rend illisible).
//
// Tout se lit et s'écrit sous withTenant de l'utilisateur ; l'appel au modèle se fait hors de toute transaction.

// Ce que la route et l'outil rendent tant qu'aucun point n'est prêt (le recalcul est alors en file).
export const BRIEFING_PENDING_MARKDOWN =
  'Pas encore de point pour ce projet : il sera prêt à la prochaine session.';
// Ce qu'ils rendent quand aucun point n'est prêt et que le serveur n'a pas de modèle (getLlm rend null) : le worker
// ne prépare alors aucun point, et promettre « à la prochaine session » serait faux. Rien n'est mis en file.
export const BRIEFING_NO_MODEL_MARKDOWN =
  "Le point du matin n'est pas préparé : aucun modèle n'est réglé sur ce serveur.";
// Borne le texte ET la réflexion du modèle (llm.ts) : 250 mots en prennent environ 600, la réflexion de l'effort
// « medium » quelques milliers. De la marge, pour ne jamais couper le point avant son premier mot.
const BRIEFING_MAX_TOKENS = 8000;
// Le recalcul tourne dans un job, pas devant l'utilisateur : il a le temps, mais pas indéfiniment.
const BRIEFING_TIMEOUT_MS = 120_000;

// Le texte du modèle, renvois filtrés : seuls les numéros fournis restent.
async function writeBody(
  llm: Llm,
  prompt: ReturnType<typeof buildBriefingPrompt>,
): Promise<string> {
  const filter = createReferenceFilter(new Set(prompt.references.map((reference) => reference.n)));
  let body = '';
  for await (const delta of llm.streamText({
    step: 'point',
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: BRIEFING_MAX_TOKENS,
    signal: AbortSignal.timeout(BRIEFING_TIMEOUT_MS),
  })) {
    body += filter.push(delta);
  }
  body += filter.flush();
  // Un point vide ne vaut pas mieux que l'ancien : le job échoue et sera repris.
  if (body.trim() === '') throw new LlmError('réponse vide');
  return body;
}

// Refait le point de l'utilisateur sur ce projet. Sans rien de neuf (ni session, ni changement, ni mention), le
// point le dit sans appeler le modèle. Une panne du modèle remonte (LlmError) et laisse le point précédent tel quel.
export async function refreshBriefing(
  ctx: TenantContext,
  project: string,
  deps: { llm: Llm; now?: Date },
): Promise<void> {
  const now = deps.now ?? new Date();
  const material = await gatherBriefingMaterial(ctx, project, now);
  let markdown: string;
  let sourceIds: string[];
  if (isEmptyMaterial(material)) {
    markdown = renderEmptyBriefing(project, now, BRIEFING_DAYS);
    sourceIds = [];
  } else {
    const prompt = buildBriefingPrompt(material, now);
    const body = await writeBody(deps.llm, prompt);
    markdown = renderBriefing({ project, preparedAt: now, body, references: prompt.references });
    // Toutes les sources fournies au modèle, citées ou non : le texte peut en tenir sans les citer.
    sourceIds = materialSourceIds(material);
  }
  await withTenant(ctx, (tx) =>
    tx
      .insert(briefings)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        project,
        markdown,
        sourceIds,
        preparedAt: now,
        stale: false,
        acl: [ctx.userId],
      })
      .onConflictDoUpdate({
        target: [briefings.tenantId, briefings.userId, briefings.project],
        set: { markdown, sourceIds, preparedAt: now, stale: false },
      }),
  );
}

// Met le recalcul en file, tout de suite, sans jamais faire échouer la lecture : le crochet attend sa réponse.
async function requestRefresh(ctx: TenantContext, project: string): Promise<void> {
  try {
    await requestBriefingRefreshNow({ tenantId: ctx.tenantId, userId: ctx.userId, project });
  } catch (error) {
    logError('briefing.enqueue_failed', error, { tenantId: ctx.tenantId, userId: ctx.userId });
  }
}

// Le dernier point de l'utilisateur sur ce projet, même périmé (un recalcul est déjà en file), et l'heure de la
// lecture notée (le tic du matin refait les points lus dans la semaine). Rend null quand il n'y a pas de point ou
// qu'une des sources fournies au modèle n'est plus visible de l'utilisateur (droits retirés, source supprimée) : ce
// point-là n'est plus montré, et son recalcul est mis en file tout de suite, sauf `refresh: false` (aucun modèle
// pour le faire).
export async function readBriefing(
  ctx: TenantContext,
  project: string,
  options: { refresh?: boolean } = {},
): Promise<{ markdown: string; preparedAt: Date } | null> {
  const read = await withTenant(ctx, async (tx) => {
    const [row] = await tx
      .update(briefings)
      .set({ lastReadAt: sql`now()` })
      .where(and(eq(briefings.userId, ctx.userId), eq(briefings.project, project)))
      .returning({
        id: briefings.id,
        markdown: briefings.markdown,
        preparedAt: briefings.preparedAt,
        sourceIds: briefings.sourceIds,
      });
    if (!row) return null;
    const wanted = [...new Set(row.sourceIds)];
    if (wanted.length > 0) {
      // Sous la sécurité par ligne : une source que l'utilisateur ne voit plus n'est pas comptée.
      const [{ visible } = { visible: 0 }] = await tx
        .select({ visible: sql<number>`count(*)::int` })
        .from(sources)
        .where(inArray(sources.id, wanted));
      if (visible < wanted.length) {
        await tx.update(briefings).set({ stale: true }).where(eq(briefings.id, row.id));
        return null;
      }
    }
    return { markdown: row.markdown, preparedAt: row.preparedAt };
  });
  if (read === null && options.refresh !== false) await requestRefresh(ctx, project);
  return read;
}

// La réponse de la route du crochet et de l'outil MCP (C8) : le dernier point, sinon le message qui dit pourquoi il
// n'y en a pas. `modelReady` : le serveur a un modèle (getLlm), donc un point manquant sera préparé ; sans modèle,
// rien n'est mis en file et le message le dit. `project` null : aucun projet connu (l'outil MCP appelé sans projet).
export async function briefingResponse(
  ctx: TenantContext,
  project: string | null,
  deps: { modelReady: boolean },
): Promise<BriefingResponse> {
  const briefing =
    project === null ? null : await readBriefing(ctx, project, { refresh: deps.modelReady });
  if (briefing !== null && project !== null) {
    return {
      markdown: briefing.markdown,
      projet: project,
      preparedAt: briefing.preparedAt.toISOString(),
    };
  }
  return {
    markdown: deps.modelReady ? BRIEFING_PENDING_MARKDOWN : BRIEFING_NO_MODEL_MARKDOWN,
    projet: null,
    preparedAt: null,
  };
}

// Le projet du point que l'utilisateur a lu en dernier, sinon de celui préparé en dernier (l'outil MCP appelé sans
// projet, depuis un client qui n'a pas de dossier courant). Null s'il n'a aucun point.
export async function latestBriefingProject(ctx: TenantContext): Promise<string | null> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ project: briefings.project })
      .from(briefings)
      .where(eq(briefings.userId, ctx.userId))
      .orderBy(sql`${briefings.lastReadAt} desc nulls last`, desc(briefings.preparedAt))
      .limit(1),
  );
  return row?.project ?? null;
}

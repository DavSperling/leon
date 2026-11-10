import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { BriefingResponse } from '@/capture/api-contract';
import { CODE_SESSION_KINDS, type SourceKind } from '@/capture/turn';
import { readOnboardingMember } from '@/server/auth/onboarding';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema/auth';
import { sources } from '@/server/db/schema/memory';
import { briefings } from '@/server/db/schema/search';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import { type Llm, LlmError } from '@/server/llm/llm';
import { createReferenceFilter } from '@/server/llm/references';
import { logError } from '@/server/log';
import { recordReads } from '@/server/memory/read-log';
import { textArray } from '@/server/search/filters-sql';
import { readAbout } from './about';
import { buildBriefingPrompt, renderBriefing, renderEmptyBriefing } from './briefing-prompt';
import {
  BRIEFING_DAYS,
  gatherBriefingMaterial,
  isEmptyMaterial,
  materialSourceIds,
} from './gather';
import {
  BRIEFING_DELAY_SECONDS,
  enqueueBriefingRefresh,
  refreshOnSignal,
  requestBriefingRefreshNow,
} from './queue';

// Le point du matin (T13) : préparé à l'avance par un seul appel au modèle (D8 du plan du deuxième jet), gardé dans
// `briefings`, et lu par le crochet de démarrage de Claude Code, la route `GET /api/v1/briefing` et l'outil MCP
// `briefing`. C'est un cache, pas une fiche : refait en place, jamais traité comme une source, et revérifié à chaque
// lecture (vigilance 3 : une source qu'il a reçue et que l'utilisateur ne voit plus le rend illisible).
//
// Tout se lit et s'écrit sous withTenant de l'utilisateur ; l'appel au modèle se fait hors de toute transaction.

// Ce que la route et l'outil rendent tant qu'aucun point n'est prêt (le recalcul est alors en file).
export const BRIEFING_PENDING_MARKDOWN =
  'No briefing for this project yet: it will be ready at your next session.';
// Ce qu'ils rendent quand aucun point n'est prêt et que le serveur n'a pas de modèle (getLlm rend null) : le worker
// ne prépare alors aucun point, et promettre « à la prochaine session » serait faux. Rien n'est mis en file.
export const BRIEFING_NO_MODEL_MARKDOWN =
  'The morning briefing is not prepared: no model is configured on this server.';
// Borne le texte ET la réflexion du modèle (llm.ts) : 250 mots en prennent environ 600, la réflexion de l'effort
// « medium » quelques milliers. De la marge, pour ne jamais couper le point avant son premier mot.
const BRIEFING_MAX_TOKENS = 8000;
// Le recalcul tourne dans un job, pas devant l'utilisateur : il a le temps, mais pas indéfiniment.
const BRIEFING_TIMEOUT_MS = 120_000;
// Le plafond de dépense : au plus 20 points écrits par le modèle par personne et par jour (UTC, reserver_point,
// 0060), toutes organisations et tous projets confondus. Du 3 au 10/11/2026, la production en a payé 1 à 6 par
// jour pour deux personnes, 3,6 centimes au plus chacun : 20 points coûtent au plus 0,72 $ par personne et par jour.
// Au-delà, le point reste tel quel jusqu'au lendemain.
export const BRIEFING_DAILY_CAP = 20;

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

// Un compte supprimé (0040) garde ses points mais n'en reçoit plus : un recalcul déjà en file ne coûte pas d'appel
// au modèle. Un utilisateur disparu avec son organisation n'a plus de ligne du tout.
export async function accountIsGone(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));
  return row === undefined || row.deletedAt !== null;
}

// Refait le point de l'utilisateur sur ce projet. Sans rien de neuf (ni session, ni changement, ni mention), le
// point le dit sans appeler le modèle. Une panne du modèle remonte (LlmError) et laisse le point précédent tel quel.
// Passé le plafond du jour (BRIEFING_DAILY_CAP), rien n'est écrit : le point reste périmé, sans appel au modèle.
export async function refreshBriefing(
  ctx: TenantContext,
  project: string,
  deps: { llm: Llm; now?: Date },
): Promise<void> {
  if (await accountIsGone(ctx.userId)) return;
  const now = deps.now ?? new Date();
  const material = await gatherBriefingMaterial(ctx, project, now);
  let markdown: string;
  let sourceIds: string[];
  if (isEmptyMaterial(material)) {
    markdown = renderEmptyBriefing(project, now, BRIEFING_DAYS);
    sourceIds = [];
  } else {
    const { rows } = await db.execute<{ ok: boolean }>(
      sql`select reserver_point(${ctx.userId}, ${BRIEFING_DAILY_CAP}) as ok`,
    );
    if (rows[0]?.ok !== true) {
      console.warn('[leon]', 'briefing.daily_cap', JSON.stringify({ userId: ctx.userId }));
      return;
    }
    const prompt = buildBriefingPrompt(
      material,
      now,
      await readAbout(ctx.userId),
      await readOnboardingMember(ctx),
    );
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

// Le point existe et rien n'est arrivé sur son projet depuis sa préparation (`stale` est posé par chaque signal et
// par une source devenue invisible) : le refaire coûterait un appel au modèle pour le même texte.
export async function briefingIsFresh(ctx: TenantContext, project: string): Promise<boolean> {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ stale: briefings.stale })
      .from(briefings)
      .where(and(eq(briefings.userId, ctx.userId), eq(briefings.project, project))),
  );
  return row !== undefined && !row.stale;
}

// Met le recalcul en file sans jamais faire échouer la lecture : le crochet attend sa réponse. `now` avance à
// maintenant un recalcul retardé déjà en file ; un délai ne met en file que si rien n'attend.
async function requestRefresh(
  ctx: TenantContext,
  project: string,
  when: 'now' | { delaySeconds: number },
): Promise<void> {
  const job = { tenantId: ctx.tenantId, userId: ctx.userId, project };
  try {
    if (when === 'now') await requestBriefingRefreshNow(job);
    else await enqueueBriefingRefresh(job, when);
  } catch (error) {
    logError('briefing.enqueue_failed', error, { tenantId: ctx.tenantId, userId: ctx.userId });
  }
}

const GITHUB = 'github' satisfies SourceKind;

// Le projet a de quoi faire un point pour ce lecteur : une de ses sessions de code, ou un élément GitHub du dépôt
// qu'il voit. Sans cela, une clé de projet inventée (la route et l'outil MCP acceptent toute clé bien formée) mettrait
// en file un appel au modèle à chaque lecture.
async function projectIsKnown(tx: Tx, ctx: TenantContext, project: string): Promise<boolean> {
  const { rows } = await tx.execute<{ known: boolean }>(sql`
    select exists (
      select 1 from sources s
      where s.tenant_id = ${ctx.tenantId}
        and ((s.owner_user_id = ${ctx.userId} and s.kind = any(${textArray(CODE_SESSION_KINDS)}) and s.metadata->>'project' = ${project})
          or (s.kind = ${GITHUB} and 'github.com/' || lower(s.metadata->'origin'->>'repo') = ${project}))
    ) as known`);
  return rows[0]?.known === true;
}

// Le dernier point de l'utilisateur sur ce projet, même périmé (son recalcul est en file, ou le sera par cette
// lecture), et l'heure de la lecture notée (le tic du matin refait les points lus dans la semaine). Rend null quand
// il n'y a pas de point ou qu'une des sources fournies au modèle n'est plus visible de l'utilisateur (droits retirés,
// source supprimée) : ce point-là n'est plus montré, et son recalcul est mis en file tout de suite, sauf
// `refresh: false` (aucun modèle pour le faire) ou projet sans rien de connu du lecteur (projectIsKnown). Un point
// périmé dont aucun recalcul n'est en file (refreshOnSignal) est rendu, et remis en file.
export async function readBriefing(
  ctx: TenantContext,
  project: string,
  options: { refresh?: boolean } = {},
): Promise<{ markdown: string; preparedAt: Date; sourceIds: string[] } | null> {
  const { read, refresh } = await withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({
        id: briefings.id,
        markdown: briefings.markdown,
        preparedAt: briefings.preparedAt,
        sourceIds: briefings.sourceIds,
        stale: briefings.stale,
        lastReadAt: briefings.lastReadAt,
      })
      .from(briefings)
      .where(and(eq(briefings.userId, ctx.userId), eq(briefings.project, project)));
    if (!row) {
      return {
        read: null,
        refresh: (await projectIsKnown(tx, ctx, project)) ? ('now' as const) : null,
      };
    }
    await tx.update(briefings).set({ lastReadAt: sql`now()` }).where(eq(briefings.id, row.id));
    const wanted = [...new Set(row.sourceIds)];
    if (wanted.length > 0) {
      // Sous la sécurité par ligne : une source que l'utilisateur ne voit plus n'est pas comptée.
      const [{ visible } = { visible: 0 }] = await tx
        .select({ visible: sql<number>`count(*)::int` })
        .from(sources)
        .where(inArray(sources.id, wanted));
      if (visible < wanted.length) {
        await tx.update(briefings).set({ stale: true }).where(eq(briefings.id, row.id));
        return { read: null, refresh: 'now' as const };
      }
    }
    // Périmé, et le signal l'a seulement marqué (refreshOnSignal) : personne n'avait lu sa version actuelle, ou plus
    // depuis une semaine. Cette lecture le remet en file, 30 minutes au plus tôt après sa préparation : des lectures
    // et des signaux en rafale (une session lancée en boucle) ne paient pas plus d'un point par demi-heure.
    const nextAt = row.preparedAt.getTime() + BRIEFING_DELAY_SECONDS * 1000;
    return {
      read: { markdown: row.markdown, preparedAt: row.preparedAt, sourceIds: wanted },
      refresh:
        row.stale && !refreshOnSignal(row)
          ? { delaySeconds: Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)) }
          : null,
    };
  });
  if (refresh !== null && options.refresh !== false) await requestRefresh(ctx, project, refresh);
  return read;
}

// La réponse de la route du crochet et de l'outil MCP (C8) : le dernier point, sinon le message qui dit pourquoi il
// n'y en a pas. `modelReady` : le serveur a un modèle (getLlm), donc un point manquant sera préparé ; sans modèle,
// rien n'est mis en file et le message le dit. `project` null : aucun projet connu (l'outil MCP appelé sans projet).
// Le point rendu est noté au journal des lectures (D35), une ligne par source fournie au modèle, sessions comprises :
// `client`, l'outil MCP ou `cli` (le bloc de démarrage et la route du point), et `session`, celle du bloc quand il la
// donne. L'état d'un fil écrit d'après cette session les compte parmi ses entrées. Un point dont une source n'a pas
// pu être notée (devenue invisible entre-temps) n'est pas rendu.
export async function briefingResponse(
  ctx: TenantContext,
  project: string | null,
  deps: { modelReady: boolean; client: string; session?: string },
): Promise<BriefingResponse> {
  const briefing =
    project === null ? null : await readBriefing(ctx, project, { refresh: deps.modelReady });
  const logged =
    briefing === null ||
    (
      await recordReads(ctx, {
        tool: 'briefing',
        client: deps.client,
        session: deps.session,
        reads: briefing.sourceIds.map((sourceId) => ({ sourceId })),
        whole: true,
      })
    ).size === briefing.sourceIds.length;
  if (briefing !== null && project !== null && logged) {
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

import { and, eq, inArray, sql } from 'drizzle-orm';
import { readOnboardingMember } from '@/server/auth/onboarding';
import type { TenantContext } from '@/server/auth/tenant-context';
import { accountIsGone } from '@/server/briefing/briefings';
import { db } from '@/server/db/client';
import { organizations, users } from '@/server/db/schema/auth';
import { lignesFiche } from '@/server/db/schema/portrait';
import { type Tx, withTenant } from '@/server/db/with-tenant';
import type { Llm } from '@/server/llm/llm';
import { lockAccount } from './fiche';
import { gatherPortraitMaterial } from './material';
import { buildSynthesePrompt, parseSyntheseAnswer } from './synthese-prompt';

// La synthèse de la fiche : un modèle lit les éléments récents de la personne dans tous ses outils (material.ts) et
// écrit dans sa fiche son rôle et les tâches qu'elle refait (synthese-prompt.ts), une fois, à la mise en route. Tout
// se lit et s'écrit sous withTenant de la personne ; l'appel au modèle se fait hors de toute transaction. Rien ne la
// déclenche encore : ni tâche de fond, ni route.

// Borne le texte ET la réflexion du modèle (llm.ts) : neuf lignes JSON en prennent environ 1 500, le reste est la
// marge de la réflexion à l'effort « medium ». Au pire 150 sources de 2 tours de 400 caractères, environ 40 000 jetons
// d'entrée : moins de 25 centimes par personne, une seule fois (estimé d'après le tarif de models.ts, pas mesuré).
const FICHE_MAX_TOKENS = 16_000;
const FICHE_TIMEOUT_MS = 180_000;

// Une ligne « role » ou « tache », même corrigée ou retirée, dit que la synthèse est faite.
async function alreadyDone(tx: Tx, ctx: TenantContext): Promise<boolean> {
  const [line] = await tx
    .select({ id: lignesFiche.id })
    .from(lignesFiche)
    .where(
      and(
        eq(lignesFiche.tenantId, ctx.tenantId),
        eq(lignesFiche.userId, ctx.userId),
        inArray(lignesFiche.genre, ['role', 'tache']),
      ),
    )
    .limit(1);
  return line !== undefined;
}

// Écrit le rôle et les tâches de la personne et rend true, ou ne fait rien et rend false : compte supprimé, synthèse
// déjà faite, aucune matière, ou réponse sans rien de valide. Une seule fois par personne : une fois faite
// (alreadyDone), le modèle n'est pas rappelé. Une panne du modèle remonte (LlmError) et rien n'est écrit.
// shortcut: deux synthèses lancées au même instant appellent chacune le modèle, et une seule écrit : le second appel
// est payé pour rien, au déclencheur de n'en lancer qu'une par personne.
export async function synthesizeFiche(
  ctx: TenantContext,
  deps: { llm: Llm; now?: Date },
): Promise<boolean> {
  if (await accountIsGone(ctx.userId)) return false;
  if (await withTenant(ctx, (tx) => alreadyDone(tx, ctx))) return false;
  const material = await gatherPortraitMaterial(ctx, deps.now ?? new Date());
  if (material.sources.length === 0) return false;
  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.tenantId));
  const [person] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, ctx.userId));
  const prompt = buildSynthesePrompt(
    material,
    await readOnboardingMember(ctx),
    organization?.name ?? '',
    person?.name ?? '',
  );
  let answer = '';
  for await (const delta of deps.llm.streamText({
    step: 'fiche',
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: FICHE_MAX_TOKENS,
    signal: AbortSignal.timeout(FICHE_TIMEOUT_MS),
  })) {
    answer += delta;
  }
  const lines = parseSyntheseAnswer(answer, material);
  // Des nombres seulement, jamais de texte : de quoi voir dans les journaux ce que la synthèse a donné.
  console.info(
    '[leon]',
    'fiche.synthesized',
    JSON.stringify({
      userId: ctx.userId,
      sources: material.sources.length,
      lignes: lines.length,
      chars: answer.length,
    }),
  );
  if (lines.length === 0) return false;
  // L'appel au modèle dure jusqu'à 180 s : un compte supprimé entre-temps ne reçoit rien (lockAccount). Une synthèse
  // écrite entre-temps non plus, sans quoi une tâche qu'elle a retirée reviendrait à un autre rang : le verrou de la
  // personne fait passer deux écritures l'une après l'autre, et la seconde relit. Une ligne déjà là n'est jamais
  // écrasée.
  const written = await withTenant(ctx, async (tx) => {
    if (!(await lockAccount(tx, ctx))) return [];
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`leon:fiche:${ctx.tenantId}:${ctx.userId}`}, 0))`,
    );
    if (await alreadyDone(tx, ctx)) return [];
    return tx
      .insert(lignesFiche)
      .values(
        lines.map((line) => ({
          ...line,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          provenance: 'synthese' as const,
          acl: [ctx.userId],
        })),
      )
      .onConflictDoNothing()
      .returning({ id: lignesFiche.id });
  });
  return written.length > 0;
}

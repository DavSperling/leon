import { eq, sql } from 'drizzle-orm';
import { PROVIDER_IDS } from '@/capture/turn';
import { readOnboardingMember } from '@/server/auth/onboarding';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { organizations } from '@/server/db/schema/auth';
import { aboutSuggestions } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';
import type { Llm } from '@/server/llm/llm';
import { createReferenceFilter } from '@/server/llm/references';
import { textArray } from '@/server/search/filters-sql';
import { ABOUT_MAX_CHARS, readAbout } from './about';
import { gatherAboutMaterial } from './about-material';
import { buildAboutPrompt } from './about-prompt';
import { accountIsGone } from './briefings';

// La proposition « About you » (onboarding, lot 5) : une description de la personne, écrite par le travail de fond
// à partir de ses seules sources, montrée une fois en haut du Chat. Tout se lit et s'écrit sous withTenant de la
// personne ; l'appel au modèle se fait hors de toute transaction, et son coût compte sous l'étape `point`.

// Prête à recevoir une proposition : au moins 20 sources venues de ses connexions, et une connexion créée il y a au
// moins un jour, déjà relevée (le choix 9 du plan). La liste vient de apropos_a_proposer (0045).
export const ABOUT_MIN_SOURCES = 20;
export const ABOUT_MIN_AGE = '1 day';
// Borne le texte ET la réflexion du modèle (llm.ts) : 500 caractères en prennent peu, la réflexion quelques milliers.
const ABOUT_MAX_TOKENS = 4000;
const ABOUT_TIMEOUT_MS = 120_000;

// Qui est prêt, toutes organisations : la fonction ne rend que des identifiants, comme celle du tic du matin
// (briefings_a_rafraichir). La matière se lit ensuite sous les droits de chacun (proposeAbout).
export async function listAboutCandidates(): Promise<Array<{ tenantId: string; userId: string }>> {
  const { rows } = await db.execute<{ tenant_id: string; user_id: string }>(
    sql`select tenant_id, user_id
        from apropos_a_proposer(${textArray(PROVIDER_IDS)}, ${ABOUT_MIN_SOURCES}, ${ABOUT_MIN_AGE}::interval)`,
  );
  return rows.map((row) => ({ tenantId: row.tenant_id, userId: row.user_id }));
}

// Le texte du modèle, renvois [n] retirés (aucun numéro n'est fourni), rogné, puis coupé à ABOUT_MAX_CHARS unités
// UTF-16 (ce que compte le .max(500) de zod) sans séparer les deux moitiés d'un émoji.
async function writeText(llm: Llm, prompt: ReturnType<typeof buildAboutPrompt>): Promise<string> {
  const filter = createReferenceFilter(new Set<number>());
  let text = '';
  for await (const delta of llm.streamText({
    step: 'point',
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: ABOUT_MAX_TOKENS,
    signal: AbortSignal.timeout(ABOUT_TIMEOUT_MS),
  })) {
    text += filter.push(delta);
  }
  text = (text + filter.flush()).trim();
  if (text.length <= ABOUT_MAX_CHARS) return text;
  const high = text.charCodeAt(ABOUT_MAX_CHARS - 1);
  const end = high >= 0xd800 && high <= 0xdbff ? ABOUT_MAX_CHARS - 1 : ABOUT_MAX_CHARS;
  return text.slice(0, end).trimEnd();
}

// Écrit la proposition de la personne et rend true, ou ne fait rien et rend false : compte supprimé, proposition
// déjà faite (une seule fois, même fermée), « À propos » déjà rempli, aucune source, ou réponse vide du modèle (la
// contrainte de 1 à 500 caractères échouerait sinon chaque jour). Une panne du modèle remonte (LlmError).
export async function proposeAbout(
  ctx: TenantContext,
  deps: { llm: Llm; now?: Date },
): Promise<boolean> {
  if (await accountIsGone(ctx.userId)) return false;
  const [existing] = await withTenant(ctx, (tx) =>
    tx
      .select({ id: aboutSuggestions.id })
      .from(aboutSuggestions)
      .where(eq(aboutSuggestions.userId, ctx.userId)),
  );
  if (existing || ((await readAbout(ctx.userId)) ?? '').trim() !== '') return false;
  const material = await gatherAboutMaterial(ctx, deps.now ?? new Date());
  if (material.sources.length === 0) return false;
  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.tenantId));
  const prompt = buildAboutPrompt(
    material,
    await readOnboardingMember(ctx),
    organization?.name ?? '',
  );
  const text = await writeText(deps.llm, prompt);
  if (text === '') return false;
  const written = await withTenant(ctx, (tx) =>
    tx
      .insert(aboutSuggestions)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        text,
        sourceIds: material.sources.map((entry) => entry.source.sourceId),
        acl: [ctx.userId],
      })
      .onConflictDoNothing()
      .returning({ id: aboutSuggestions.id }),
  );
  return written.length > 0;
}

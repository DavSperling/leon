import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { PROVIDER_IDS, type ProviderId } from '@/capture/turn';
import { readOnboardingMember } from '@/server/auth/onboarding';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { organizations } from '@/server/db/schema/auth';
import { sources } from '@/server/db/schema/memory';
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

// Le texte du modèle, renvois [n] et NUL retirés (Postgres refuse \u0000 dans un text, et pg-boss rejouerait l'appel
// payant), rogné, puis, s'il dépasse ABOUT_MAX_CHARS unités UTF-16 (ce que compte le .max(500) de zod), coupé au
// dernier blanc plutôt qu'au milieu d'un mot ; sans aucun blanc, coupe sèche, sans séparer les deux moitiés d'un émoji.
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
  text = (text + filter.flush()).replaceAll('\u0000', '').trim();
  if (text.length <= ABOUT_MAX_CHARS) return text;
  const high = text.charCodeAt(ABOUT_MAX_CHARS - 1);
  const end = high >= 0xd800 && high <= 0xdbff ? ABOUT_MAX_CHARS - 1 : ABOUT_MAX_CHARS;
  // Le caractère juste après la coupe compte : s'il est blanc, le dernier mot est entier.
  const space = text.slice(0, end + 1).search(/\s\S*$/);
  return text.slice(0, space > 0 ? space : end).trimEnd();
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

// La carte du Chat montre au plus 6 logos.
const ABOUT_KINDS_MAX = 6;
const isProviderId = (kind: string): kind is ProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(kind);

// La proposition à montrer à la personne : ouverte, son « À propos » encore vide, et toutes ses sources encore visibles
// pour elle (même contrôle que readBriefing : sous la sécurité par ligne, une source cachée depuis n'est pas comptée,
// et la proposition, écrite d'après elle, ne se montre plus). `kinds` : les outils de ces sources, les plus fréquents
// d'abord, 6 au plus. Appelée à chaque chargement du Chat : la ligne se lit d'abord, « À propos » seulement s'il y en
// a une (presque jamais, passé les premiers jours).
export async function readAboutSuggestion(
  ctx: TenantContext,
): Promise<{ text: string; kinds: ProviderId[] } | null> {
  const open = await withTenant(ctx, async (tx) => {
    const [row] = await tx
      .select({ text: aboutSuggestions.text, sourceIds: aboutSuggestions.sourceIds })
      .from(aboutSuggestions)
      .where(and(eq(aboutSuggestions.userId, ctx.userId), isNull(aboutSuggestions.closedAt)));
    if (!row) return null;
    const wanted = [...new Set(row.sourceIds)];
    if (wanted.length === 0) return { text: row.text, kinds: [] };
    const found = await tx
      .select({ kind: sources.kind, count: sql<number>`count(*)::int` })
      .from(sources)
      .where(inArray(sources.id, wanted))
      .groupBy(sources.kind)
      .orderBy(sql`count(*) desc`, sources.kind);
    if (found.reduce((total, entry) => total + entry.count, 0) < wanted.length) return null;
    const kinds = found.map((entry) => entry.kind).filter(isProviderId);
    return { text: row.text, kinds: kinds.slice(0, ABOUT_KINDS_MAX) };
  });
  if (!open) return null;
  return ((await readAbout(ctx.userId)) ?? '').trim() === '' ? open : null;
}

// « Save » ou « Not now » : la proposition ne se montre plus. Sans effet si elle est déjà fermée ou absente.
export async function closeAboutSuggestion(ctx: TenantContext): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx
      .update(aboutSuggestions)
      .set({ closedAt: sql`now()` })
      .where(and(eq(aboutSuggestions.userId, ctx.userId), isNull(aboutSuggestions.closedAt))),
  );
}

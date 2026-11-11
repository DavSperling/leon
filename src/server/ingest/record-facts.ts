import { and, eq, sql } from 'drizzle-orm';
import { type RetraitRequest, type SessionFactsPayload, TEXTE_MAX } from '@/capture/api-contract';
import { maskSecrets } from '@/capture/mask-secrets';
import { factText, recheckCommand, type SessionFacts } from '@/capture/session-facts';
import type { TenantContext } from '@/server/auth/tenant-context';
import { apiTokens } from '@/server/db/schema/api-tokens';
import { organizations } from '@/server/db/schema/auth';
import { sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { recordProject, upsertSource } from './ingest-turns';

// Comme à la relève sur le poste (factText). Une PR dont le masque changerait le dépôt n'aurait plus une clé que
// SessionFactsSchema relit : elle est retirée, plutôt que de rendre illisibles tous les faits de la session.
// Une commande hors de la forme réduite est remplacée, et non refusée : un 400 perdrait toute la session.
function cleanFacts(faits: SessionFacts): SessionFacts {
  return {
    ...faits,
    branche: faits.branche === null ? null : factText(faits.branche),
    prs: faits.prs.filter((pr) => maskSecrets(pr.repo) === pr.repo),
    fichiers: faits.fichiers.map((file) => factText(file)),
    commandes: faits.commandes.map((command) => ({
      ...command,
      texte: recheckCommand(command.texte),
    })),
    taches: faits.taches.map((task) => ({ ...task, texte: factText(task.texte, TEXTE_MAX) })),
  };
}

// Les faits d'une session vont dans `sources.metadata` de la source du porteur (D4), créée si elle manque :
// jamais dans celle d'un collègue, même partagée avec lui (upsertSource filtre sur le propriétaire). L'envoi
// est idempotent : les faits sont remplacés, sauf `externe` et `fin`, qui restent vrais une fois vus (un
// rattrapage peu après le SessionEnd envoie `fin: false`, le fichier venant de changer). `fin_le` date la dernière
// vraie fin : un tour arrivé après elle dit au résumé que la session a repris (resume-worker.ts). `faits_le` date
// chaque envoi (le now() de Postgres, comme `fin_le`) : le résumé ne s'écrit que dans l'heure qui suit le dernier. Les
// usages de l'outil (C7 révisé) sont remplacés eux aussi : absents du corps, aucun. Rend la source, et si son outil a
// l'usage `resume` : la route met alors le résumé en file (T23).
// Le retrait daté (T43, amendé le 10/11) : après un retrait de l'outil sur ce jeton (withdrawUsages), des faits sans
// `accord_le`, ou sous un accord qui ne lui est pas postérieur, arrivent sans usage. Le jeton est lu FOR SHARE avant
// la source : un retrait en cours (il tient la ligne) fait attendre ces faits, qui lisent ensuite sa date ; des faits
// en cours font attendre le retrait, qui vide ensuite leurs usages. FOR KEY SHARE ne suffirait pas : l'UPDATE du
// retrait ne touche aucune clé et passerait. verifyApiToken écrit last_used_at hors de toute transaction, avant : il ne
// tient rien en attendant.
// L'ordre des verrous : l'organisation (FOR KEY SHARE, comme lockTarget), puis le jeton, puis les sources. Les
// suppressions (lockMembers) prennent l'organisation d'abord, puis révoquent les jetons : sans elle en premier, ces faits
// tiendraient le jeton en attendant l'organisation (la clé étrangère d'une source neuve) que la suppression tient en
// attendant le jeton. Le retrait ne prend pas l'organisation : il prend le jeton, puis les sources.
export async function recordFacts(
  ctx: TenantContext,
  payload: SessionFactsPayload,
  tokenId: string,
): Promise<{ sourceId: string; resume: boolean }> {
  const faits = cleanFacts(payload.faits);
  return withTenant(ctx, async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, ctx.tenantId))
      .for('key share');
    // shortcut: la marque vaut pour le jeton qui a dit le retrait ; un même jeton posé sur deux ordinateurs
    // (--with-token, LEON_TOKEN partagé) coupe aussi les usages de l'autre jusqu'à un nouvel accord sur celui-ci, passer
    // à un identifiant d'ordinateur si on veut ce cas.
    const [token] = await tx
      .select({
        retire: sql<boolean | null>`(${apiTokens.retraits} ->> ${payload.kind})::timestamptz
          >= coalesce(${payload.accord_le ?? null}::timestamptz, '-infinity')`,
      })
      .from(apiTokens)
      .where(eq(apiTokens.id, tokenId))
      .for('share');
    const usages = token?.retire ? [] : (payload.usages ?? []);
    const sourceId = await upsertSource(
      tx,
      ctx,
      { kind: payload.kind, external_id: payload.external_id },
      undefined,
    );
    await recordProject(tx, sourceId, payload.project);
    const externe = sql`(${faits.externe}::boolean or coalesce(${sources.metadata} #> '{faits,externe}' = 'true'::jsonb, false))`;
    const fin = sql`(${payload.fin}::boolean or coalesce(${sources.metadata} -> 'fin' = 'true'::jsonb, false))`;
    const finLe = payload.fin ? sql`jsonb_build_object('fin_le', now())` : sql`'{}'::jsonb`;
    const [updated] = await tx
      .update(sources)
      .set({
        metadata: sql`${sources.metadata} || jsonb_build_object(
          'faits', ${JSON.stringify(faits)}::jsonb || jsonb_build_object('externe', ${externe}),
          'branche', ${faits.branche}::text,
          'accord', ${payload.accord}::int,
          'usages', ${JSON.stringify(usages)}::jsonb,
          'fin', ${fin},
          'faits_le', now()) || ${finLe}`,
      })
      .where(eq(sources.id, sourceId))
      .returning({
        resume: sql<boolean>`coalesce(${sources.metadata} -> 'usages' @> '["resume"]'::jsonb, false)`,
      });
    return { sourceId, resume: updated?.resume === true };
  });
}

// Le retrait de l'accord d'un outil (T43, amendé le 06/11) : les usages de toutes les sessions de cet outil dont le
// porteur est l'auteur, dans son organisation, sont vidés ; jamais ceux d'un collègue, même partagés avec lui. Le
// résumé et l'état du fil relisent l'usage avant l'appel et à l'écriture : plus rien ne part au modèle. Les faits
// restent ; un envoi de faits sous un accord postérieur au retrait remplace les usages (recordFacts).
// D'abord, dans la même transaction, la date du retrait sur la ligne du jeton (amendé le 10/11) : la plus grande des
// deux, une date plus ancienne redite ne rouvre rien. L'UPDATE prend le verrou de la ligne (voir recordFacts).
// shortcut: le vidage retire aussi les usages des sessions déjà envoyées par un autre ordinateur qui garde son accord,
// jusqu'à leur prochain envoi ; filtrer par jeton quand les sources garderont le jeton qui les a envoyées.
export async function withdrawUsages(
  ctx: TenantContext,
  tokenId: string,
  { outil, retire_le }: RetraitRequest,
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx
      .update(apiTokens)
      .set({
        retraits: sql`${apiTokens.retraits} || jsonb_build_object(${outil}::text,
          greatest(${retire_le}::timestamptz, (${apiTokens.retraits} ->> ${outil})::timestamptz))`,
      })
      .where(
        and(
          eq(apiTokens.id, tokenId),
          eq(apiTokens.tenantId, ctx.tenantId),
          eq(apiTokens.userId, ctx.userId),
        ),
      );
    await tx.execute(sql`update sources s set metadata = s.metadata || '{"usages": []}'::jsonb
      where s.tenant_id = ${ctx.tenantId} and s.owner_user_id = ${ctx.userId} and s.kind = ${outil}
        and s.metadata->'usages' <> '[]'::jsonb`);
  });
}

import { eq, sql } from 'drizzle-orm';
import { type SessionFactsPayload, TEXTE_MAX } from '@/capture/api-contract';
import { maskSecrets } from '@/capture/mask-secrets';
import { factText, recheckCommand, type SessionFacts } from '@/capture/session-facts';
import type { TenantContext } from '@/server/auth/tenant-context';
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
// rattrapage peu après le SessionEnd envoie `fin: false`, le fichier venant de changer).
export async function recordFacts(ctx: TenantContext, payload: SessionFactsPayload): Promise<void> {
  const faits = cleanFacts(payload.faits);
  await withTenant(ctx, async (tx) => {
    const sourceId = await upsertSource(
      tx,
      ctx,
      { kind: payload.kind, external_id: payload.external_id },
      undefined,
    );
    await recordProject(tx, sourceId, payload.project);
    const externe = sql`(${faits.externe}::boolean or coalesce(${sources.metadata} #> '{faits,externe}' = 'true'::jsonb, false))`;
    const fin = sql`(${payload.fin}::boolean or coalesce(${sources.metadata} -> 'fin' = 'true'::jsonb, false))`;
    // shortcut: `fin` est seulement rangé, la file du résumé le lira au lot 6 (T23).
    await tx
      .update(sources)
      .set({
        metadata: sql`${sources.metadata} || jsonb_build_object(
          'faits', ${JSON.stringify(faits)}::jsonb || jsonb_build_object('externe', ${externe}),
          'branche', ${faits.branche}::text,
          'accord', ${payload.accord}::int,
          'fin', ${fin})`,
      })
      .where(eq(sources.id, sourceId));
  });
}

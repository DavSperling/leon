import { eq, sql } from 'drizzle-orm';
import type { SessionFactsPayload } from '@/capture/api-contract';
import { maskSecrets } from '@/capture/mask-secrets';
import type { SessionFacts } from '@/capture/session-facts';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { recordProject, upsertSource } from './ingest-turns';

const TEXTE_MAX = 200; // une commande, une tâche (C1)

// Comme à la relève sur le poste : masqué, sans caractère nul ni moitié d'emoji, qu'un jsonb refuse. Le masque
// peut allonger le texte : la borne est réappliquée après.
function clean(text: string, max?: number): string {
  return maskSecrets(text.replaceAll('\u0000', '')).slice(0, max).toWellFormed();
}

function cleanFacts(faits: SessionFacts): SessionFacts {
  return {
    ...faits,
    branche: faits.branche === null ? null : clean(faits.branche),
    prs: faits.prs.map((pr) => ({ ...pr, repo: clean(pr.repo) })),
    fichiers: faits.fichiers.map((file) => clean(file)),
    commandes: faits.commandes.map((command) => ({
      ...command,
      texte: clean(command.texte, TEXTE_MAX),
    })),
    taches: faits.taches.map((task) => ({ ...task, texte: clean(task.texte, TEXTE_MAX) })),
  };
}

// Les faits d'une session vont dans `sources.metadata` de la source du porteur (D4), créée si elle manque :
// jamais dans celle d'un collègue, même partagée avec lui (upsertSource filtre sur le propriétaire). L'envoi
// est idempotent : les faits sont remplacés, sauf `externe`, qui reste vrai une fois vu.
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
    // shortcut: `fin` est seulement rangé, la file du résumé le lira au lot 6 (T23).
    await tx
      .update(sources)
      .set({
        metadata: sql`${sources.metadata} || jsonb_build_object(
          'faits', ${JSON.stringify(faits)}::jsonb || jsonb_build_object('externe', ${externe}),
          'branche', ${faits.branche}::text,
          'accord', ${payload.accord}::int,
          'fin', ${payload.fin}::boolean)`,
      })
      .where(eq(sources.id, sourceId));
  });
}

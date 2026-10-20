import { eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { ingestRuns } from '@/server/db/schema/memory';
import { withTenant } from '@/server/db/with-tenant';
import { safeErrorSummary } from '@/server/log';

const ERROR_MAX_CHARS = 200;

// Le résumé de l'erreur ne contient jamais de texte de conversation (safeErrorSummary).
export async function failRun(ctx: TenantContext, runId: string, error: unknown): Promise<void> {
  await withTenant(ctx, (tx) =>
    tx
      .update(ingestRuns)
      .set({
        status: 'failed',
        error: safeErrorSummary(error).slice(0, ERROR_MAX_CHARS),
        updatedAt: new Date(),
      })
      .where(eq(ingestRuns.id, runId)),
  );
}

import { inArray } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { passages } from '@/server/db/schema/search';
import { withTenant } from '@/server/db/with-tenant';

// Le texte entier des passages que la recherche vient de rendre au lecteur. La recherche n'en donne qu'un extrait
// surligné (deux fragments de 30 mots), trop court pour répondre. La relecture se fait sous les droits du lecteur :
// un passage qu'il ne voit plus (source supprimée, droits retirés entre-temps) n'est pas rendu.
export async function readPassageTexts(
  ctx: TenantContext,
  passageIds: readonly string[],
): Promise<Map<string, string>> {
  if (passageIds.length === 0) return new Map();
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ id: passages.id, text: passages.text })
      .from(passages)
      .where(inArray(passages.id, [...passageIds])),
  );
  return new Map(rows.map((row) => [row.id, row.text]));
}

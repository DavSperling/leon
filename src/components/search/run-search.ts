import type { TenantContext } from '@/server/auth/tenant-context';
import { getEmbedder } from '@/server/embeddings/registry';
import { env } from '@/server/env';
import { logError } from '@/server/log';
import { searchPassages } from '@/server/search/search';
import type { SearchPage } from '@/server/search/types';

// La recherche de la page d'accueil, sous les droits de l'utilisateur. Une panne rend `null` (la page dit alors un
// message fixe) : l'erreur de la base porte la requête et son vecteur, elle ne va que dans le journal, qui la masque.
export async function runSearch(
  ctx: TenantContext,
  q: string,
  page: number,
): Promise<SearchPage | null> {
  try {
    return await searchPassages(ctx, { query: q, page, embedder: getEmbedder(env) });
  } catch (error) {
    logError('search.page_failed', error);
    return null;
  }
}

import { eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { users } from '@/server/db/schema/auth';
import type { Embedder } from '@/server/embeddings/embedder';
import { createFakeEmbedder } from '@/server/embeddings/fake-embedder';
import { indexIngestRun } from '@/server/search/index-run';
import { adminDb, adminPool } from './db';
import { createTestTenant } from './fixtures';
import { type SeededRun, seedRun } from './seed-search';

// Jeux de données de la recherche : une source (seedRun) déjà découpée en passages et, par défaut, munie des vecteurs
// du fournisseur factice, comme après le passage du worker d'indexation. La base de test est partagée : chaque
// groupe de tests prend sa propre organisation (newTeam) et la vide à la fin (dropTeams).

export async function seedIndexed(
  owner: TenantContext,
  input: Parameters<typeof seedRun>[1],
  embedder: Embedder | null = createFakeEmbedder(),
): Promise<SeededRun> {
  const seeded = await seedRun(owner, input);
  if ((await indexIngestRun(seeded.job, { embedder })) !== 'indexe') {
    throw new Error('source de test non indexée');
  }
  return seeded;
}

export async function emailOf(ctx: TenantContext): Promise<string> {
  const [row] = await adminDb
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, ctx.userId));
  if (!row) throw new Error('utilisateur de test introuvable');
  return row.email;
}

export async function newTeam(
  names: string[],
  created: string[],
): Promise<{ tenantId: string; members: TenantContext[] }> {
  const team = await createTestTenant(names);
  created.push(team.tenantId);
  return team;
}

// Les passages sans vecteur d'un test ne doivent pas rester dans la file des vecteurs manquants des autres fichiers.
export async function dropTeams(tenantIds: string[]): Promise<void> {
  await adminPool.query('delete from sources where tenant_id = any($1)', [tenantIds]);
}

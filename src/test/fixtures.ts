import { randomUUID } from 'node:crypto';
import {
  PROVIDER_IDS,
  type ProviderId,
  type SourceKind,
  type TurnCaptureMode,
} from '@/capture/turn';
import { principalsFor, type TenantContext } from '@/server/auth/tenant-context';
import type { ConnectionStatus } from '@/server/connectors/connections';
import { encryptSecret } from '@/server/connectors/crypto';
import { members, organizations, users } from '@/server/db/schema/auth';
import { connections } from '@/server/db/schema/connections';
import { sources, turns } from '@/server/db/schema/memory';
import { adminDb } from './db';

// Fixtures : préfixe « seed » = insertion par le rôle propriétaire, hors RLS.
// Chaque appel crée ses propres lignes (ids aléatoires) : la base de test est partagée.

const CONNECTOR_MODES = Object.fromEntries(PROVIDER_IDS.map((id) => [id, 'connector'])) as Record<
  ProviderId,
  'connector'
>;

const CAPTURE_MODE_BY_KIND: Record<SourceKind, TurnCaptureMode> = {
  claude_code: 'file',
  claude_ai: 'network',
  chatgpt: 'network',
  mcp_remember: 'manual',
  document: 'manual',
  passation: 'manual',
  ...CONNECTOR_MODES,
};

// Pas de compte `account` : les fixtures n'ont jamais de mot de passe.
export async function createTestUser(tenantId: string, name: string): Promise<TenantContext> {
  const [user] = await adminDb
    .insert(users)
    .values({ name, email: `${randomUUID()}@test.leon`, emailVerified: false })
    .returning({ id: users.id });
  if (!user) throw new Error('utilisateur de test non créé');
  await adminDb
    .insert(members)
    .values({ organizationId: tenantId, userId: user.id, role: 'member', createdAt: new Date() });
  return { tenantId, userId: user.id, principals: principalsFor(user.id, tenantId) };
}

export async function createTestTenant(
  memberNames: string[],
): Promise<{ tenantId: string; members: TenantContext[] }> {
  const [organization] = await adminDb
    .insert(organizations)
    .values({ name: 'Organisation de test', slug: `test-${randomUUID()}`, createdAt: new Date() })
    .returning({ id: organizations.id });
  if (!organization) throw new Error('organisation de test non créée');
  const contexts: TenantContext[] = [];
  for (const name of memberNames) contexts.push(await createTestUser(organization.id, name));
  return { tenantId: organization.id, members: contexts };
}

// Une source privée à son auteur et un tour.
export async function seedSource(
  ctx: TenantContext,
  input: { kind?: SourceKind; title?: string; text?: string } = {},
): Promise<{ sourceId: string; turnId: string }> {
  const kind = input.kind ?? 'claude_code';
  const ts = new Date();
  const acl = [ctx.userId];
  const [source] = await adminDb
    .insert(sources)
    .values({
      tenantId: ctx.tenantId,
      kind,
      externalId: randomUUID(),
      ownerUserId: ctx.userId,
      title: input.title ?? null,
      acl,
      lastTurnAt: ts,
    })
    .returning({ id: sources.id });
  if (!source) throw new Error('source de test non créée');
  const [turn] = await adminDb
    .insert(turns)
    .values({
      tenantId: ctx.tenantId,
      sourceId: source.id,
      externalId: randomUUID(),
      role: 'user',
      text: input.text ?? 'Tour de test.',
      ts,
      captureMode: CAPTURE_MODE_BY_KIND[kind],
      acl,
    })
    .returning({ id: turns.id });
  if (!turn) throw new Error('tour de test non créé');
  return { sourceId: source.id, turnId: turn.id };
}

// Une connexion de test, secret chiffré comme en production (clé de TEST_ENV). Elle n'est pas due
// par défaut (`nextSyncAt` nul) : voir « Connexions dans les tests » dans le plan des connecteurs.
export async function seedConnection(
  ctx: TenantContext,
  input: { provider?: ProviderId; status?: ConnectionStatus; nextSyncAt?: Date | null } = {},
): Promise<string> {
  const id = randomUUID();
  const secret = encryptSecret(
    JSON.stringify({ token: 'secret-de-test' }),
    `${ctx.tenantId}:${id}`,
  );
  await adminDb.insert(connections).values({
    id,
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    provider: input.provider ?? 'github',
    label: 'Connexion de test',
    secret,
    secretHint: 'test',
    status: input.status ?? 'active',
    since: new Date(Date.now() - 30 * 24 * 3_600_000),
    nextSyncAt: input.nextSyncAt ?? null,
    acl: [ctx.tenantId],
  });
  return id;
}

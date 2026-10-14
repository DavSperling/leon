import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { CaptureMode, SourceKind } from '@/capture/turn';
import type { CardStatus, FactStatus } from '@/lib/enums';
import { principalsFor, type TenantContext } from '@/server/auth/tenant-context';
import { members, organizations, users } from '@/server/db/schema/auth';
import { cards, cardTypes, facts, sources, turns } from '@/server/db/schema/memory';
import { adminDb } from './db';

// Fixtures : préfixe « seed » = insertion par le rôle propriétaire, hors RLS.
// Chaque appel crée ses propres lignes (ids aléatoires) : la base de test est partagée.

const CAPTURE_MODE_BY_KIND: Record<SourceKind, CaptureMode> = {
  claude_code: 'file',
  claude_ai: 'network',
  chatgpt: 'network',
  mcp_remember: 'manual',
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

// Le type propre au tenant l'emporte sur le type du socle de même slug.
export async function seedCard(
  tenantId: string,
  input: {
    title: string;
    typeSlug: string;
    acl: string[];
    status?: CardStatus;
    createdBy?: string;
  },
): Promise<string> {
  const [type] = await adminDb
    .select({ id: cardTypes.id })
    .from(cardTypes)
    .where(
      and(
        eq(cardTypes.slug, input.typeSlug),
        or(isNull(cardTypes.tenantId), eq(cardTypes.tenantId, tenantId)),
      ),
    )
    .orderBy(sql`${cardTypes.tenantId} nulls last`)
    .limit(1);
  if (!type) throw new Error(`type de fiche inconnu : ${input.typeSlug}`);
  const [card] = await adminDb
    .insert(cards)
    .values({
      tenantId,
      typeId: type.id,
      title: input.title,
      status: input.status ?? 'confirmed',
      acl: input.acl,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: cards.id });
  if (!card) throw new Error('fiche de test non créée');
  return card.id;
}

// La citation est l'énoncé lui-même ; recorded_at et valid_from valent maintenant par défaut.
export async function seedFact(
  tenantId: string,
  input: {
    cardId: string;
    sourceId: string;
    turnId: string;
    authorId: string;
    predicate: string;
    statement: string;
    acl: string[];
    status?: FactStatus;
    sensitivity?: 'shareable' | 'sensitive';
    singleValued?: boolean;
    sourceKind?: SourceKind;
    validFrom?: Date;
  },
): Promise<string> {
  const [fact] = await adminDb
    .insert(facts)
    .values({
      tenantId,
      cardId: input.cardId,
      predicate: input.predicate,
      statement: input.statement,
      quote: input.statement,
      sourceId: input.sourceId,
      turnId: input.turnId,
      quoteStart: 0,
      quoteEnd: input.statement.length,
      sourceKind: input.sourceKind ?? 'claude_code',
      authorId: input.authorId,
      validFrom: input.validFrom ?? new Date(),
      status: input.status ?? 'active',
      sensitivity: input.sensitivity ?? 'shareable',
      singleValued: input.singleValued ?? false,
      confidence: 0.9,
      acl: input.acl,
    })
    .returning({ id: facts.id });
  if (!fact) throw new Error('fait de test non créé');
  return fact.id;
}

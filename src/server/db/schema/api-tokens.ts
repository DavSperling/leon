import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations, users } from './auth';

// Jetons d'accès : seul le SHA-256 du jeton est stocké. Pas de RLS, toujours filtrés par user_id et tenant_id.
// kind : manuel (Réglages), ordinateur (`leon login`) ou assistant (OAuth) ; seul un assistant expire et se renouvelle.
export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenHint: text('token_hint').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  kind: text('kind', { enum: ['manuel', 'ordinateur', 'assistant'] })
    .notNull()
    .default('manuel'),
  clientName: text('client_name'),
  clientHost: text('client_host'),
  clientRef: text('client_ref'),
  grantId: text('grant_id').unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  refreshHash: text('refresh_hash').unique(),
  refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
  previousRefreshHash: text('previous_refresh_hash').unique(),
  refreshRotatedAt: timestamp('refresh_rotated_at', { withTimezone: true }),
  // La date du dernier retrait de chaque outil sur ce jeton (0063, T43) : recordFacts ignore les usages des faits
  // envoyés sous un accord qui ne la suit pas.
  retraits: jsonb('retraits').$type<Record<string, string>>().notNull().default({}),
});

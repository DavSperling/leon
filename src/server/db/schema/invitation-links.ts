import { pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations, users } from './auth';

// Liens d'invitation (0033) : seul le SHA-256 du secret est stocké. Pas de RLS, retrouvés par leur empreinte.
// 0044 : le nom saisi par l'invitant et le poste de l'invité (identifiants de src/lib/onboarding.ts), recopié sur le
// membre à l'arrivée ; nuls pour les liens d'avant.
export const invitationLinks = pgTable('invitation_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  inviteeName: text('invitee_name'),
  department: text('department'),
  job: text('job'),
  seniority: smallint('seniority'),
});

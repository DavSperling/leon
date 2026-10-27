import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ACTION_KINDS, ACTION_STATUSES } from '@/lib/actions';
import { organizations, users } from './auth';
import { connections } from './connections';
import { discussions } from './search';

// Les actions proposées par Leon et confirmées d'un clic (0037-actions.sql) : aussi le journal des écritures.
// Le module n'exporte que la table : le contrat de schéma lit Object.values du module.

export const actions = pgTable('actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  discussionId: uuid('discussion_id').references(() => discussions.id, { onDelete: 'set null' }),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'set null' }),
  kind: text('kind', { enum: ACTION_KINDS }).notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull(),
  status: text('status', { enum: ACTION_STATUSES }).notNull().default('proposee'),
  result: jsonb('result').$type<Record<string, unknown>>(),
  acl: uuid('acl').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp()`),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

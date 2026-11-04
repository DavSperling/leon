import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PROVIDER_IDS } from '@/capture/turn';
import { organizations, users } from './auth';

// Connexions aux outils de l'équipe (0008-connecteurs.sql) et dépôts d'équipe (0047-depots-equipe.sql). Le module
// n'exporte que des tables : le contrat de schéma lit Object.values du module.

const CONNECTION_STATUSES = ['active', 'paused', 'error'] as const;

export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider', { enum: PROVIDER_IDS }).notNull(),
  label: text('label').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  secret: text('secret').notNull(),
  secretHint: text('secret_hint').notNull(),
  status: text('status', { enum: CONNECTION_STATUSES }).notNull().default('active'),
  cursor: text('cursor'),
  since: timestamp('since', { withTimezone: true }).notNull(),
  nextSyncAt: timestamp('next_sync_at', { withTimezone: true }),
  syncLockAt: timestamp('sync_lock_at', { withTimezone: true }),
  lastSyncStartedAt: timestamp('last_sync_started_at', { withTimezone: true }),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  itemsSynced: integer('items_synced').notNull().default(0),
  acl: uuid('acl').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Les dépôts GitHub que l'administrateur partage avec l'équipe (décision D). `project` :
// `github.com/<propriétaire>/<dépôt>` en minuscules, unique par organisation. Toute l'équipe lit
// (acl = [tenant_id], contrôlé par la base) ; seuls les propriétaires et administrateurs écrivent.
export const depotsEquipe = pgTable('depots_equipe', {
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  project: text('project').notNull(),
  acl: uuid('acl').array().notNull(),
  choisiPar: uuid('choisi_par')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

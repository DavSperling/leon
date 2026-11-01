import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PASSATION_TYPES } from '@/capture/passation-format';
import { organizations, users } from './auth';
import { sources } from './memory';

// Tables des notes de passation (0043-passations.sql). La note est une source de type `passation`.

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });
const acl = () => uuid('acl').array().notNull();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const passationItems = pgTable('passation_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  // Clé étrangère composée (tenant_id, source_id) en SQL, on delete cascade.
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  numero: text('numero').notNull(),
  type: text('type', { enum: PASSATION_TYPES }).notNull(),
  texte: text('texte').notNull(),
  project: text('project').notNull(),
  branch: text('branch'),
  authorUserId: uuid('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  remplaceePar: uuid('remplacee_par'),
  acl: acl(),
  createdAt: createdAt(),
});

export const passationLiens = pgTable('passation_liens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id'),
  relation: text('relation').notNull(),
  cible: text('cible').notNull(),
  acl: acl(),
  createdAt: createdAt(),
});

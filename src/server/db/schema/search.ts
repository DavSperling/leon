import { sql } from 'drizzle-orm';
import {
  boolean,
  halfvec,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DiscussionCitation } from '@/lib/discussion-events';
import { organizations, users } from './auth';
import { sources, turns } from './memory';

// L'index de recherche (0011-passages.sql) : les passages des tours et leurs vecteurs. La colonne générée
// `tsv` (plein texte français et simple) n'y figure pas : Postgres la calcule, la recherche la lit en SQL.
// Les clés étrangères sont composées avec tenant_id en SQL ; les références ci-dessous sont indicatives.

const acl = () => uuid('acl').array().notNull();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const passages = pgTable('passages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  turnId: uuid('turn_id')
    .notNull()
    .references(() => turns.id, { onDelete: 'cascade' }),
  ord: integer('ord').notNull(),
  text: text('text').notNull(),
  // Positions dans le texte du tour ; le texte du passage en retire les marqueurs de surlignage. En unités
  // UTF-16 (chunkText, `text.slice`) : un émoji y vaut 2 et 1 pour `substr` de Postgres. À ne lire qu'en
  // TypeScript, jamais pour découper le tour en SQL.
  charStart: integer('char_start').notNull(),
  charEnd: integer('char_end').notNull(),
  ts: timestamp('ts', { withTimezone: true }).notNull(),
  authorName: text('author_name'),
  authorEmail: text('author_email'),
  acl: acl(),
  createdAt: createdAt(),
});

// Un vecteur par passage et par modèle. 1 024 dimensions (EMBEDDING_DIMS, C3 du plan du deuxième jet).
export const passageVectors = pgTable(
  'passage_vectors',
  {
    passageId: uuid('passage_id')
      .notNull()
      .references(() => passages.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull(),
    model: text('model').notNull(),
    embedding: halfvec('embedding', { dimensions: 1024 }).notNull(),
    acl: acl(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.passageId, table.model] })],
);

// Les discussions avec Leon (0012-discussions.sql, C9 du plan du deuxième jet) : privées à leur auteur
// (acl = [user_id], contrôlé par la base). Les messages ne se suppriment ni ne se réécrivent ; la discussion ne
// change que de date (`updated_at`, seule colonne que l'app peut modifier).
export const discussions = pgTable('discussions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  acl: acl(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const discussionMessages = pgTable('discussion_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  // Clé étrangère composée (tenant_id, discussion_id) en SQL.
  discussionId: uuid('discussion_id')
    .notNull()
    .references(() => discussions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  citations: jsonb('citations').$type<DiscussionCitation[]>().notNull().default([]),
  acl: acl(),
  // Heure d'écriture de la ligne (clock_timestamp() en SQL) : l'ordre des messages.
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp()`),
});

// Le point du matin de chaque utilisateur sur chaque projet (0030-points-du-matin.sql, C9 du plan du deuxième jet) :
// un cache, refait en place, privé à son utilisateur (acl = [user_id], contrôlé par la base). Aucune suppression ;
// seules les colonnes du recalcul et de la lecture peuvent changer.
export const briefings = pgTable('briefings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  project: text('project').notNull(),
  markdown: text('markdown').notNull(),
  // Toutes les sources fournies au modèle, citées ou non : la lecture vérifie qu'elles sont encore visibles.
  sourceIds: uuid('source_ids').array().notNull().default(sql`'{}'::uuid[]`),
  preparedAt: timestamp('prepared_at', { withTimezone: true }).notNull(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  stale: boolean('stale').notNull().default(false),
  acl: acl(),
});

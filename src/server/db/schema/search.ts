import { halfvec, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './auth';
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

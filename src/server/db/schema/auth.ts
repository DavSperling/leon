import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Tables de Better Auth (0002-auth.sql) : noms de colonnes en camelCase, tels que Better Auth les génère.
export const users = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  twoFactorEnabled: boolean('twoFactorEnabled').notNull().default(false),
  about: text('about'),
  // Posé à la suppression du compte (0039) : la ligne reste, vidée de ce qui rend la personne joignable.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  metadata: text('metadata'),
});

export const members = pgTable('member', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
});

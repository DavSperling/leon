import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { members, organizations } from './auth';

// Les groupes (0055-groupes.sql) : un par service des membres, tenu à jour par la base, et les groupes libres d'un
// administrateur. RLS : l'organisation courante ; écrire est réservé aux propriétaires et administrateurs. Le module
// n'exporte que des tables : le contrat de schéma lit Object.values du module.

export const groupes = pgTable('groupes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  service: text('service'), // identifiant du service (DEPARTMENTS) ; sinon `nom`
  nom: text('nom'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const membresGroupe = pgTable(
  'membres_groupe',
  {
    tenantId: uuid('tenant_id').notNull(),
    groupeId: uuid('groupe_id')
      .notNull()
      .references(() => groupes.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.groupeId, table.memberId] })],
);

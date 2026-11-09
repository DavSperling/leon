import { boolean, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { members, organizations } from './auth';

// Qui est le manager de qui, et ce que chaque manager suit des gens sous lui (0054, 0057). RLS : l'organisation courante.
export const reportingLines = pgTable('reporting_lines', {
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id')
    .primaryKey()
    .references(() => members.id, { onDelete: 'cascade' }),
  managerId: uuid('manager_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
});

export const managerFollows = pgTable(
  'manager_follows',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    managerId: uuid('manager_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    // Nul : toutes les familles, comme sans ligne.
    families: text('families').array(),
    // Faux : ce manager ne lit plus le privé de cette personne (0057).
    voitTout: boolean('voit_tout').notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.managerId, table.memberId] })],
);

// Sans ligne, les managers lisent le privé des gens sous eux (0057). RLS : écrit par un propriétaire ou un administrateur.
export const reglagesOrganisation = pgTable('reglages_organisation', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  managersVoientTout: boolean('managers_voient_tout').notNull().default(true),
});

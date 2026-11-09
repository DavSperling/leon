import { pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { members, organizations } from './auth';

// Qui est le manager de qui, et ce que chaque manager suit des gens sous lui (0054). RLS : l'organisation courante.
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
    families: text('families').array().notNull(),
  },
  (table) => [primaryKey({ columns: [table.managerId, table.memberId] })],
);

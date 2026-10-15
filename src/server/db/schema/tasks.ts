import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  TASK_ACTOR_KINDS,
  TASK_EVENT_KINDS,
  TASK_ORIGINS,
  TASK_PRIORITIES,
  TASK_STATUS_CATEGORIES,
} from '@/lib/enums';
import type { ViewConfig } from '@/lib/tasks/view-config';
import { organizations, users } from './auth';

// Tables des tâches (0007-taches.sql). Les clés étrangères composées (tenant_id, …), les CHECK,
// la RLS et les droits de leon_app ne sont déclarés que dans la migration.

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });
const userId = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const acl = () => uuid('acl').array().notNull();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const taskProjects = pgTable('task_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  lastNumber: integer('last_number').notNull().default(0),
  acl: acl(),
  createdAt: createdAt(),
});

export const taskStatuses = pgTable('task_statuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  projectId: uuid('project_id').notNull(),
  label: text('label').notNull(),
  color: text('color').notNull(),
  category: text('category', { enum: TASK_STATUS_CATEGORIES }).notNull(),
  position: doublePrecision('position').notNull(),
  createdAt: createdAt(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  projectId: uuid('project_id').notNull(),
  number: integer('number').notNull(),
  statusId: uuid('status_id').notNull(),
  parentId: uuid('parent_id'),
  title: text('title').notNull(),
  descriptionMd: text('description_md').notNull().default(''),
  priority: text('priority', { enum: TASK_PRIORITIES }).notNull().default('none'),
  assigneeId: userId('assignee_id'),
  creatorId: userId('creator_id'),
  dueDate: date('due_date'),
  position: doublePrecision('position').notNull(),
  origin: text('origin', { enum: TASK_ORIGINS }).notNull(),
  statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  acl: acl(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const taskLabels = pgTable('task_labels', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  acl: acl(),
  createdAt: createdAt(),
});

export const taskLabelLinks = pgTable(
  'task_label_links',
  {
    tenantId: tenantId(),
    taskId: uuid('task_id').notNull(),
    labelId: uuid('label_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.labelId] })],
);

export const taskComments = pgTable('task_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  taskId: uuid('task_id').notNull(),
  authorId: userId('author_id'),
  bodyMd: text('body_md').notNull(),
  createdAt: createdAt(),
});

// payload : avant et après du champ changé ; jamais la description elle-même.
export const taskEvents = pgTable('task_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  taskId: uuid('task_id').notNull(),
  actorId: userId('actor_id'),
  actorKind: text('actor_kind', { enum: TASK_ACTOR_KINDS }).notNull(),
  client: text('client'),
  kind: text('kind', { enum: TASK_EVENT_KINDS }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const taskViews = pgTable('task_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  config: jsonb('config').$type<ViewConfig>().notNull(),
  isTeamDefault: boolean('is_team_default').notNull().default(false),
  acl: acl(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { CAPTURE_MODES, SOURCE_KINDS } from '@/capture/turn';
import { CARD_STATUSES, FACT_STATUSES, SENSITIVE_CATEGORIES } from '@/lib/enums';
import { organizations, users } from './auth';

// Tables de la mémoire (0003-memoire.sql). Les colonnes générées validity et search_tsv n'y figurent pas :
// elles ne servent qu'aux contraintes et aux requêtes SQL.

const SENSITIVITIES = ['shareable', 'sensitive'] as const;

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });
const acl = () => uuid('acl').array().notNull();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  kind: text('kind', { enum: SOURCE_KINDS }).notNull(),
  externalId: text('external_id').notNull(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  acl: acl(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  lastTurnAt: timestamp('last_turn_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const turns = pgTable('turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  text: text('text').notNull(),
  ts: timestamp('ts', { withTimezone: true }).notNull(),
  captureMode: text('capture_mode', { enum: CAPTURE_MODES }).notNull(),
  acl: acl(),
  createdAt: createdAt(),
});

export const ingestRuns = pgTable('ingest_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  turnIds: uuid('turn_ids').array().notNull(),
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
    .notNull()
    .default('queued'),
  step: text('step', { enum: ['triage', 'extraction', 'placement', 'done'] })
    .notNull()
    .default('triage'),
  triage: jsonb('triage').$type<Record<string, unknown>>(),
  error: text('error'),
  acl: acl(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const factCandidates = pgTable('fact_candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  ingestRunId: uuid('ingest_run_id')
    .notNull()
    .references(() => ingestRuns.id, { onDelete: 'cascade' }),
  turnId: uuid('turn_id')
    .notNull()
    .references(() => turns.id, { onDelete: 'cascade' }),
  statement: text('statement').notNull(),
  predicate: text('predicate').notNull(),
  typeHint: text('type_hint').notNull(),
  value: text('value'),
  mentions: jsonb('mentions')
    .$type<{
      subject: { name: string; email: string | null; domain: string | null };
      others: string[];
    }>()
    .notNull(),
  quote: text('quote').notNull(),
  quoteStart: integer('quote_start'),
  quoteEnd: integer('quote_end'),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validTo: timestamp('valid_to', { withTimezone: true }),
  confidence: real('confidence').notNull(),
  sensitivity: text('sensitivity', { enum: SENSITIVITIES }).notNull(),
  sensitiveCategory: text('sensitive_category', { enum: SENSITIVE_CATEGORIES }),
  factAcl: uuid('fact_acl').array().notNull(),
  status: text('status', { enum: ['pending', 'rejected', 'placed'] })
    .notNull()
    .default('pending'),
  rejectionReason: text('rejection_reason'),
  acl: acl(),
  createdAt: createdAt(),
});

// tenant_id et acl nuls : type du socle, visible de tous les tenants.
export const cardTypes = pgTable('card_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => organizations.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  label: text('label').notNull(),
  parentSlug: text('parent_slug'),
  status: text('status', { enum: ['proposed', 'validated'] })
    .notNull()
    .default('validated'),
  acl: uuid('acl').array(),
  createdAt: createdAt(),
});

export const predicates = pgTable('predicates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => organizations.id, { onDelete: 'cascade' }),
  typeSlug: text('type_slug').notNull(),
  slug: text('slug').notNull(),
  label: text('label').notNull(),
  singleValued: boolean('single_valued').notNull(),
});

export const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  typeId: uuid('type_id')
    .notNull()
    .references(() => cardTypes.id),
  title: text('title').notNull(),
  status: text('status', { enum: CARD_STATUSES }).notNull(),
  mergedInto: uuid('merged_into').references((): AnyPgColumn => cards.id),
  acl: acl(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const cardAliases = pgTable('card_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => cards.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  kind: text('kind', { enum: ['name', 'email', 'domain'] }).notNull(),
  acl: acl(),
  createdAt: createdAt(),
});

export const facts = pgTable('facts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => cards.id),
  predicate: text('predicate').notNull(),
  statement: text('statement').notNull(),
  value: text('value'),
  quote: text('quote').notNull(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id),
  turnId: uuid('turn_id')
    .notNull()
    .references(() => turns.id),
  quoteStart: integer('quote_start').notNull(),
  quoteEnd: integer('quote_end').notNull(),
  sourceKind: text('source_kind', { enum: SOURCE_KINDS }).notNull(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  validTo: timestamp('valid_to', { withTimezone: true }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  supersededBy: uuid('superseded_by').references((): AnyPgColumn => facts.id),
  status: text('status', { enum: FACT_STATUSES }).notNull(),
  sensitivity: text('sensitivity', { enum: SENSITIVITIES }).notNull(),
  singleValued: boolean('single_valued').notNull(),
  confidence: real('confidence').notNull(),
  acl: acl(),
  candidateId: uuid('candidate_id').references(() => factCandidates.id),
});

export const reviewItems = pgTable('review_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  kind: text('kind', {
    enum: ['sensitive_fact', 'entity_match', 'proposed_type', 'conflict'],
  }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: text('status', { enum: ['open', 'resolved'] })
    .notNull()
    .default('open'),
  resolution: jsonb('resolution').$type<Record<string, unknown>>(),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  acl: acl(),
  createdAt: createdAt(),
});

export const readLog = pgTable('read_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  client: text('client').notNull(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => cards.id),
  acl: acl(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

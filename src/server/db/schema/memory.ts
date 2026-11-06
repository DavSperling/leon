import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { AUTHOR_SIDES, SOURCE_KINDS, TURN_CAPTURE_MODES, TURN_ROLES } from '@/capture/turn';
import { organizations, users } from './auth';

// Tables du brut (0003-memoire.sql) : sources, tours, runs d'indexation, journal de lecture. Les faits et
// les fiches du premier jet n'existent plus (0010). Les passages et leurs vecteurs vivent dans search.ts.

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
  // Connexion d'origine (nulle pour les conversations) ; clé étrangère composée (tenant_id, connection_id) en SQL.
  connectionId: uuid('connection_id'),
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
  role: text('role', { enum: TURN_ROLES }).notNull(),
  text: text('text').notNull(),
  ts: timestamp('ts', { withTimezone: true }).notNull(),
  captureMode: text('capture_mode', { enum: TURN_CAPTURE_MODES }).notNull(),
  authorName: text('author_name'),
  authorEmail: text('author_email'),
  // Le côté de l'auteur d'après l'outil (nul : l'outil ne le dit pas), et une note que seule l'équipe voit.
  authorSide: text('author_side', { enum: AUTHOR_SIDES }),
  internalNote: boolean('internal_note').notNull().default(false),
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
  step: text('step', { enum: ['index', 'done'] })
    .notNull()
    .default('index'),
  error: text('error'),
  acl: acl(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const readLog = pgTable('read_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  client: text('client').notNull(),
  // L'outil MCP qui a rendu la lecture : fetch, search ou briefing (0039).
  tool: text('tool', { enum: ['fetch', 'search', 'briefing'] }).notNull(),
  // Source lue ; clé étrangère composée (tenant_id, source_id) en SQL, on delete cascade.
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  // Passage lu, s'il y en a un. Sans clé étrangère : la table des passages n'arrive qu'en 0011.
  passageId: uuid('passage_id'),
  acl: acl(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

// Les versions de la mémoire (0052-versions-memoire.sql, C12 du plan de la mémoire à disposition) : l'état d'un fil
// ou une note, v1, v2, v3, en ajout seul, privés à leur auteur (acl = [owner_user_id], contrôlé par la base). Seul
// deleteAccount supprime des lignes. Ni tour, ni passage : seule src/server/memory/versions.ts les lit.
export const versionsMemoire = pgTable('versions_memoire', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Un fil ou une note ; clé étrangère composée (tenant_id, source_id) en SQL, on delete cascade.
  sourceId: uuid('source_id').notNull(),
  n: integer('n').notNull(),
  texte: text('texte').notNull(),
  entrees: uuid('entrees').array().notNull().default(sql`'{}'::uuid[]`),
  tours: uuid('tours').array().notNull().default(sql`'{}'::uuid[]`),
  ecritPar: text('ecrit_par', { enum: ['serveur', 'modele', 'agent', 'humain'] }).notNull(),
  etape: text('etape'),
  modele: text('modele'),
  outil: text('outil'),
  session: text('session'),
  motif: text('motif', {
    enum: ['rangement', 'note', 'correction', 'acceptation', 'restauration'],
  }).notNull(),
  restaureDe: uuid('restaure_de').references((): AnyPgColumn => versionsMemoire.id),
  creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
  acl: acl(),
});

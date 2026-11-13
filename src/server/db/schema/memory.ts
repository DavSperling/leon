import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
  // Tour `user` injecté (true), tapé par la personne (false), ou inconnu (null : capté avant la marque, T43).
  injecte: boolean('injecte'),
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
  // L'outil qui a rendu la lecture, du MCP ou d'une route de lecture : fetch, search, briefing (0039), threads,
  // thread, versions (0064), lessons (0066).
  tool: text('tool', {
    enum: ['fetch', 'search', 'briefing', 'threads', 'thread', 'versions', 'lessons'],
  }).notNull(),
  // La session de l'outil où la lecture a eu lieu, quand le corps la donne (0064, D35) : son identifiant, pas un uuid.
  session: text('session'),
  // Source lue, ou leçon lue (0066) : exactement l'une des deux. Clés étrangères composées (tenant_id, source_id) et
  // (tenant_id, lecon_id) en SQL, on delete cascade.
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'cascade' }),
  leconId: uuid('lecon_id'),
  // Passage lu, s'il y en a un. Sans clé étrangère : la table des passages n'arrive qu'en 0011.
  passageId: uuid('passage_id'),
  acl: acl(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

// Les versions de la mémoire (0052-versions-memoire.sql, C12 du plan de la mémoire à disposition) : l'état d'un fil,
// une note ou une leçon (0066), v1, v2, v3, en ajout seul, privés à leur auteur (acl = [owner_user_id], contrôlé par
// la base). Seul deleteAccount supprime des lignes. Ni tour, ni passage : seule src/server/memory/versions.ts les lit.
export const versionsMemoire = pgTable('versions_memoire', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Un fil ou une note, ou une leçon (0066) : exactement l'une des deux. Clés étrangères composées (tenant_id,
  // source_id) et (tenant_id, lecon_id) en SQL, on delete cascade.
  sourceId: uuid('source_id'),
  leconId: uuid('lecon_id'),
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
  // Clés étrangères composées (tenant_id, source_id, restaure_de) et (tenant_id, lecon_id, restaure_de) en SQL : une
  // version de la même cible.
  restaureDe: uuid('restaure_de'),
  creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
  acl: acl(),
});

// Les leçons (0066-lecons.sql, C13 du plan de la mémoire à disposition, T55) : privées à leur auteur (acl =
// [owner_user_id], contrôlé par la base), avec un dépôt facultatif. Leur texte est leur dernière version
// (versions_memoire). Seul deleteAccount supprime des lignes ; l'app ne met à jour que acceptee_le, retiree_le et
// frequence.
export const lecons = pgTable('lecons', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projet: text('projet'),
  origine: text('origine', { enum: ['humain', 'regle'] }).notNull(),
  frequence: integer('frequence').notNull().default(0),
  accepteeLe: timestamp('acceptee_le', { withTimezone: true }).notNull().defaultNow(),
  retireeLe: timestamp('retiree_le', { withTimezone: true }),
  acl: acl(),
});

// Les fils déjà cités par le rappel dans une session (0065, T48) : jamais le message. Purgés après 24 h.
export const rappelsCites = pgTable(
  'rappels_cites',
  {
    tenantId: tenantId(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // L'id de session de l'outil, déclaré par la CLI (C8).
    session: text('session').notNull(),
    // Clé étrangère composée (tenant_id, fil_id) en SQL, on delete cascade.
    filId: uuid('fil_id').notNull(),
    creeLe: timestamp('cree_le', { withTimezone: true }).notNull().defaultNow(),
    acl: acl(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.ownerUserId, table.session, table.filId] }),
  ],
);

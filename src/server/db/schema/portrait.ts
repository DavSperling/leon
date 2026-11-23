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
import { AGENTS } from '@/server/portrait/agents';
import { organizations, users } from './auth';

// La fiche d'une personne, une ligne par fait (0076-lignes-fiche.sql) : privée à la personne (acl = [user_id], contrôlé
// par la base), une seule ligne par personne, genre et clé (contrainte unique en SQL). Seul deleteAccount supprime
// des lignes ; l'app ne met à jour que la valeur, sa provenance, le nombre de mails et les deux dates.
export const lignesFiche = pgTable('lignes_fiche', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  genre: text('genre', {
    enum: [
      'interlocuteur',
      'mots',
      'appels',
      'politesses',
      'registre',
      'rythme',
      'langues',
      'delai-reponse',
      'horaires',
      'signature',
      // Écrits par un modèle (0077, portrait/synthese.ts).
      'role',
      'tache',
    ],
  }).notNull(),
  // L'adresse de l'interlocuteur, le type de destinataire d'un fait de style, ou le rang d'une tâche ; vide pour un
  // genre à une ligne.
  cle: text('cle').notNull().default(''),
  // Sa forme dépend du genre : portrait/lines.ts la valide.
  valeur: jsonb('valeur').$type<Record<string, unknown>>().notNull(),
  // « synthese » : le rôle et les tâches, écrits par un modèle. « apprise » : prévue, rien ne l'écrit encore.
  provenance: text('provenance', { enum: ['calcul', 'personne', 'synthese', 'apprise'] }).notNull(),
  mails: integer('mails'),
  corrigeeLe: timestamp('corrigee_le', { withTimezone: true }),
  retireeLe: timestamp('retiree_le', { withTimezone: true }),
  acl: uuid('acl').array().notNull(),
});

// Sa réponse, oui ou non, à chaque agent de départ que Leon lui propose (0078-reponses-agent.sql) : une ligne par
// agent, privée à la personne comme sa fiche (acl = [user_id], contrôlé par la base). Seul deleteAccount supprime des
// lignes ; l'app ne met à jour que la réponse.
export const reponsesAgent = pgTable(
  'reponses_agent',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // L'identifiant de l'agent dans le catalogue (portrait/agents.ts), contrôlé aussi par un CHECK.
    agent: text('agent', { enum: AGENTS }).notNull(),
    oui: boolean('oui').notNull(),
    acl: uuid('acl').array().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.userId, table.agent] })],
);

// Les brouillons de réponse que l'agent « Brouillons de réponse » prépare pour elle (0080-brouillons.sql) : une ligne
// par mail auquel répondre, privée à la personne comme sa fiche (acl = [user_id], contrôlé par la base), et qui ne
// survit pas à son fil. Seul deleteAccount supprime des lignes ; l'app ne met à jour que la date où elle l'écarte,
// l'identifiant du brouillon déposé dans sa boîte Gmail (0081) et ses réponses aux questions de Leon (0082). Le texte
// d'une ligne qui a ses questions et ses réponses ne se pose que par ecrire_brouillon, une fois. Les questions et
// leurs choix (0083) s'écrivent avec la ligne et ne changent plus.
export const brouillons = pgTable('brouillons', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Le fil de courrier ; clé étrangère composée (tenant_id, source_id) en SQL, en cascade.
  sourceId: uuid('source_id').notNull(),
  // Le message auquel répondre : l'identifiant de ses tours, « message:<id> ». Un seul résultat par message.
  message: text('message').notNull(),
  // Nul : le modèle a jugé qu'aucune réponse n'était attendue, ou Leon attend ses réponses pour l'écrire.
  texte: text('texte'),
  // Les questions de Leon à la personne (0082), une à trois. Nul : il n'en a pas posé.
  questions: text('questions').array(),
  // Les choix de réponse de chaque question (0083), dans le même ordre. Nul : pas de question, ou une demande posée
  // avant les choix.
  choix: jsonb('choix').$type<string[][]>(),
  // Ses réponses, une par question, dans le même ordre ; une réponse peut être vide. Nul : elle n'a pas répondu.
  reponses: text('reponses').array(),
  ecarteLe: timestamp('ecarte_le', { withTimezone: true }),
  // Le brouillon Gmail créé pour lui (portrait/brouillon-depot.ts). Nul : rien n'est déposé dans sa boîte.
  brouillonGmail: text('brouillon_gmail'),
  acl: uuid('acl').array().notNull(),
});

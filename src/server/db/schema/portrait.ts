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

import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
    ],
  }).notNull(),
  // L'adresse de l'interlocuteur, ou le type de destinataire d'un fait de style ; vide pour un genre à une ligne.
  cle: text('cle').notNull().default(''),
  // Sa forme dépend du genre : portrait/lines.ts la valide.
  valeur: jsonb('valeur').$type<Record<string, unknown>>().notNull(),
  // « synthese » et « apprise » : prévues, rien ne les écrit encore.
  provenance: text('provenance', { enum: ['calcul', 'personne', 'synthese', 'apprise'] }).notNull(),
  mails: integer('mails'),
  corrigeeLe: timestamp('corrigee_le', { withTimezone: true }),
  retireeLe: timestamp('retiree_le', { withTimezone: true }),
  acl: uuid('acl').array().notNull(),
});

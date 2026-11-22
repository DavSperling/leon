import type { ProviderId } from '@/capture/turn';
import { linesOf } from '@/lib/fiche-view';
import { PROVIDER_FAMILIES } from '@/lib/providers';
import type { FicheLine } from './fiche';

// Le catalogue des agents de départ : cinq, dans l'ordre du relevé qui les a choisis
// (docs/etudes/agents-2026-11/agents-a-copier). Pas une galerie, et personne ne crée le sien. L'identifiant est stable :
// c'est lui que la base garde avec la réponse de la personne (0078). Le nom et la phrase de chacun sont des textes de
// l'écran (messages, fiche.agents). Module pur : le schéma de la base le lit.
export const AGENTS = [
  'suite-reunion',
  'brouillon-reponse',
  'brief-rendez-vous',
  'relance',
  'point-du-jour',
] as const;
export type AgentId = (typeof AGENTS)[number];

// Le seul agent en service : il prépare des brouillons (brouillons.ts) pour qui lui a répondu oui. Les quatre autres se
// proposent sans tourner encore.
export const EN_SERVICE = 'brouillon-reponse' satisfies AgentId;

const MAILBOXES: ProviderId[] = ['gmail', 'outlook'];

// Les agents à proposer à une personne, dans l'ordre du catalogue. Une fonction pure, comme computeFacts : `tools` sont
// les outils qu'elle a branchés elle-même, `lines` les lignes de sa fiche. Rien ne s'enregistre, aucun modèle n'est
// appelé. Sans fiche, aucune proposition.
export function proposeAgents(tools: readonly ProviderId[], lines: FicheLine[]): AgentId[] {
  if (lines.length === 0) return [];
  const mailbox = tools.some((tool) => MAILBOXES.includes(tool));
  const proposed: Record<AgentId, boolean> = {
    // Un enregistreur de réunion : la famille « reunions » des outils, la liste que le dépôt tient déjà.
    'suite-reunion': tools.some((tool) => PROVIDER_FAMILIES[tool] === 'reunions'),
    // Sa fiche montre qu'elle répond à des mails : au moins une réponse, tous destinataires confondus.
    'brouillon-reponse':
      mailbox && linesOf(lines, 'delai-reponse').some((line) => line.valeur.tous.reponses > 0),
    // Outlook est le seul agenda que Leon lit aujourd'hui (agenda/agenda.ts).
    'brief-rendez-vous': tools.includes('outlook'),
    // Sa fiche montre qu'elle envoie des mails.
    relance: mailbox && linesOf(lines, 'rythme').some((line) => line.valeur.mailsParSemaine > 0),
    'point-du-jour': mailbox,
  };
  return AGENTS.filter((agent) => proposed[agent]);
}

import type { ProviderId } from '@/capture/turn';
import { linesOf } from '@/lib/fiche-view';
import { PROVIDER_FAMILIES } from '@/lib/providers';
import type { FicheLine } from './fiche';

// Le catalogue des agents de départ : cinq, dans l'ordre du relevé qui les a choisis
// (docs/etudes/agents-2026-11/agents-a-copier). Personne ne crée encore le sien. L'identifiant est stable : c'est lui
// que la base garde avec la réponse de la personne (0078). Le nom, la phrase et la feuille d'exemple de chacun sont des
// textes de l'écran Agents (messages, agents.list). Module pur : le schéma de la base le lit.
export const AGENTS = [
  'suite-reunion',
  'brouillon-reponse',
  'brief-rendez-vous',
  'relance',
  'point-du-jour',
] as const;
export type AgentId = (typeof AGENTS)[number];

// Les agents en service : chacun ne travaille que pour qui lui a répondu oui, à lui (brouillons.ts). « Brouillons de
// réponse » prépare la réponse à un mail reçu ; « Relances » la relance d'un mail resté sans réponse. Les trois autres
// se proposent sans tourner encore.
export const EN_SERVICE: readonly AgentId[] = ['brouillon-reponse', 'relance'];

const MAILBOXES: ProviderId[] = ['gmail', 'outlook'];

// Ce qui manque pour qu'un agent soit proposé à une personne, dans l'ordre où l'écran le lui dit : l'outil d'abord
// (ce qu'elle peut brancher), puis sa fiche, puis ce que sa fiche doit montrer. null : rien ne manque.
// - boite : Gmail ou Outlook, branché par elle ; reunions : un enregistreur de réunion ; outlook : Outlook, le seul
//   agenda que Leon lit aujourd'hui (agenda/agenda.ts) ;
// - fiche : sa fiche n'a encore aucune ligne ;
// - usage : sa fiche ne montre pas encore ce que l'agent reprend (des réponses à des mails, des mails envoyés).
export type Missing = 'boite' | 'reunions' | 'outlook' | 'fiche' | 'usage';

// Une fonction pure, comme computeFacts : `tools` sont les outils qu'elle a branchés elle-même, `lines` les lignes de sa
// fiche. Rien ne s'enregistre, aucun modèle n'est appelé.
export function missingFor(
  agent: AgentId,
  tools: readonly ProviderId[],
  lines: FicheLine[],
): Missing | null {
  // L'outil : un enregistreur de réunion (la famille « reunions » des outils, la liste que le dépôt tient déjà), Outlook,
  // ou une boîte pour les trois autres.
  if (agent === 'suite-reunion') {
    if (!tools.some((tool) => PROVIDER_FAMILIES[tool] === 'reunions')) return 'reunions';
  } else if (agent === 'brief-rendez-vous') {
    if (!tools.includes('outlook')) return 'outlook';
  } else if (!tools.some((tool) => MAILBOXES.includes(tool))) return 'boite';
  if (lines.length === 0) return 'fiche';
  // Sa fiche montre qu'elle répond à des mails (au moins une réponse, tous destinataires confondus), ou qu'elle en envoie.
  const replies = linesOf(lines, 'delai-reponse').some((line) => line.valeur.tous.reponses > 0);
  const sends = linesOf(lines, 'rythme').some((line) => line.valeur.mailsParSemaine > 0);
  if ((agent === 'brouillon-reponse' && !replies) || (agent === 'relance' && !sends))
    return 'usage';
  return null;
}

// Les agents à proposer à une personne, dans l'ordre du catalogue : ceux à qui rien ne manque. Sans fiche, aucune
// proposition.
export function proposeAgents(tools: readonly ProviderId[], lines: FicheLine[]): AgentId[] {
  return AGENTS.filter((agent) => missingFor(agent, tools, lines) === null);
}

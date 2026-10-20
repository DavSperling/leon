import type { ConnectorItem, ConnectorTurn } from '../types';
import type { PlainEntry, PlainThread } from './queries';

// Conversion des réponses de Plain en éléments. Tous les messages sont des tours de participants :
// un fil n'a pas de corps à part (sa description facultative double souvent le premier message).

function author(actor: PlainEntry['actor']): ConnectorTurn['author'] {
  if (actor.user) return { name: actor.user.fullName, email: actor.user.email };
  if (actor.customer) {
    return { name: actor.customer.fullName, email: actor.customer.email.email };
  }
  return { name: actor.machineUser?.fullName ?? null, email: null };
}

// Le côté vient du type d'acteur de Plain : un membre de l'équipe (user) ou un client (customer). Un
// utilisateur machine (intégration, automatisme) n'est ni l'un ni l'autre.
function sideOf(actor: PlainEntry['actor']): ConnectorTurn['side'] {
  if (actor.user) return 'team';
  return actor.customer ? 'external' : undefined;
}

// Un seul des champs de `entry` est présent, selon le type du message.
function messageText(entry: PlainEntry['entry']): string {
  const found = Object.values(entry).find((value) => value?.trim());
  return found?.trim() ?? '';
}

function entryToTurn(entry: PlainEntry): ConnectorTurn[] {
  const text = messageText(entry.entry);
  if (text === '') return [];
  return [
    {
      externalId: `entry:${entry.id}`,
      role: 'participant',
      author: author(entry.actor),
      side: sideOf(entry.actor),
      text,
      ts: entry.timestamp.iso8601,
    },
  ];
}

const byDate = (a: ConnectorTurn, b: ConnectorTurn) => Date.parse(a.ts) - Date.parse(b.ts);

// Un fil sans message n'est pas rendu : son titre seul n'apprend rien.
export function threadToItem(thread: PlainThread, entries: PlainEntry[]): ConnectorItem | null {
  const turns = entries.flatMap(entryToTurn).sort(byDate);
  if (turns.length === 0) return null;
  return {
    externalId: `thread:${thread.id}`,
    nature: 'fil',
    title: `${thread.ref} ${thread.title}`.trim(),
    // L'adresse d'un fil dans l'application n'est pas dans la doc de l'éditeur.
    url: null,
    updatedAt: thread.updatedAt.iso8601,
    origin: { client: thread.customer.fullName },
    turns,
  };
}

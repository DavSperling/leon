import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { ConnectorItem } from '../types';
import type { FrontClient, FrontEvent } from './client';
import { toItem } from './map';

// La lecture des conversations touchées par une page d'événements.

// Un événement émis moins de cinq secondes avant la lecture d'une conversation est relu : l'horloge
// de Front n'est pas la nôtre.
const READ_SLACK_MS = 5000;

// 403 : boîte hors de la portée du jeton. 301 : fusionnée dans une autre conversation. 404 et 410 :
// supprimée.
function isLeftOut(error: unknown): boolean {
  if (error instanceof ConnectorAuthError) return error.status === 403;
  return (
    error instanceof ConnectorHttpError &&
    error.status !== null &&
    [301, 404, 410].includes(error.status)
  );
}

async function readConversation(
  front: FrontClient,
  id: string,
  subject: string | null | undefined,
): Promise<ConnectorItem | null> {
  try {
    const messages = await front.messages(id);
    const comments = await front.comments(id).catch((error: unknown) => {
      if (isLeftOut(error)) return [];
      throw error;
    });
    return toItem(id, subject, messages, comments);
  } catch (error) {
    if (isLeftOut(error)) return null;
    throw error;
  }
}

// Les conversations touchées par ces événements, lues une fois : plus tard dans le même passage,
// seul un événement émis après leur lecture les fait relire.
export async function readItems(
  front: FrontClient,
  events: FrontEvent[],
  readAt: Map<string, number>,
): Promise<ConnectorItem[]> {
  const wanted = new Map<string, string | null | undefined>();
  for (const { emitted_at, conversation } of events) {
    if (!conversation) continue;
    const read = readAt.get(conversation.id);
    if (read === undefined || emitted_at * 1000 > read - READ_SLACK_MS) {
      wanted.set(conversation.id, conversation.subject);
    }
  }
  const items: ConnectorItem[] = [];
  for (const [id, subject] of wanted) {
    readAt.set(id, Date.now());
    const item = await readConversation(front, id, subject);
    if (item) items.push(item);
  }
  return items;
}

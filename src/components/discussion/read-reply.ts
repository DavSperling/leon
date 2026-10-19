import {
  createDiscussionEventReader,
  type DiscussionCitation,
  discussionMessagesUrl,
  finalReplyText,
} from '@/lib/discussion-events';
import { toolActivityLabel } from './message-segments';

// La page d'une discussion envoie une question à la route (C8) et lit sa réponse au fil du flux. Chaque issue a
// son état, pour que la page dise ce qui s'est vraiment passé : la question n'est dite « gardée » que lorsque le
// serveur l'a gardée (l'évènement « indisponible » vient après son écriture). Module sans React, testé seul.

export type ReplyProgress = {
  text: string;
  citations: DiscussionCitation[];
  // Ce que Leon fait en attendant son texte (chercher, lire…), ou null quand il écrit.
  activity: string | null;
};

export type ReplyOutcome =
  | { status: 'finie'; content: string; citations: DiscussionCitation[] }
  // 204 : aucun modèle n'est branché ; rien n'est écrit.
  | { status: 'sans-modele' }
  // Leon répond déjà dans cette discussion : rien n'est écrit, la page attend cette réponse-là.
  | { status: 'en-cours' }
  // `questionGardee` : le serveur a gardé la question avant d'échouer. Faux quand la route a refusé avant (400,
  // 404, 413, 500), quand le flux s'est coupé ou que le réseau a lâché : rien n'est alors promis.
  | { status: 'indisponible'; questionGardee: boolean }
  // 401 : la session a expiré ; rien n'est écrit.
  | { status: 'session' }
  // 403 : la page est ouverte à une autre adresse que celle réglée pour Leon (BETTER_AUTH_URL) ; rien n'est écrit.
  | { status: 'origine' };

const LOST: ReplyOutcome = { status: 'indisponible', questionGardee: false };

export async function readReply(
  discussionId: string,
  message: string,
  onProgress: (progress: ReplyProgress) => void,
): Promise<ReplyOutcome> {
  try {
    const response = await fetch(discussionMessagesUrl(discussionId), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ message }),
      cache: 'no-store',
    });
    if (response.status === 204) return { status: 'sans-modele' };
    if (response.status === 401) return { status: 'session' };
    if (response.status === 403) return { status: 'origine' };
    if (!response.ok || !response.body) return LOST;
    const chunks = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const reader = createDiscussionEventReader();
    let text = '';
    let citations: DiscussionCitation[] = [];
    let activity: string | null = null;
    for (;;) {
      const { done, value } = await chunks.read();
      if (done) return LOST;
      for (const event of reader.push(value)) {
        if (event.type === 'texte') {
          text += event.delta;
          activity = null;
        } else if (event.type === 'outil') {
          activity = toolActivityLabel(event.name);
        } else if (event.type === 'citations') {
          citations = event.items;
        } else if (event.type === 'fin') {
          return { status: 'finie', content: finalReplyText(text, event.reason), citations };
        } else if (event.type === 'en-cours') {
          return { status: 'en-cours' };
        } else {
          return { status: 'indisponible', questionGardee: true };
        }
        onProgress({ text, citations, activity });
      }
    }
  } catch {
    return LOST;
  }
}

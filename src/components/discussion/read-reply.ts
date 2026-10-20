import {
  createDiscussionEventReader,
  type DiscussionCitation,
  discussionMessagesUrl,
  finalReplyText,
} from '@/lib/discussion-events';
import { toolActivityLabel } from './message-segments';

// La page d'une discussion envoie une question à la route (C8) et lit sa réponse au fil du flux. Chaque issue a
// son état, pour que la page dise ce qui s'est vraiment passé : la question n'est dite « gardée » que lorsque le
// serveur dit l'avoir gardée (l'évènement « indisponible » le porte). Module sans React, testé seul.

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
  // Le flux s'est coupé après 200 (proxy, réseau) : le serveur finit sa réponse sans lecteur et la garde, ou dit
  // qu'elle a échoué. La page relit la discussion au lieu de retirer la question.
  | { status: 'coupee' }
  // `questionGardee` : le serveur dit avoir gardé la question avant d'échouer. Faux quand il dit le contraire,
  // quand la route a refusé avant (400, 404, 413, 500) ou que le réseau a lâché avant sa réponse : rien n'est
  // alors promis.
  | { status: 'indisponible'; questionGardee: boolean }
  // 429 : l'utilisateur a déjà deux réponses en cours ; rien n'est écrit.
  | { status: 'occupe' }
  // 401 : la session a expiré ; rien n'est écrit.
  | { status: 'session' }
  // 403 : la page est ouverte à une autre adresse que celle réglée pour Leon (BETTER_AUTH_URL) ; rien n'est écrit.
  | { status: 'origine' };

const LOST: ReplyOutcome = { status: 'indisponible', questionGardee: false };
const CUT: ReplyOutcome = { status: 'coupee' };

// Le serveur n'a pas écrit la question (ou ne promet pas l'avoir écrite) : la page la retire de la discussion et
// la remet dans la saisie. « en-cours » et « coupee » ont leur propre chemin (la page relit la discussion).
export function questionNotWritten(outcome: ReplyOutcome): boolean {
  if (outcome.status === 'indisponible') return !outcome.questionGardee;
  return ['sans-modele', 'occupe', 'session', 'origine'].includes(outcome.status);
}

// La question que « Réessayer » renvoie après un échec : celle qui vient d'échouer, tant qu'elle est encore dans
// la discussion (gardée par le serveur, ou reposée). Une question nouvelle qu'il n'a pas écrite est revenue dans
// la saisie : rien à réessayer, et surtout pas une question plus ancienne restée au-dessus d'elle.
export function retryQuestion(
  outcome: ReplyOutcome,
  message: string,
  { repeated }: { repeated: boolean },
): string | null {
  return !repeated && questionNotWritten(outcome) ? null : message;
}

export async function readReply(
  discussionId: string,
  message: string,
  onProgress: (progress: ReplyProgress) => void,
): Promise<ReplyOutcome> {
  let response: Response;
  try {
    response = await fetch(discussionMessagesUrl(discussionId), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ message }),
      cache: 'no-store',
    });
  } catch {
    return LOST;
  }
  if (response.status === 204) return { status: 'sans-modele' };
  if (response.status === 401) return { status: 'session' };
  if (response.status === 403) return { status: 'origine' };
  if (response.status === 429) return { status: 'occupe' };
  if (!response.ok || !response.body) return LOST;
  try {
    const chunks = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const reader = createDiscussionEventReader();
    let text = '';
    let citations: DiscussionCitation[] = [];
    let activity: string | null = null;
    for (;;) {
      const { done, value } = await chunks.read();
      if (done) return CUT;
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
          return { status: 'indisponible', questionGardee: event.questionGardee };
        }
        onProgress({ text, citations, activity });
      }
    }
  } catch {
    return CUT;
  }
}

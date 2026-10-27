// Le texte d'un message de la discussion, découpé pour l'affichage : du texte et des renvois [n] aux citations
// du message. Le texte n'est jamais interprété comme du HTML. Module pur, que le navigateur importe : rien de
// `@/server`.

import { type ReferenceSegment, referenceSegments } from '@/lib/references';

export type MessageSegment = ReferenceSegment;

// Un renvoi à un numéro que le message ne cite pas est écarté (le serveur n'en laisse déjà passer aucun).
export function messageSegments(text: string, cited: ReadonlySet<number>): MessageSegment[] {
  return referenceSegments(text, (n) => cited.has(n));
}

// Ce que l'agent fait pendant qu'il prépare sa réponse, d'après l'outil qu'il appelle : la clé de son libellé
// (discussionView.activity).
const ACTIVITIES = ['chercher', 'lire', 'activite', 'depots_github'] as const;
export type ToolActivity = (typeof ACTIVITIES)[number] | 'autre';

export function toolActivity(name: string): ToolActivity {
  return ACTIVITIES.find((activity) => activity === name) ?? 'autre';
}

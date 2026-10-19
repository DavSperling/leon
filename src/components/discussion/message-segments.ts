// Le texte d'un message de la discussion, découpé pour l'affichage : du texte et des renvois [n] aux citations
// du message. Le texte n'est jamais interprété comme du HTML. Module pur, que le navigateur importe : rien de
// `@/server`.

export type MessageSegment = { text: string } | { ref: number };

const REFERENCE = /\[(\d{1,3})\]/g;

// Un renvoi à un numéro que le message ne cite pas est écarté (le serveur n'en laisse déjà passer aucun).
export function messageSegments(text: string, cited: ReadonlySet<number>): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const pushText = (piece: string) => {
    if (piece === '') return;
    const last = segments.at(-1);
    if (last && 'text' in last) last.text += piece;
    else segments.push({ text: piece });
  };
  let from = 0;
  for (const match of text.matchAll(REFERENCE)) {
    pushText(text.slice(from, match.index));
    const n = Number(match[1]);
    if (cited.has(n)) segments.push({ ref: n });
    from = match.index + match[0].length;
  }
  pushText(text.slice(from));
  return segments;
}

// Ce que l'agent fait pendant qu'il prépare sa réponse, d'après l'outil qu'il appelle.
const ACTIVITY: Record<string, string> = {
  chercher: 'Leon cherche dans la mémoire…',
  lire: 'Leon lit une source…',
  activite: 'Leon regarde l’activité récente…',
};

export function toolActivityLabel(name: string): string {
  return Object.hasOwn(ACTIVITY, name) ? (ACTIVITY[name] as string) : 'Leon travaille…';
}

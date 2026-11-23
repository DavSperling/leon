import { ownText } from './own-text';

// Ce qu'elle a fait d'un brouillon de Leon, vu sur la réponse qu'elle a vraiment envoyée (retouches.ts), sans modèle.
// Module pur.
//
// La mesure : les mots du brouillon qu'on retrouve dans sa réponse, dans le même ordre (la plus longue sous-suite
// commune), rapportés au nombre de mots du brouillon. Un mot est une suite de lettres ou de chiffres, en minuscules :
// les espaces, la ponctuation et la casse ne comptent pas. De sa réponse, seul compte ce qu'elle a écrit (own-text.ts) :
// ni la citation du mail reçu, ni sa signature.
// - tel quel : les mêmes mots, dans le même ordre, ni plus ni moins ;
// - retouché : elle a gardé, dans l'ordre, la moitié des mots du brouillon au moins, et changé le reste (un mot, une
//   formule d'appel ou de politesse, une phrase en plus ou en moins, la longueur) ;
// - réécrit : moins de la moitié. Deux mails sans rapport partagent toujours quelques mots (« bonjour », « de »,
//   « vous », « cordialement ») : la moitié laisse cette marge.
// shortcut: une signature sans la ligne « -- » (celle qu'Outlook ajoute) reste dans son texte et fait d'un envoi tel
// quel une retouche ; à retirer d'après la ligne « signature » de sa fiche si de vraies boîtes le montrent.

export type Issue = 'tel-quel' | 'retouche' | 'reecrit';

const KEPT_MIN = 0.5;

const wordsOf = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

// La longueur de la plus longue sous-suite commune, ligne à ligne : deux mails de mille mots, un million de cases.
function common(a: string[], b: string[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (const word of a) {
    const row = [0];
    for (const [j, other] of b.entries())
      row.push(
        word === other ? (previous[j] ?? 0) + 1 : Math.max(previous[j + 1] ?? 0, row[j] ?? 0),
      );
    previous = row;
  }
  return previous[b.length] ?? 0;
}

// `brouillon` : le texte de Leon. `envoye` : le mail qu'elle a envoyé, citation et signature comprises.
export function issueOf(brouillon: string, envoye: string): Issue {
  const draft = wordsOf(brouillon);
  const sent = wordsOf(ownText(envoye).text);
  const kept = common(draft, sent);
  if (kept === draft.length && kept === sent.length) return 'tel-quel';
  return draft.length > 0 && kept >= KEPT_MIN * draft.length ? 'retouche' : 'reecrit';
}

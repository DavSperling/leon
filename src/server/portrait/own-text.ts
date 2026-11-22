// Le texte qu'une personne a vraiment écrit dans un mail envoyé : sans le texte cité d'une réponse ou d'un transfert,
// sans sa signature. Le texte lu est celui que gardent les connecteurs Gmail et Outlook (texte brut, ou HTML passé par
// htmlToText : une citation n'y porte alors aucun « > »). Tout se lit ligne à ligne, en un passage.

// Un en-tête de réponse est court : au-delà, la ligne est un paragraphe, et le chercher dedans coûterait un temps
// quadratique sur un texte piégé.
const HEADER_MAX = 300;

const QUOTED = /^\s*>/;
// Le trait qu'Outlook (web, mobile) pose sur une réponse au-dessus du bloc « De : … », dans le corps en texte que rend
// Graph : il n'est pas de la personne.
const RULE = /^\s*_{10,}\s*$/;
// Tout ce qui suit est cité : « -----Original Message----- », « ---------- Forwarded message --------- ».
const CUT =
  /^\s*-{2,}\s*(?:Original Message|Message d['’]origine|Forwarded message|Message transféré)\s*-{2,}\s*$/i;
// « Le 12 nov. 2026 à 10:02, X a écrit : », « On Tue, Nov 12, 2026 at 10:02 AM X wrote: ». Le chiffre de la date est
// exigé : « Le client nous a écrit : » est une phrase de la personne.
const REPLY_HEADER = /^\s*(?:Le\s.*\d.*\sa\sécrit|On\s.*\d.*\swrote)\s*:\s*$/i;
// Le bloc d'Outlook : « De : … » puis « Envoyé : … » (« From: … », « Sent: … »), sur une ligne ou sur deux. Un transfert
// d'Apple Mail écrit « Objet : … » en second.
const OUTLOOK_HEADER = /^\s*(?:De|From)\s*:.*\s(?:Envoyé|Sent|Date|Objet|Subject)\s*:/i;
const SIGNATURE_MARK = /^--\s*$/;
// « Envoyé de mon iPhone », « Sent from my Galaxy », « Envoyé à partir de Outlook pour Android », « Get Outlook for iOS ».
// En français l'appareil est exigé : « Envoyé de mon côté hier » est une phrase de la personne.
const MOBILE =
  /^\s*(?:Envoyé (?:de|depuis) (?:mon|ma) (?:iPhone|iPad|mobile|portable|téléphone|smartphone|tablette|appareil|Galaxy|Samsung|Huawei|Xiaomi|Android)|Envoyé (?:depuis|à partir de|à partir d['’]) ?(?:Outlook|Yahoo)|Sent from (?:my|Outlook|Yahoo|Mail)|(?:Obtenir|Télécharger|Get) Outlook (?:pour|for))\b/i;

const isReplyHeader = (line: string) => line.length <= HEADER_MAX && REPLY_HEADER.test(line);

// `text` : ce qu'elle a écrit. `signature` : ce qui suit sa dernière ligne « -- », s'il y en a une ; une signature sans
// séparateur reste dans `text` (elle se repère sur plusieurs mails, voir facts.ts).
export function ownText(mail: string): { text: string; signature: string | null } {
  const lines = mail.replace(/\r\n?/g, '\n').split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const next = lines[i + 1] ?? '';
    if (QUOTED.test(line) || RULE.test(line)) continue;
    // Outlook écrit une ligne par champ ; Gmail coupe un long en-tête de réponse sur deux lignes.
    const two = `${line} ${next}`;
    if (CUT.test(line) || OUTLOOK_HEADER.test(two)) break;
    // Une ligne de la personne juste avant un en-tête d'une seule ligne n'en fait pas partie.
    const header = isReplyHeader(line) ? 1 : !isReplyHeader(next) && isReplyHeader(two) ? 2 : 0;
    if (header === 0) {
      kept.push(line);
      continue;
    }
    // Suivi de lignes « > » (texte brut) : la personne a pu répondre entre les citations, seules ces lignes partent.
    // Sinon (un mail en HTML), rien ne marque la citation : tout ce qui suit l'en-tête est cité.
    let after = i + header;
    while (lines[after]?.trim() === '') after++;
    if (!QUOTED.test(lines[after] ?? '')) break;
    i += header - 1;
  }
  const mark = kept.findLastIndex((line) => SIGNATURE_MARK.test(line));
  const body = mark === -1 ? kept : kept.slice(0, mark);
  const signature = mark === -1 ? [] : kept.slice(mark + 1);
  return {
    text: body
      .filter((line) => !MOBILE.test(line))
      .join('\n')
      .trim(),
    signature: signature.join('\n').trim() || null,
  };
}

// Le message d'une réponse dans un fil, en RFC 2822, tel que Gmail l'attend pour créer un brouillon (client.ts,
// createDraft) : le champ `raw`, en base64url. Module pur, sans dépendance. Le destinataire, l'objet et les identifiants
// de message sont des valeurs captées dans une boîte : aucune ne peut ajouter un en-tête, un destinataire, ni couper
// le message. Ni De, ni date, ni identifiant : Gmail les pose. Ni citation du message d'origine, ni signature.
// Non vérifié (la documentation de Google n'a pas pu être relue ici) : que Gmail pose De sur un brouillon créé sans
// lui, et qu'il n'ajoute pas la signature de la personne.

export type Reply = {
  // L'adresse du destinataire, seule.
  to: string;
  // Les en-têtes Subject, Message-ID et References du message auquel répondre, tels que Gmail les rend.
  subject: string | null;
  messageId: string | null;
  references: string | null;
  // Le corps, en texte brut.
  text: string;
};

const CRLF = '\r\n';

// Une adresse seule (« lea@client.test ») : ni nom, ni liste, ni espace, ni caractère de contrôle.
const ADDRESS = /^[^\s\p{C}<>()[\]:;,"\\@]+@[^\s\p{C}<>()[\]:;,"\\@]+$/u;

// Les identifiants de message d'un en-tête (« <a@x> <b@y> »), et rien de ce qui les entoure.
const messageIds = (value: string | null) => value?.match(/<[^<>\s\p{C}]+>/gu) ?? [];

// L'objet du message reçu sur une ligne, précédé de « Re: » s'il ne l'a pas déjà.
function replySubject(subject: string | null): string {
  const line = (subject ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim();
  return /^re\s*:/i.test(line) ? line : `Re: ${line}`.trim();
}

// Une ligne d'en-tête ne passe pas 998 caractères (RFC 5322), ni 76 quand elle porte un mot encodé (RFC 2047).
const PLAIN_SUBJECT_MAX = 900;
const WORD_BYTES_MAX = 39;

// Un objet en ASCII part tel quel. Sinon (RFC 2047) : des mots encodés en UTF-8 et base64, un par ligne repliée, de 39
// octets au plus, coupés entre deux caractères. Un objet qui contient « =? » serait relu comme un mot encodé.
function encodeSubject(subject: string): string {
  const plain = /^[\x20-\x7e]*$/.test(subject) && !subject.includes('=?');
  if (plain && subject.length <= PLAIN_SUBJECT_MAX) return subject;
  const words: string[] = [];
  let word = '';
  for (const char of subject) {
    if (Buffer.byteLength(word + char) > WORD_BYTES_MAX) {
      words.push(word);
      word = '';
    }
    word += char;
  }
  return [...words, word]
    .map((one) => `=?UTF-8?B?${Buffer.from(one).toString('base64')}?=`)
    .join(`${CRLF} `);
}

// Le champ `raw` d'un brouillon de réponse, ou null quand on ne peut pas répondre dans le fil : une adresse qui n'en est
// pas une, ou un message reçu sans identifiant. Le corps part en base64 : aucune de ses lignes ne se lit comme un
// en-tête, et aucune ne passe 76 caractères.
export function replyRaw(reply: Reply): string | null {
  const [parent] = messageIds(reply.messageId);
  if (!ADDRESS.test(reply.to) || parent === undefined) return null;
  const body = Buffer.from(reply.text.replace(/\r\n?|\n/g, CRLF))
    .toString('base64')
    .replace(/.{76}(?=.)/g, `$&${CRLF}`);
  const message = [
    `To: ${reply.to}`,
    `Subject: ${encodeSubject(replySubject(reply.subject))}`,
    `In-Reply-To: ${parent}`,
    `References: ${[...messageIds(reply.references), parent].join(`${CRLF} `)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
    '',
  ].join(CRLF);
  return Buffer.from(message).toString('base64url');
}

import { htmlToText } from '../normalize';

// Le « format de stockage » de Confluence (du XHTML avec des balises ac: et ri:) en texte brut.
// Il passe d'abord par quelques remplacements balise par balise, puis par htmlToText. Le corps vient
// d'une personne de l'équipe : chaque expression est bornée (aucune ne parcourt la suite du texte
// quand sa balise de fin manque), donc le temps reste linéaire sur une entrée piégée.

const escapeText = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Le contenu d'un bloc CDATA devient du texte ordinaire. Un bloc jamais fermé abandonne le reste.
function unwrapCdata(xml: string): string {
  const OPEN = '<![CDATA[';
  let out = '';
  let pos = 0;
  for (;;) {
    const open = xml.indexOf(OPEN, pos);
    if (open === -1) return out + xml.slice(pos);
    out += xml.slice(pos, open);
    const close = xml.indexOf(']]>', open + OPEN.length);
    if (close === -1) return out;
    out += escapeText(xml.slice(open + OPEN.length, close));
    pos = close + 3;
  }
}

type Rewrite = [pattern: RegExp, replacement: string | ((...match: string[]) => string)];

const REWRITES: Rewrite[] = [
  // Le titre d'un encart est du texte visible ; les autres paramètres de macro, non.
  [/<ac:parameter\s+ac:name="title">([^<]{0,300})<\/ac:parameter>/g, '<p>$1</p>'],
  [/<ac:parameter\b[^>]{0,200}>[^<]{0,2000}<\/ac:parameter>/g, ''],
  [/<ac:placeholder\b[^>]{0,200}>[^<]{0,500}<\/ac:placeholder>/g, ''],
  [/<ac:plain-text-body>/g, '<pre>'],
  [/<\/ac:plain-text-body>/g, '</pre>'],
  // Tâches : un point de liste, l'état entre crochets, pas de numéro.
  [/<ac:task-(?:id|uuid)>[^<]{0,80}<\/ac:task-(?:id|uuid)>/g, ''],
  [
    /<ac:task-status>\s*(\w{0,20})\s*<\/ac:task-status>/g,
    (_, state = '') => (state === 'complete' ? '[x] ' : '[ ] '),
  ],
  [/<ac:task-list>/g, '<ul>'],
  [/<\/ac:task-list>/g, '</ul>'],
  [/<ac:task>/g, '<li>'],
  // Un champ date, et le titre d'une page visée par un lien sans texte.
  [/<time\b[^>]{0,100}?\bdatetime="([^"<>]{0,40})"[^>]{0,100}>/g, '$1'],
  [
    /<ri:page\b[^>]{0,200}?\bri:content-title="([^"<>]{0,300})"[^>]{0,200}>(?!\s*<ac:(?:plain-text-)?link-body)/g,
    '$1',
  ],
  // Un paragraphe seul dans une puce ou une cellule : sans quoi la puce reste vide et le texte tombe dessous.
  [/(<(?:li|td|th)\b[^>]{0,200}>)\s*<p\b[^>]{0,200}>/g, '$1'],
  [/<\/p>\s*(<\/(?:li|td|th)>)/g, '$1'],
];

export function storageToText(storage: string): string {
  let xml = unwrapCdata(storage);
  for (const [pattern, replacement] of REWRITES) {
    xml = xml.replace(pattern, replacement as string);
  }
  return htmlToText(xml);
}

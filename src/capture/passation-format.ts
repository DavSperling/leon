// Le format d'une note de passation (spec du 01/11/2026) : un paragraphe libre sous « ## Où j'en suis », des lignes
// `- [type] texte` et des lignes `- relation [[cible]]`. Module pur, partagé par la CLI et le serveur (décision D1 :
// aucun import de code serveur ici). Une ligne hors format n'est jamais une erreur : elle reste dans le texte brut.

export const PASSATION_TYPES = [
  'decision',
  'essai_rate',
  'prochaine_etape',
  'en_cours',
  'question',
] as const;
export type PassationType = (typeof PASSATION_TYPES)[number];

// La lettre du numéro court de chaque type (D12, E7…).
export const NUMERO_PREFIX: Record<PassationType, string> = {
  decision: 'D',
  essai_rate: 'E',
  prochaine_etape: 'P',
  en_cours: 'C',
  question: 'Q',
};
export const NUMERO_PATTERN = /^[DEPCQ][1-9][0-9]{0,11}$/;

export const NOTE_MAX_CHARS = 8000;
export const ITEM_MAX_CHARS = 2000;

const TYPE_BY_TAG: Record<string, PassationType> = {
  décision: 'decision',
  decision: 'decision',
  'essai-raté': 'essai_rate',
  'essai-rate': 'essai_rate',
  'prochaine-étape': 'prochaine_etape',
  'prochaine-etape': 'prochaine_etape',
  'en-cours': 'en_cours',
  question: 'question',
};

export type ParsedLink = { relation: string; cible: string };
export type ParsedItem = {
  type: PassationType;
  texte: string;
  links: ParsedLink[];
  remplace: string[];
};
export type ParsedNote = { resume: string | null; items: ParsedItem[]; noteLinks: ParsedLink[] };

const RESUME_HEADING = /^##\s*o[uù]\s+j['’]en\s+suis\s*$/i;
const ANY_HEADING = /^#{1,6}\s/;
const ITEM_LINE = /^\s*-\s*\[([^\]]{1,40})\]\s+(.+?)\s*$/;
const LINK_LINE = /^\s*-\s*([\p{L}\p{N}_-]{1,60})\s+\[\[([^\]\n]{1,200})\]\]\s*$/u;
const LIST_LINE = /^\s*-\s/;

export function parseNote(text: string): ParsedNote {
  const items: ParsedItem[] = [];
  const noteLinks: ParsedLink[] = [];
  const resumeLines: string[] = [];
  let inResume = false;

  for (const line of text.split(/\r?\n/)) {
    if (RESUME_HEADING.test(line.trim())) {
      inResume = true;
      continue;
    }
    if (inResume && (ANY_HEADING.test(line) || LIST_LINE.test(line))) inResume = false;
    if (inResume) {
      resumeLines.push(line);
      continue;
    }

    const item = ITEM_LINE.exec(line);
    const type = item ? TYPE_BY_TAG[item[1]?.trim().toLowerCase() ?? ''] : undefined;
    if (item && type) {
      items.push({
        type,
        texte: (item[2] ?? '').slice(0, ITEM_MAX_CHARS),
        links: [],
        remplace: [],
      });
      continue;
    }

    const link = LINK_LINE.exec(line);
    if (!link) continue;
    const relation = (link[1] ?? '').toLowerCase();
    const cible = (link[2] ?? '').trim();
    const current = items.at(-1);
    if (!current) {
      noteLinks.push({ relation, cible });
      continue;
    }
    current.links.push({ relation, cible });
    if (relation === 'remplace' && NUMERO_PATTERN.test(cible)) current.remplace.push(cible);
  }

  const resume = resumeLines.join('\n').trim();
  return { resume: resume === '' ? null : resume, items, noteLinks };
}

import { createHash } from 'node:crypto';
import { maskSecrets } from '@/capture/mask-secrets';
import { prepareTurnText } from '@/capture/prepare-turn-text';
import type { AuthorSide, ProviderId } from '@/capture/turn';
import { logError } from '@/server/log';
import type { ConnectorItem, ConnectorTurn } from './types';

// Ce que le socle fait du texte des outils avant de l'ingérer : HTML en texte, découpe, masquage,
// identifiants de tours qui changent avec le texte.

export const CONNECTOR_TURN_MAX = 8_000;
const TURN_TEXT_CAP = 100_000;
const TRUNCATION_MARK = '\n[…tronqué]';
const TITLE_MAX = 300;
const ID_MAX = 200;
const ID_ROOM = 20; // « :123456 » et « # » plus 12 caractères d'empreinte
const AUTHOR_NAME_MAX = 200;
const AUTHOR_EMAIL_MAX = 320;

export type NormalizedTurn = {
  externalId: string;
  role: 'document' | 'participant';
  authorName: string | null;
  authorEmail: string | null;
  authorSide: AuthorSide | null;
  internalNote: boolean;
  text: string;
  ts: Date;
};
export type NormalizedItem = Omit<ConnectorItem, 'turns'> & { turns: NormalizedTurn[] };

// Fin d'une coupe à `max` caractères au plus : un cran avant si elle tomberait au milieu d'un emoji
// (une paire de substitution). Une moitié d'emoji n'est plus du texte valide et un jsonb la refuse.
function wholeEnd(text: string, max: number): number {
  const last = text.charCodeAt(max - 1);
  return max > 1 && last >= 0xd800 && last <= 0xdbff ? max - 1 : max;
}

function head(text: string, max: number): string {
  return text.slice(0, wholeEnd(text, max));
}

// Où couper un texte trop long : avant un titre, sinon à une ligne vide, sinon à une fin de ligne,
// sinon à la longueur maximale.
function cutPoint(text: string, max: number): number {
  const heading = text.lastIndexOf('\n#', max);
  if (heading > 0) return heading;
  const blank = text.lastIndexOf('\n\n', max);
  if (blank > 0) return blank;
  const line = text.lastIndexOf('\n', max);
  return line > 0 ? line : wholeEnd(text, max);
}

export function splitText(text: string, max: number): string[] {
  const chunks: string[] = [];
  let rest = text.replace(/\r\n?/g, '\n').trim();
  while (rest.length > max) {
    const cut = cutPoint(rest, max);
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trimStart();
  }
  if (rest !== '') chunks.push(rest);
  return chunks;
}

// --- HTML en texte : sans bibliothèque, en un seul passage (temps linéaire sur une entrée piégée).

const PARAGRAPH_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'table',
]);
const LINE_TAGS = new Set([
  'div',
  'tr',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'aside',
  'main',
  'figure',
  'figcaption',
  'dl',
  'dt',
  'dd',
  'details',
  'summary',
  'address',
  'form',
  'fieldset',
  'caption',
  'hr',
]);

const ENTITIES = new Map<string, string>(
  Object.entries({
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    laquo: '«',
    raquo: '»',
    hellip: '…',
    mdash: '—',
    ndash: '–',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    euro: '€',
    copy: '©',
    reg: '®',
    trade: '™',
    bull: '•',
    middot: '·',
    deg: '°',
    times: '×',
    oelig: 'œ',
    OElig: 'Œ',
  }),
);
const LETTERS = {
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  auml: 'ä',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  ouml: 'ö',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yuml: 'ÿ',
};
for (const [name, letter] of Object.entries(LETTERS)) {
  ENTITIES.set(name, letter);
  ENTITIES.set(name.charAt(0).toUpperCase() + name.slice(1), letter.toUpperCase());
}

function decodeEntities(text: string): string {
  const pattern = /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,9});/g;
  return text.replace(pattern, (whole, body: string) => {
    if (!body.startsWith('#')) return ENTITIES.get(body) ?? whole;
    const hex = body.charAt(1).toLowerCase() === 'x';
    const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    const valid = code >= 1 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
    return valid ? String.fromCodePoint(code) : whole;
  });
}

type Markup =
  | { kind: 'text' } // un « < » isolé : du texte
  | { kind: 'tag'; name: string; closing: boolean; end: number } // end : après le « > »
  | { kind: 'skip'; end: number } // commentaire, déclaration
  | { kind: 'end' }; // jamais fermé : le reste est abandonné, comme dans un navigateur

const TAG_NAME = /\/?([A-Za-z][A-Za-z0-9]*)/y;

function readMarkup(html: string, open: number): Markup {
  const next = html.charAt(open + 1);
  if (next === '!' || next === '?') {
    const comment = html.startsWith('<!--', open);
    const close = comment ? html.indexOf('-->', open + 4) : html.indexOf('>', open);
    return close === -1 ? { kind: 'end' } : { kind: 'skip', end: close + (comment ? 3 : 1) };
  }
  TAG_NAME.lastIndex = open + 1;
  const match = TAG_NAME.exec(html);
  if (!match) return { kind: 'text' };
  const close = html.indexOf('>', open);
  if (close === -1) return { kind: 'end' };
  return {
    kind: 'tag',
    name: (match[1] ?? '').toLowerCase(),
    closing: next === '/',
    end: close + 1,
  };
}

// Le contenu de script et de style disparaît avec la balise.
function skipRawText(html: string, from: number, name: string): number {
  const closing = new RegExp(`</${name}`, 'gi');
  closing.lastIndex = from;
  const found = closing.exec(html);
  const close = found ? html.indexOf('>', found.index) : -1;
  return close === -1 ? html.length : close + 1;
}

// Balises de bloc → sauts de ligne, <li> → « - », entités décodées, rien d'autre.
export function htmlToText(html: string): string {
  let out = '';
  let newlines = 2; // sauts de ligne en fin de sortie (le début compte pour deux)
  let trimNext = true; // le prochain texte perd ses espaces de tête
  let preDepth = 0;

  const breakTo = (count: number) => {
    for (; newlines < count; newlines++) out += '\n';
    trimNext = true;
  };
  const addText = (raw: string) => {
    let text = preDepth > 0 ? raw : raw.replace(/\s+/g, ' ');
    if (trimNext) text = text.trimStart();
    if (text === '') return;
    out += text;
    trimNext = text.endsWith(' ') || text.endsWith('\n');
    newlines = text.endsWith('\n\n') ? 2 : text.endsWith('\n') ? 1 : 0;
  };

  let pos = 0;
  while (pos < html.length) {
    const open = html.indexOf('<', pos);
    if (open === -1) {
      addText(html.slice(pos));
      break;
    }
    addText(html.slice(pos, open));
    const markup = readMarkup(html, open);
    if (markup.kind === 'end') break;
    if (markup.kind === 'text') {
      addText('<');
      pos = open + 1;
      continue;
    }
    pos = markup.end;
    if (markup.kind === 'skip') continue;
    const { name, closing } = markup;
    if (PARAGRAPH_TAGS.has(name)) {
      breakTo(2);
      if (name === 'pre') preDepth = Math.max(0, preDepth + (closing ? -1 : 1));
    } else if (LINE_TAGS.has(name)) {
      breakTo(1);
    } else if (name === 'li' && !closing) {
      breakTo(1);
      out += '- ';
      newlines = 0;
    } else if (name === 'br') {
      out += '\n';
      newlines = Math.min(newlines + 1, 2);
      trimNext = true;
    } else if ((name === 'td' || name === 'th') && closing && newlines === 0) {
      out += ' ';
    } else if ((name === 'script' || name === 'style') && !closing) {
      pos = skipRawText(html, pos, name);
    }
  }

  const lines = decodeEntities(out)
    .split('\n')
    .map((line) => line.trimEnd());
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Réunions : une prise de parole par phrase de l'outil, regroupées par locuteur.

export function mergeSpeakerTurns(turns: ConnectorTurn[]): ConnectorTurn[] {
  const merged: ConnectorTurn[] = [];
  for (const turn of turns) {
    const last = merged.at(-1);
    const sameSpeaker =
      last !== undefined &&
      last.author.name === turn.author.name &&
      last.author.email === turn.author.email;
    if (sameSpeaker) last.text = `${last.text}\n${turn.text}`;
    else merged.push({ ...turn });
  }
  return merged;
}

// --- Éléments

// ISO 8601 avec fuseau explicite (Z, +02:00 ou +0200). Sans fuseau, Date lit l'heure dans celui du
// serveur : un décalage de plusieurs heures, sans erreur. Époques et dates locales se convertissent
// dans le connecteur.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

function validDate(value: string): Date | null {
  if (!ISO_WITH_ZONE.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Tout texte venu d'un outil passe par là avant la base. Postgres refuse l'octet 0x00 dans un text
// comme dans un jsonb, et dans un jsonb la moitié isolée d'un emoji (JSON.stringify l'écrit
// « \ud83d », le jsonb la rejette ; un text la reçoit en U+FFFD). Un seul élément qui en porte une
// ferait échouer l'insertion, donc le passage entier, à chaque relève.
function clean(value: string): string {
  return value.replaceAll('\u0000', '').toWellFormed();
}

function clip(value: string | null, max: number): string | null {
  return head(clean(value ?? '').trim(), max) || null;
}

function normalizeTurn(turn: ConnectorTurn, ts: Date): NormalizedTurn[] {
  const masked = maskSecrets(clean(turn.text));
  const capped =
    masked.length > TURN_TEXT_CAP
      ? head(masked, TURN_TEXT_CAP - TRUNCATION_MARK.length) + TRUNCATION_MARK
      : masked;
  const parts = splitText(capped, CONNECTOR_TURN_MAX);
  const stem = head(clean(turn.externalId), ID_MAX - ID_ROOM);
  return parts.flatMap((part, index) => {
    const text = prepareTurnText(part);
    if (text === null) return [];
    const base = parts.length > 1 ? `${stem}:${index + 1}` : stem;
    const fingerprint = createHash('sha256').update(text).digest('hex').slice(0, 12);
    return [
      {
        externalId: `${base}#${fingerprint}`,
        role: turn.role,
        authorName: clip(turn.author.name, AUTHOR_NAME_MAX),
        authorEmail: clip(turn.author.email, AUTHOR_EMAIL_MAX),
        authorSide: turn.side ?? null,
        internalNote: turn.internalNote === true,
        text,
        ts,
      },
    ];
  });
}

// Chaque tour avec sa date, ou null si l'une est illisible : elle ne se remplace pas par celle de
// l'élément, le rangement des faits date chacun par le tour qui le cite.
function datedTurns(turns: ConnectorTurn[]): Array<{ turn: ConnectorTurn; ts: Date }> | null {
  const dated: Array<{ turn: ConnectorTurn; ts: Date }> = [];
  for (const turn of turns) {
    const ts = validDate(turn.ts);
    if (!ts) return null;
    dated.push({ turn, ts });
  }
  return dated;
}

function cleanOrigin(origin: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(origin).map(([key, value]) => [clean(key), clean(value)]),
  );
}

// null si l'élément est refusé (identifiant trop long, date illisible) ou si aucun tour ne reste.
// Un élément refusé est journalisé avec l'outil et la raison seulement, jamais son contenu.
export function normalizeItem(item: ConnectorItem, provider: ProviderId): NormalizedItem | null {
  const refuse = (reason: string, ids: Record<string, string> = {}): null => {
    logError('connector.item_refused', new Error(reason), { provider, ...ids });
    return null;
  };
  const externalId = clean(item.externalId);
  if (externalId.length > ID_MAX) {
    return refuse('Identifiant d’élément trop long', { length: String(externalId.length) });
  }
  const updatedAt = validDate(item.updatedAt);
  if (!updatedAt) return refuse('Date d’élément illisible');
  const dated = datedTurns(item.turns);
  if (!dated) return refuse('Date de tour illisible');
  const turns = dated.flatMap(({ turn, ts }) => normalizeTurn(turn, ts));
  if (turns.length === 0) return null;
  return {
    ...item,
    externalId,
    title: head(maskSecrets(clean(item.title)).trim(), TITLE_MAX),
    url: item.url === null ? null : clean(item.url),
    updatedAt: updatedAt.toISOString(),
    origin: cleanOrigin(item.origin),
    turns,
  };
}

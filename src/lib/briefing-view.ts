// Le point du matin tel que l'Accueil le montre. Gardé en base, c'est un bloc pour l'assistant de code (en-tête,
// lignes de garde, balises, liste des sources, texte échappé : briefing-prompt.ts). L'écran n'en garde que les trois
// parties et leurs lignes, chacune avec ses numéros de source. Pas de bloc (point vide « rien de nouveau ») : null.
// Module pur, sans `@/server`.

const OPEN = '<point-du-matin>';
const CLOSE = '</point-du-matin>';
const REF = /\[(\d{1,3})\]/g;

export type BriefingLine = { text: string; refs: number[] };
export type BriefingSection = { title: string; lines: BriefingLine[] };

// escapeData n'échappe que « & » et « < » ; le modèle écrit parfois du Markdown en ligne, que l'écran n'a pas à montrer.
const unescaped = (text: string) => text.replaceAll('&lt;', '<').replaceAll('&amp;', '&');
const plain = (text: string) =>
  text
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Le fait du jour, écrit sous le bonjour de l'Accueil : la première ligne sourcée de « What changed ». Une partie
 * sans rien de neuf (« Nothing to report. ») ne cite rien : pas de fait.
 */
export const briefingFact = (sections: BriefingSection[]): BriefingLine | null =>
  sections
    .find((section) => section.title === 'What changed')
    ?.lines.find((line) => line.refs.length > 0) ?? null;

// Une ligne lue, avec les morceaux du Markdown qui la portent (sa puce et ses lignes de suite) : de quoi l'ôter.
type ParsedLine = BriefingLine & { spans: [number, number][] };

function parse(markdown: string): { title: string; lines: ParsedLine[] }[] | null {
  const start = markdown.indexOf(OPEN);
  const end = markdown.lastIndexOf(CLOSE);
  if (start === -1 || end <= start) return null;
  let body = markdown.slice(start + OPEN.length, end);
  // la liste des sources, que le bloc ajoute après le texte du modèle
  const sources = body.search(/\n\s*Sources:\s*\n/);
  if (sources !== -1) body = body.slice(0, sources);
  const sections: { title: string; lines: { text: string; spans: [number, number][] }[] }[] = [];
  let current: (typeof sections)[number] | null = null;
  let last: (typeof sections)[number]['lines'][number] | null = null;
  let offset = start + OPEN.length;
  const bodyEnd = offset + body.length;
  for (const raw of body.split('\n')) {
    // le morceau du Markdown de cette ligne, son retour à la ligne compris (jamais au-delà du texte lu)
    const span: [number, number] = [offset, Math.min(offset + raw.length + 1, bodyEnd)];
    offset = span[1];
    const line = unescaped(raw).trimEnd();
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim());
    if (heading) {
      current = { title: plain(heading[1] ?? ''), lines: [] };
      sections.push(current);
      last = null;
      continue;
    }
    if (line.trim() === '' || !current) {
      last = null;
      continue;
    }
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    // une ligne qui continue la précédente (indentée, sans tiret) lui est ajoutée
    if (!item && last && /^\s/.test(line)) {
      last.text = `${last.text} ${line.trim()}`;
      last.spans.push(span);
      continue;
    }
    last = { text: item ? (item[1] ?? '') : line.trim(), spans: [span] };
    current.lines.push(last);
  }
  const shown = sections
    .map((section) => ({
      title: section.title,
      lines: section.lines
        .map((line) => ({
          text: plain(line.text.replace(REF, ' ')).replace(/\s+([.,;:!?])/g, '$1'),
          refs: [...new Set([...line.text.matchAll(REF)].map((m) => Number(m[1])))],
          spans: line.spans,
        }))
        .filter((line) => line.text !== ''),
    }))
    .filter((section) => section.lines.length > 0);
  return shown.length > 0 ? shown : null;
}

/**
 * Les parties du point et leurs lignes, sans celles que l'utilisateur a retirées (`dismissed` : leur texte affiché,
 * 0074). Rien à montrer : null.
 */
export function parseBriefing(
  markdown: string,
  dismissed: readonly string[] = [],
): BriefingSection[] | null {
  const removed = new Set(dismissed);
  const sections = (parse(markdown) ?? [])
    .map((section) => ({
      title: section.title,
      lines: section.lines
        .filter((line) => !removed.has(line.text))
        .map(({ text, refs }) => ({ text, refs })),
    }))
    .filter((section) => section.lines.length > 0);
  return sections.length > 0 ? sections : null;
}

/** Le Markdown du point (crochet, MCP) sans les lignes que l'utilisateur a retirées ; le reste à l'octet près. */
export function withoutDismissed(markdown: string, dismissed: readonly string[]): string {
  if (dismissed.length === 0) return markdown;
  const removed = new Set(dismissed);
  const spans = (parse(markdown) ?? [])
    .flatMap((section) => section.lines)
    .filter((line) => removed.has(line.text))
    .flatMap((line) => line.spans)
    .sort((a, b) => b[0] - a[0]);
  let kept = markdown;
  for (const [from, to] of spans) kept = kept.slice(0, from) + kept.slice(to);
  return kept;
}

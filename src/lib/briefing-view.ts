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

export function parseBriefing(markdown: string): BriefingSection[] | null {
  const start = markdown.indexOf(OPEN);
  const end = markdown.lastIndexOf(CLOSE);
  if (start === -1 || end <= start) return null;
  let body = markdown.slice(start + OPEN.length, end);
  // la liste des sources, que le bloc ajoute après le texte du modèle
  const sources = body.search(/\n\s*Sources:\s*\n/);
  if (sources !== -1) body = body.slice(0, sources);
  const sections: BriefingSection[] = [];
  let current: BriefingSection | null = null;
  let last: BriefingLine | null = null;
  for (const raw of unescaped(body).split('\n')) {
    const line = raw.trimEnd();
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
      continue;
    }
    last = { text: item ? (item[1] ?? '') : line.trim(), refs: [] };
    current.lines.push(last);
  }
  const shown = sections
    .map((section) => ({
      title: section.title,
      lines: section.lines
        .map((line) => ({
          text: plain(line.text.replace(REF, ' ')).replace(/\s+([.,;:!?])/g, '$1'),
          refs: [...new Set([...line.text.matchAll(REF)].map((m) => Number(m[1])))],
        }))
        .filter((line) => line.text !== ''),
    }))
    .filter((section) => section.lines.length > 0);
  return shown.length > 0 ? shown : null;
}

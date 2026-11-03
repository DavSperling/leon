// Le Markdown des réponses de Leon, réduit à ce que le modèle écrit : paragraphes, titres, listes (imbriquées par
// l'indentation), blocs de code, filets ; en ligne, **gras**, *italique* et `code`. Le texte n'est jamais lu comme du
// HTML : le résultat est un arbre de morceaux que l'appelant rend lui-même. Module pur, sans React.
// shortcut: ni liens, ni tableaux, ni citations « > » (restent du texte) ; à ajouter si le modèle s'en sert.

export type MdInline = string | { code: string } | { strong: MdInline[] } | { em: MdInline[] };

export type MdBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; level: number; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: MdBlock[][] }
  | { type: 'code'; text: string }
  | { type: 'hr' };

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

const indentOf = (line: string) => /^\s*/.exec(line)?.[0].length ?? 0;
const blank = (line: string) => line.trim() === '';

export function markdownBlocks(source: string): MdBlock[] {
  return blocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

function blocks(lines: string[]): MdBlock[] {
  const out: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length > 0) out.push({ type: 'p', text: para.join('\n') });
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    const item = ITEM.exec(line);
    if (blank(line)) {
      flush();
      i += 1;
    } else if (FENCE.test(line)) {
      flush();
      const fence = (FENCE.exec(line) as RegExpExecArray)[1] as string;
      const end = lines.findIndex((l, j) => j > i && l.trim().startsWith(fence));
      // une réponse en cours peut ne pas avoir encore fermé son bloc
      const stop = end === -1 ? lines.length : end;
      out.push({ type: 'code', text: lines.slice(i + 1, stop).join('\n') });
      i = stop + 1;
    } else if (RULE.test(line)) {
      flush();
      out.push({ type: 'hr' });
      i += 1;
    } else if (HEADING.test(line)) {
      flush();
      const [, hashes, text] = HEADING.exec(line) as RegExpExecArray;
      out.push({ type: 'h', level: (hashes as string).length, text: text as string });
      i += 1;
    } else if (
      item &&
      (para.length === 0 || !/^\d/.test(item[2] as string) || /^1\D/.test(item[2] as string))
    ) {
      // dans un paragraphe, « 2026. » en début de ligne reste du texte : seule une liste qui commence à 1 l'interrompt
      flush();
      i = list(lines, i, out);
    } else {
      para.push(line.trim());
      i += 1;
    }
  }
  flush();
  return out;
}

/** Une liste à partir de la ligne `i` : ses éléments, avec ce qui est indenté dessous. Rend l'indice qui la suit. */
function list(lines: string[], i: number, out: MdBlock[]): number {
  const first = ITEM.exec(lines[i] as string) as RegExpExecArray;
  const indent = (first[1] as string).length;
  const ordered = /^\d/.test(first[2] as string);
  const items: MdBlock[][] = [];
  while (i < lines.length) {
    const head = ITEM.exec(lines[i] as string);
    if (!head || (head[1] as string).length !== indent || /^\d/.test(head[2] as string) !== ordered)
      break;
    const body = [head[3] as string];
    i += 1;
    while (i < lines.length) {
      const line = lines[i] as string;
      if (blank(line)) {
        // une ligne vide garde la liste si la suite est indentée dessous, ou un autre élément du même niveau
        const next = lines.slice(i).find((l) => !blank(l));
        if (next === undefined || indentOf(next) <= indent) break;
        body.push('');
      } else if (indentOf(line) > indent) {
        body.push(line);
      } else if (!ITEM.test(line) && !HEADING.test(line) && !FENCE.test(line) && !RULE.test(line)) {
        body.push(line); // suite du texte de l'élément, sans indentation
      } else break;
      i += 1;
    }
    const rest = body.slice(1);
    const cut = Math.min(...rest.filter((l) => !blank(l)).map(indentOf));
    items.push(
      blocks([body[0] as string, ...rest.map((l) => l.slice(Number.isFinite(cut) ? cut : 0))]),
    );
    if (i < lines.length && blank(lines[i] as string)) {
      const next = lines.slice(i).findIndex((l) => !blank(l));
      if (next !== -1 && ITEM.test(lines[i + next] as string)) i += next;
    }
  }
  out.push({
    type: 'list',
    ordered,
    start: ordered ? Number.parseInt(first[2] as string, 10) : 1,
    items,
  });
  return i;
}

const INLINE = /`([^`\n]+)`|\*\*(?=\S)([\s\S]*?\S)\*\*|\*(?=[^\s*])([^*\n]*?[^\s*])\*/g;

/** Les morceaux en ligne d'un texte : du texte brut (où restent les renvois [n]), du code, du gras, de l'italique. */
export function markdownInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let from = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > from) out.push(text.slice(from, m.index));
    const [, code, strong, em] = m;
    if (code !== undefined) out.push({ code });
    else if (strong !== undefined) out.push({ strong: markdownInline(strong) });
    else out.push({ em: markdownInline(em as string) });
    from = m.index + m[0].length;
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

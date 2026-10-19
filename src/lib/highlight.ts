// Surlignage des extraits de recherche (C6 du plan du deuxième jet, décision D5).
// Postgres entoure les mots trouvés de deux caractères de la zone privée d'Unicode, que le texte d'un passage
// ne contient jamais (chunkText les retire). L'interface découpe l'extrait selon ces marqueurs et rend les
// morceaux surlignés dans `<mark>` : le texte n'est jamais interprété comme du HTML.

export const HIGHLIGHT_START = '\uE000';
export const HIGHLIGHT_END = '\uE001';

// Un début, du texte sans marqueur, une fin. Un marqueur qui n'a pas son pendant ne correspond à rien : il reste
// dans le texte, comme n'importe quel autre caractère.
const HIGHLIGHT = new RegExp(
  `${HIGHLIGHT_START}([^${HIGHLIGHT_START}${HIGHLIGHT_END}]*)${HIGHLIGHT_END}`,
  'g',
);
const MARKS = new RegExp(`[${HIGHLIGHT_START}${HIGHLIGHT_END}]`, 'g');

export function splitHighlights(snippet: string): Array<{ text: string; hit: boolean }> {
  const parts: Array<{ text: string; hit: boolean }> = [];
  const push = (text: string, hit: boolean) => {
    if (text === '') return;
    const last = parts.at(-1);
    // Deux morceaux non surlignés de suite (un surlignage vide les séparait) n'en font qu'un.
    if (last && !last.hit && !hit) last.text += text;
    else parts.push({ text, hit });
  };
  let from = 0;
  for (const match of snippet.matchAll(HIGHLIGHT)) {
    push(snippet.slice(from, match.index), false);
    push(match[1] ?? '', true);
    from = match.index + match[0].length;
  }
  push(snippet.slice(from), false);
  return parts;
}

// Le texte sans aucun marqueur : celui qu'on stocke et celui que tape l'utilisateur.
export function stripHighlightMarks(text: string): string {
  return text.replace(MARKS, '');
}

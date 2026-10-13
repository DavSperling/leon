const QUOTE_MIN_CHARS = 8;
const QUOTE_MAX_CHARS = 500;

// Apostrophes et guillemets typographiques ramenés à leur forme ASCII.
const ASCII_PUNCTUATION: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‛': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '«': '"',
  '»': '"',
};

// Texte normalisé, et pour chaque caractère normalisé l'intervalle [début, fin) qu'il couvre dans l'original.
type Normalized = { text: string; starts: number[]; ends: number[] };

// Un caractère de base et ses diacritiques forment une unité, normalisée en NFC.
// Les suites de blancs deviennent un espace ; un blanc collé à un guillemet disparaît,
// pour que « texte » et "texte" se rejoignent.
function normalize(text: string): Normalized {
  let out = '';
  const starts: number[] = [];
  const ends: number[] = [];
  const push = (char: string, start: number, end: number) => {
    out += char;
    starts.push(start);
    ends.push(end);
  };
  const dropLastSpace = () => {
    out = out.slice(0, -1);
    starts.pop();
    ends.pop();
  };
  for (const match of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const start = match.index;
    const end = start + match[0].length;
    const unit = match[0].normalize('NFC');
    if (/^\s$/u.test(unit)) {
      if (out.endsWith(' ')) ends[ends.length - 1] = end;
      else if (!out.endsWith('"')) push(' ', start, end);
      continue;
    }
    // Par unité de code UTF-16 : une table d'offsets par caractère de `out`.
    for (const char of unit.split('')) {
      const mapped = ASCII_PUNCTUATION[char] ?? char;
      if (mapped === '"' && out.endsWith(' ')) dropLastSpace();
      push(mapped, start, end);
    }
  }
  return { text: out, starts, ends };
}

// Offsets de la citation dans le texte d'origine du tour, ou null si elle n'y figure pas
// (à l'apostrophe, aux guillemets, aux accents et aux blancs près).
export function verifyQuote(
  turnText: string,
  quote: string,
): { start: number; end: number } | null {
  const trimmed = quote.trim();
  if (trimmed.length < QUOTE_MIN_CHARS || trimmed.length > QUOTE_MAX_CHARS) return null;
  const exact = turnText.indexOf(trimmed);
  if (exact !== -1) return { start: exact, end: exact + trimmed.length };
  const haystack = normalize(turnText);
  const needle = normalize(trimmed).text.trim();
  if (needle === '') return null;
  const index = haystack.text.indexOf(needle);
  if (index === -1) return null;
  return {
    start: haystack.starts[index] as number,
    end: haystack.ends[index + needle.length - 1] as number,
  };
}

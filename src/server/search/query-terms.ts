// Les mots d'une requête, pour le plein texte de la recherche (T06b). Pur : ni base, ni réseau, jamais d'exception.
//
// Une question posée en phrase (« Quelles sont les sauvegardes quotidiennes ? ») porte des mots outils :
// interrogatifs, articles, prépositions, pronoms, auxiliaires. Le plein texte exige tous les mots de la requête, et
// ni le dictionnaire français de Postgres (qui garde « quel » et « les ») ni le dictionnaire simple (qui garde tout)
// ne les retire : la question ne trouvait rien. `queryTerms` les retire de la partie libre du texte (hors
// guillemets, hors mots niés par « - »), et donne à part les mots, les expressions et les négations dont la passe
// élargie de search.ts a besoin. Le texte arrive de parseQuery : ses filtres (de:, outil:, type:, depuis:, avant:)
// en sont déjà sortis, et rien ici n'y touche.

// Mots outils du français, en minuscules ; comparés sans accents ni casse, avec l'apostrophe droite ou
// typographique. Laissés de côté exprès, parce qu'ils sont aussi des noms qu'on cherche : « avoir » (la note de
// crédit), « être », « sommes » (des montants), « son », « ton », « ça » (qui, sans accent, est « ca », le chiffre
// d'affaires) et « font ».
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  // Interrogatifs
  'quel',
  'quelle',
  'quels',
  'quelles',
  'lequel',
  'laquelle',
  'lesquels',
  'lesquelles',
  'qui',
  'que',
  'qu’',
  'quoi',
  'comment',
  'pourquoi',
  'où',
  'quand',
  'combien',
  'est-ce',
  // Articles et déterminants
  'le',
  'la',
  'les',
  'l’',
  'un',
  'une',
  'des',
  'du',
  'de',
  'd’',
  'au',
  'aux',
  'ce',
  'cet',
  'cette',
  'ces',
  'mon',
  'ma',
  'mes',
  'ta',
  'tes',
  'sa',
  'ses',
  'notre',
  'nos',
  'votre',
  'vos',
  'leur',
  'leurs',
  // Prépositions et conjonctions
  'à',
  'en',
  'dans',
  'sur',
  'sous',
  'par',
  'pour',
  'avec',
  'sans',
  'chez',
  'vers',
  'entre',
  'jusqu’',
  'lorsqu’',
  'puisqu’',
  'et',
  'ou',
  'mais',
  'donc',
  'ni',
  // Pronoms
  'je',
  'j’',
  'tu',
  'il',
  'elle',
  'on',
  'nous',
  'vous',
  'ils',
  'elles',
  'me',
  'm’',
  'te',
  't’',
  'se',
  's’',
  'moi',
  'toi',
  'lui',
  'eux',
  'y',
  'c’',
  'cela',
  'ceci',
  'celui',
  'celle',
  'ceux',
  'celles',
  'dont',
  // Négation
  'ne',
  'n’',
  'pas',
  // Être et avoir au présent
  'suis',
  'es',
  'est',
  'êtes',
  'sont',
  'ai',
  'as',
  'a',
  'avons',
  'avez',
  'ont',
  // Faire et dire au présent
  'fais',
  'fait',
  'faisons',
  'faites',
  'dis',
  'dit',
  'disons',
  'dites',
  'disent',
]);

// Mots gardés pour la passe élargie : chacun y ajoute deux recherches dans le dictionnaire et un test par passage
// candidat. Un paragraphe collé (300 caractères, une quarantaine de mots) ne fabrique pas une requête démesurée.
export const WIDE_WORDS_MAX = 16;

export type QueryTerms = {
  // Le texte de la première passe : la requête sans ses mots outils, ou telle quelle si tout en est.
  text: string;
  // Les mots libres gardés, sans la ponctuation qui les entoure : en passe élargie, chacun suffit. Sans doublon,
  // WIDE_WORDS_MAX au plus ; vide quand la requête n'a que des mots outils.
  words: string[];
  // Les expressions entre guillemets, guillemets compris : toujours exigées telles quelles.
  phrases: string[];
  // Les mots ou expressions niés par « - », sans le « - » : toujours exclus.
  negated: string[];
};

type Token =
  | { kind: 'mot'; raw: string }
  | { kind: 'expression'; raw: string }
  | { kind: 'negation'; raw: string; term: string }
  | { kind: 'ponctuation'; raw: string };

const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text);

// Sans accents ni casse, l'apostrophe droite valant la typographique : « Où », « ou » et « OU » se confondent.
function normalize(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/'/g, '’');
}

const NORMALIZED = new Set([...FUNCTION_WORDS].map(normalize));

// « l’équipe », « qu’est-ce », « d’Acme » : un article ou un pronom élidé, collé au mot qui suit.
const ELISION = /^(qu|jusqu|lorsqu|puisqu|[cdjlmnst])['’](.*)$/iu;
// Ponctuation autour d'un mot ; l'apostrophe finale reste (« qu’ » seul est un mot outil).
const AROUND = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’]+$/gu;
// Une fin de phrase : le mot qui suit commence une phrase, sa majuscule ne fait pas de lui un nom propre.
const SENTENCE_END = /[.!?…]$/u;
// L'opérateur « ou » de websearch_to_tsquery, sans casse.
const OR_OPERATOR = 'or';

function isFunctionWord(word: string): boolean {
  const key = normalize(word);
  if (NORMALIZED.has(key)) return true;
  // « a-t-il », « est-il », « sont-elles » : une inversion faite de mots outils et du « t » euphonique.
  const parts = key.split('-');
  return (
    parts.length > 1 && parts.every((part) => part !== '' && (part === 't' || NORMALIZED.has(part)))
  );
}

// Le mot gardé, ou null pour un mot outil. Un mot à majuscule hors début de phrase est un nom propre (« La
// Poste », « ON Semiconductor ») : il reste tel quel.
function keptWord(raw: string, sentenceStart: boolean): string | null {
  const word = raw.replace(AROUND, '');
  const first = word.charAt(0);
  if (!sentenceStart && first !== first.toLowerCase()) return word;
  const elided = ELISION.exec(word);
  const rest = elided && NORMALIZED.has(normalize(`${elided[1]}’`)) ? (elided[2] ?? '') : word;
  if (!hasWords(rest) || isFunctionWord(rest)) return null;
  return rest;
}

// Découpe à la manière de websearch_to_tsquery : "une expression", -mot ou -"expression" pour nier, le reste en
// mots séparés par les espaces. Un guillemet qui ne se ferme pas ouvre une expression jusqu'à la fin.
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const char = text.charAt(at);
    if (/\s/u.test(char)) {
      at += 1;
      continue;
    }
    const negatedPhrase = char === '-' && text.charAt(at + 1) === '"';
    if (char === '"' || negatedPhrase) {
      const open = negatedPhrase ? at + 1 : at;
      const close = text.indexOf('"', open + 1);
      const end = close === -1 ? text.length : close + 1;
      const quoted = close === -1 ? `${text.slice(open)}"` : text.slice(open, end);
      at = end;
      if (!hasWords(quoted)) continue;
      tokens.push(
        negatedPhrase
          ? { kind: 'negation', raw: `-${quoted}`, term: quoted }
          : { kind: 'expression', raw: quoted },
      );
      continue;
    }
    let end = at;
    while (end < text.length && !/\s/u.test(text.charAt(end)) && text.charAt(end) !== '"') end += 1;
    const raw = text.slice(at, end);
    at = end;
    if (!hasWords(raw)) tokens.push({ kind: 'ponctuation', raw });
    else if (raw.startsWith('-'))
      tokens.push({ kind: 'negation', raw, term: raw.replace(/^-+/, '') });
    else tokens.push({ kind: 'mot', raw });
  }
  return tokens;
}

// « or » ne relie que deux termes : en tête, en fin ou doublé (une fois les mots outils partis), il disparaît.
function tidyOperators(parts: Array<{ text: string; operator: boolean }>): string[] {
  const kept: Array<{ text: string; operator: boolean }> = [];
  for (const part of parts) {
    const previous = kept.at(-1);
    if (part.operator && (!previous || previous.operator)) continue;
    kept.push(part);
  }
  while (kept.at(-1)?.operator) kept.pop();
  return kept.map((part) => part.text);
}

export function queryTerms(text: string): QueryTerms {
  const parts: Array<{ text: string; operator: boolean }> = [];
  const words: string[] = [];
  const seen = new Set<string>();
  const phrases: string[] = [];
  const negated: string[] = [];
  let positive = false;
  let sentenceStart = true;

  for (const token of tokenize(text)) {
    switch (token.kind) {
      case 'expression':
        phrases.push(token.raw);
        parts.push({ text: token.raw, operator: false });
        positive = true;
        break;
      case 'negation':
        negated.push(token.term);
        parts.push({ text: token.raw, operator: false });
        break;
      case 'mot': {
        if (normalize(token.raw) === OR_OPERATOR) {
          parts.push({ text: token.raw, operator: true });
          break;
        }
        const word = keptWord(token.raw, sentenceStart);
        if (word === null) break;
        parts.push({ text: word, operator: false });
        positive = true;
        const key = normalize(word);
        if (!seen.has(key) && words.length < WIDE_WORDS_MAX) {
          seen.add(key);
          words.push(word);
        }
        break;
      }
      case 'ponctuation':
        break;
    }
    sentenceStart = SENTENCE_END.test(token.raw);
  }

  // Rien que des mots outils (« qui ? ») : la requête reste telle quelle, sans passe élargie.
  if (!positive) return { text, words: [], phrases, negated };
  return { text: tidyOperators(parts).join(' '), words, phrases, negated };
}

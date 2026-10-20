import { Fragment } from 'react';
import { splitHighlights } from '@/lib/highlight';

// Surlignage des mots trouvés. Le texte n'est jamais interprété comme du HTML : on le découpe en morceaux et
// seuls les morceaux trouvés vont dans un `<mark>` (décision D5 du plan du deuxième jet).

type Part = { text: string; hit: boolean };

const MARK_CLASS = 'rounded-[3px] bg-cite-soft px-0.5 font-medium text-foreground';

function Parts({ parts }: { parts: Part[] }) {
  return parts.map((part, index) =>
    part.hit ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte découpé une fois, jamais réordonnés
      <mark key={index} className={MARK_CLASS}>
        {part.text}
      </mark>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte découpé une fois, jamais réordonnés
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}

// L'extrait d'un résultat : la base a entouré les mots trouvés des marqueurs de `src/lib/highlight.ts`.
export function HighlightedText({ snippet }: { snippet: string }) {
  return <Parts parts={splitHighlights(snippet)} />;
}

// Le début d'un mot (lettres et chiffres) qui ne continue pas un autre : « contrat » ne se trouve pas dans
// « microcontrat ».
const WORD_START = '(?<![\\p{L}\\p{N}])';
const WORD_REST = '[\\p{L}\\p{N}]*';

// Une approximation de la racine que le plein texte français compare (« contrats », « contrat » ; « renouvelé »,
// « renouvellement ») : sans le pluriel, puis sans la fin d'un mot long.
function stem(term: string): string {
  const singular = term.length > 3 ? term.replace(/[sx]$/i, '') : term;
  if (singular.length >= 8) return singular.slice(0, -2);
  if (singular.length >= 6) return singular.slice(0, -1);
  return singular;
}

// Les mots cherchés repérés dans le texte d'un tour. Le serveur ne rend pas la place du passage trouvé : on
// repère donc les mots eux-mêmes, d'assez près pour montrer où lire, sans promettre d'être exact comme la base.
// Les mots sont réduits à leurs lettres et chiffres : rien d'un mot tapé ne devient une expression régulière.
export function highlightTerms(text: string, terms: string[]): Part[] {
  if (text === '') return [];
  const stems = [
    ...new Set(
      terms
        .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter((term) => term.length >= 2)
        .map(stem),
    ),
  ];
  if (stems.length === 0) return [{ text, hit: false }];
  const pattern = new RegExp(`${WORD_START}(?:${stems.join('|')})${WORD_REST}`, 'giu');
  const parts: Part[] = [];
  let from = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > from) parts.push({ text: text.slice(from, match.index), hit: false });
    parts.push({ text: match[0], hit: true });
    from = match.index + match[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}

// Le texte d'un tour, avec les mots cherchés repérés.
export function TermHighlightedText({ text, terms }: { text: string; terms: string[] }) {
  return <Parts parts={highlightTerms(text, terms)} />;
}

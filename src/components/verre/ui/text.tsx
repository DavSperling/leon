import { Fragment, type ReactNode } from 'react';
import { referenceSegments, splitHighlights } from '@/lib/verre/text';

/** Rend un extrait marqué (U+E000 … U+E001) avec <mark> ; le texte n'est jamais lu comme du HTML. */
export function Highlighted({ text }: { text: string }) {
  return (
    <>
      {splitHighlights(text).map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé, dans l'ordre
        <Fragment key={i}>{p.hit ? <mark>{p.text}</mark> : p.text}</Fragment>
      ))}
    </>
  );
}

/** Morceaux à rendre : du texte, ou une suite de renvois collée au mot d'avant et à la ponctuation d'après. */
type Run = string | { word: string; refs: number[]; punct: string };

/**
 * Une puce est un bloc en ligne : le navigateur peut couper juste après elle, même devant un point. La suite de puces
 * reste donc collée au mot qui la précède et à la ponctuation qui la suit : jamais de « . » seul en début de ligne.
 */
function citedRuns(text: string, keep?: (n: number) => boolean): Run[] {
  const out: Run[] = [];
  for (const seg of referenceSegments(text, keep ?? (() => true))) {
    const last = out.at(-1);
    if ('ref' in seg) {
      if (typeof last === 'object' && !last.punct) last.refs.push(seg.ref);
      else {
        // le mot d'avant vient avec (comme une espace insécable devant un appel de note)
        const word = typeof last === 'string' ? (/\S+\s*$/.exec(last)?.[0] ?? '') : '';
        if (word) out[out.length - 1] = (last as string).slice(0, -word.length);
        out.push({ word, refs: [seg.ref], punct: '' });
      }
      continue;
    }
    let rest = seg.text;
    if (typeof last === 'object') {
      last.punct = /^[  ]?[.,;:!?…)»]+/.exec(rest)?.[0] ?? '';
      rest = rest.slice(last.punct.length);
    }
    if (rest) out.push(rest);
  }
  return out.filter((r) => r !== '');
}

console.assert(
  JSON.stringify(citedRuns('fin octobre [1][2]. ACME')) ===
    '["fin ",{"word":"octobre ","refs":[1,2],"punct":"."}," ACME"]' &&
    JSON.stringify(citedRuns('Oui [1] et [3]\u202f?')) ===
      JSON.stringify([
        { word: 'Oui ', refs: [1], punct: '' },
        ' ',
        { word: 'et ', refs: [3], punct: '\u202f?' },
      ]),
  'text.tsx : puces mal collées au texte',
);

/**
 * Rend un texte avec renvois « [n] » : chaque renvoi passe par `renderCite` (une CitationChip, en général), collé au
 * mot d'avant et à la ponctuation d'après. `keep` écarte un numéro sans source. Un crochet collé à du code (`argv[0]`) reste du texte.
 */
export function CitedText({
  text,
  renderCite,
  keep,
}: {
  text: string;
  renderCite: (n: number, index: number) => ReactNode;
  keep?: (n: number) => boolean;
}) {
  let index = 0;
  return (
    <>
      {citedRuns(text, keep).map((r, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé, dans l'ordre
        <Fragment key={i}>
          {typeof r === 'string' ? (
            r
          ) : (
            <span className="whitespace-nowrap">
              {r.word}
              {r.refs.map((n) => (
                <Fragment key={n}>{renderCite(n, index++)}</Fragment>
              ))}
              {r.punct}
            </span>
          )}
        </Fragment>
      ))}
    </>
  );
}

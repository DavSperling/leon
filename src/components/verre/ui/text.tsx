import { Fragment, type ReactNode } from 'react';
import { type MdBlock, type MdInline, markdownBlocks, markdownInline } from '@/lib/markdown';
import { cn } from '@/lib/verre/cn';
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

/**
 * Rend une réponse écrite en Markdown (markdownBlocks) : paragraphes, titres, listes, gras, code. Les renvois [n] y
 * passent par `renderCite`, comme dans CitedText, sauf dans le code. `tail` (le curseur d'une réponse en cours) suit
 * le dernier mot.
 */
export function CitedMarkdown({
  text,
  renderCite,
  keep,
  tail,
}: {
  text: string;
  renderCite: (n: number) => ReactNode;
  keep?: (n: number) => boolean;
  tail?: ReactNode;
}) {
  const inline = (parts: MdInline[]): ReactNode =>
    parts.map((p, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé, dans l'ordre
      <Fragment key={i}>
        {typeof p === 'string' ? (
          <CitedText text={p} renderCite={renderCite} keep={keep} />
        ) : 'code' in p ? (
          <code className="rounded-[5px] bg-glass-3 px-[5px] py-px font-mono text-[0.86em] shadow-[inset_0_0_0_1px_var(--line)]">
            {p.code}
          </code>
        ) : 'strong' in p ? (
          <strong className="font-semibold">{inline(p.strong)}</strong>
        ) : (
          <em>{inline(p.em)}</em>
        )}
      </Fragment>
    ));
  // `gap` : l'espace au-dessus d'un bloc qui en suit un autre, plus serré dans une liste
  const render = (blocks: MdBlock[], end: ReactNode, gap: string): ReactNode =>
    blocks.map((b, i) => {
      const last = i === blocks.length - 1 ? end : null;
      const space = i > 0 && gap;
      const key = `${i}${b.type}`;
      if (b.type === 'p')
        return (
          <p key={key} className={cn('whitespace-pre-line', space)}>
            {inline(markdownInline(b.text))}
            {last}
          </p>
        );
      if (b.type === 'h') {
        const H = b.level <= 2 ? 'h3' : 'h4';
        return (
          <H key={key} className={cn('text-title font-semibold', i > 0 && 'mt-5')}>
            {inline(markdownInline(b.text))}
            {last}
          </H>
        );
      }
      if (b.type === 'list') {
        const L = b.ordered ? 'ol' : 'ul';
        return (
          <L
            key={key}
            start={b.ordered && b.start !== 1 ? b.start : undefined}
            className={cn(
              'grid gap-1.5 pl-5 marker:text-muted',
              b.ordered ? 'list-decimal' : 'list-disc',
              space,
            )}
          >
            {b.items.map((item, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: éléments d'un texte figé, dans l'ordre
              <li key={j} className="pl-1">
                {render(item, j === b.items.length - 1 ? last : null, 'mt-1.5')}
              </li>
            ))}
          </L>
        );
      }
      if (b.type === 'code')
        return (
          <pre
            key={key}
            className={cn(
              'overflow-x-auto rounded-field bg-glass-3 px-3.5 py-3 font-mono text-[13px] leading-[1.6] whitespace-pre shadow-[inset_0_0_0_1px_var(--line)]',
              space,
            )}
          >
            <code>{b.text}</code>
            {last}
          </pre>
        );
      return (
        <Fragment key={key}>
          <hr className={cn('border-line', i > 0 && 'mt-4', 'mb-1')} />
          {last}
        </Fragment>
      );
    });
  return render(markdownBlocks(text), tail, 'mt-3');
}

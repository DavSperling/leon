import { Fragment, type ReactNode } from 'react';
import { type MdBlock, type MdInline, markdownBlocks, markdownInline } from '@/lib/markdown';
import { splitMarks, stripMarks } from '@/lib/source-marks';
import { cn } from '@/lib/verre/cn';
import { referenceSegments, splitHighlights } from '@/lib/verre/text';
import { toneOf } from './marks';

/**
 * Rend un extrait marqué (U+E000 … U+E001) avec <mark>, un trait de surligneur (ambre ; dans un `OriginalSheet`, la
 * couleur de la source) ; le texte n'est jamais lu comme du HTML.
 */
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
  // un renvoi écarté (numéro sans source) vient d'être sauté : l'espace qui le précédait part avec lui
  let dropped = false;
  for (const seg of referenceSegments(text, () => true)) {
    const last = out.at(-1);
    if ('ref' in seg) {
      if (keep && !keep(seg.ref)) {
        dropped = true;
        continue;
      }
      dropped = false;
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
      if (dropped) rest = rest.replace(/^[ \u00a0]+(?=[.,)])/, '');
      last.punct = /^[\u00a0\u202f]?[.,;:!?…)»]+/.exec(rest)?.[0] ?? '';
      rest = rest.slice(last.punct.length);
    } else if (typeof last === 'string') {
      // « (GitHub #389) [9]. » sans la source 9 : « (GitHub #389). », jamais « (GitHub #389) . »
      const glued = /^[.,)\s]/.test(rest) ? last.replace(/[ \u00a0]+$/, '') : last;
      const prev = out.at(-2);
      if (dropped && glued === '' && typeof prev === 'object' && !prev.punct) {
        // \u00ab Vu [1] [9]. \u00bb sans la source 9 : le point revient \u00e0 la puce d'avant, \u00ab Vu [1]. \u00bb
        out.pop();
        prev.punct = /^[\u00a0\u202f]?[.,;:!?\u2026)\u00bb]+/.exec(rest)?.[0] ?? '';
        rest = rest.slice(prev.punct.length);
      } else {
        out[out.length - 1] = glued + rest;
        rest = '';
      }
    }
    dropped = false;
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
      ]) &&
    JSON.stringify(citedRuns('(GitHub #389) [9]. Vu [1] [9].', (n) => n !== 9)) ===
      '["(GitHub #389). ",{"word":"Vu ","refs":[1],"punct":"."}]',
  'text.tsx : puces mal collées au texte',
);

const MARKED = /[\uE100-\uE1FF\uE0FF]/;

/**
 * Rend un texte avec renvois « [n] » : chaque renvoi passe par `renderCite` (une CitationChip, en général), collé au
 * mot d'avant et à la ponctuation d'après. `keep` écarte un numéro sans source. Un crochet collé à du code (`argv[0]`) reste du texte.
 * Les mots marqués par markCited (lib/source-marks.ts) passent sous le surligneur de leur source.
 */
export function CitedText({
  text,
  renderCite,
  keep,
  lit,
}: {
  text: string;
  renderCite: (n: number, index: number) => ReactNode;
  keep?: (n: number) => boolean;
  /** La source pointée (son numéro, sa ligne) : ses mots s'appuient dans le texte. */
  lit?: number | null;
}) {
  let index = 0;
  // une marque peut commencer dans le texte et finir dans le mot collé au renvoi : elle suit l'ordre du texte
  let open: number | null = null;
  const paint = (piece: string): ReactNode => {
    if (open === null && !MARKED.test(piece)) return piece;
    const before = open;
    const split = splitMarks(piece, open);
    open = split.open;
    const last = split.parts.length - 1;
    return split.parts.map((part, i) =>
      part.n === null ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé, dans l'ordre
        <Fragment key={i}>{part.text}</Fragment>
      ) : (
        // une marque coupée par le mot collé au renvoi se lit d'un seul trait : pas de couture entre ses deux moitiés
        <mark
          // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé, dans l'ordre
          key={i}
          className={cn(
            `hl hl-${toneOf(part.n)}`,
            part.n === lit && 'is-lit',
            i === 0 && before !== null && 'hl--b',
            i === last && split.open !== null && 'hl--a',
          )}
        >
          {part.text}
        </mark>
      ),
    );
  };
  return (
    <>
      {citedRuns(text, keep).map((r, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé, dans l'ordre
        <Fragment key={i}>
          {typeof r === 'string' ? (
            paint(r)
          ) : (
            <span className="whitespace-nowrap">
              {paint(r.word)}
              {r.refs.map((n) => (
                <Fragment key={n}>{renderCite(n, index++)}</Fragment>
              ))}
              {paint(r.punct)}
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
 * le dernier mot. `mark` : le texte d'un paragraphe ou d'un titre passe d'abord par lui (markCited : les mots venus de
 * la source, sous le surligneur) ; jamais le code.
 */
export function CitedMarkdown({
  text,
  renderCite,
  keep,
  tail,
  mark,
  lit,
}: {
  text: string;
  renderCite: (n: number) => ReactNode;
  keep?: (n: number) => boolean;
  tail?: ReactNode;
  mark?: (text: string) => string;
  /** La source pointée : ses mots s'appuient (CitedText). */
  lit?: number | null;
}) {
  const marked = (blockText: string) => (mark ? mark(blockText) : blockText);
  const inline = (parts: MdInline[]): ReactNode =>
    parts.map((p, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte figé, dans l'ordre
      <Fragment key={i}>
        {typeof p === 'string' ? (
          <CitedText text={p} renderCite={renderCite} keep={keep} lit={lit} />
        ) : 'code' in p ? (
          <code className="rounded-[4px] border border-line bg-glass-3 px-[5px] py-px font-mono text-[0.86em]">
            {stripMarks(p.code)}
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
      // sous un titre, le texte le suit de près
      const space = i > 0 && (blocks[i - 1]?.type === 'h' ? 'mt-2' : gap);
      const key = `${i}${b.type}`;
      if (b.type === 'p')
        return (
          <p key={key} className={cn('whitespace-pre-line', space)}>
            {inline(markdownInline(marked(b.text)))}
            {last}
          </p>
        );
      if (b.type === 'h') {
        const H = b.level <= 2 ? 'h3' : 'h4';
        return (
          <H
            key={key}
            // jamais plus petit que le texte qu'il coiffe (une réponse se lit à 18 px)
            className={cn(
              'font-semibold text-balance',
              b.level <= 2 ? 'text-[1.12em] leading-[1.35]' : 'text-[1em]',
              i > 0 && 'mt-7',
            )}
          >
            {inline(markdownInline(marked(b.text)))}
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
              'grid gap-2 pl-5 marker:text-muted marker:[font-variant-numeric:normal]',
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
              'overflow-x-auto rounded-item border border-line bg-glass-3 px-3.5 py-3 font-mono text-[13px] leading-[1.6] whitespace-pre',
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
  return render(markdownBlocks(text), tail, 'mt-4');
}

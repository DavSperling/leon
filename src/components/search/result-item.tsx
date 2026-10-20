import { SourceChip } from '@/components/source-chip';
import { SourceLink } from '@/components/source-link';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { resultAnchorId } from './answer-text';
import { HighlightedText } from './highlighted-text';
import type { ResultPassageView, ResultView } from './view-model';

// Un résultat : l'outil, le titre, puis jusqu'à trois passages avec leurs mots surlignés, leur auteur et leur
// date, et le lien vers l'original. Le titre et chaque passage ouvrent l'aperçu ; le lien ouvre l'outil.

export type OpenPassage = (
  result: ResultView,
  passage: ResultPassageView,
  trigger: HTMLElement,
) => void;

function Separator() {
  return <span aria-hidden="true">·</span>;
}

export function ResultItem({
  result,
  selectedPassageId,
  onOpen,
}: {
  result: ResultView;
  selectedPassageId: string | null;
  onOpen: OpenPassage;
}) {
  const first = result.passages[0];
  const title = result.title ?? 'Sans titre';
  return (
    // L'ancre : un renvoi [n] de la réponse en tête mène ici.
    <li
      id={resultAnchorId(result.sourceId)}
      className="scroll-mt-6 border-b py-5 first:pt-1 last:border-b-0"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-[18px] text-muted-foreground">
        <SourceChip kind={result.kind} label={result.kindLabel} />
        <Separator />
        <span>{result.natureLabel}</span>
        {result.originLabel && (
          <>
            <Separator />
            <span className="max-w-[28ch] truncate" title={result.originLabel}>
              {result.originLabel}
            </span>
          </>
        )}
      </div>
      <h2 className="mt-1 text-[16px] leading-6 font-medium">
        {first ? (
          <button
            type="button"
            onClick={(event) => onOpen(result, first, event.currentTarget)}
            className={cn(
              'cursor-pointer text-left underline-offset-2 transition-colors hover:underline',
              !result.title && 'text-muted-foreground',
            )}
          >
            {title}
          </button>
        ) : (
          <span className={cn(!result.title && 'text-muted-foreground')}>{title}</span>
        )}
      </h2>
      {result.passages.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {result.passages.map((passage) => {
            const selected = passage.passageId === selectedPassageId;
            return (
              <li key={passage.passageId}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={(event) => onOpen(result, passage, event.currentTarget)}
                  className={cn(
                    '-mx-2.5 block w-[calc(100%+1.25rem)] cursor-pointer rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted',
                    selected && 'bg-accent hover:bg-accent',
                  )}
                >
                  <span className="block text-[13px] leading-[18px] text-muted-foreground">
                    {passage.authorName && <>{passage.authorName} · </>}
                    <time dateTime={passage.ts.toISOString()} className="tabular-nums">
                      {formatDate(passage.ts)}
                    </time>
                  </span>
                  <span className="mt-0.5 block text-[15px] leading-6 break-words text-foreground-2">
                    <HighlightedText snippet={passage.snippet} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {result.url && (
        <SourceLink
          url={result.url}
          label={result.kindLabel}
          className="mt-1.5 text-[13px] leading-[18px]"
        />
      )}
    </li>
  );
}

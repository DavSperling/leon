import { ExternalLink, Sparkles } from 'lucide-react';
import type { DiscussionCitation } from '@/lib/discussion-events';
import { cn } from '@/lib/utils';
import { messageSegments } from './message-segments';

// Un message de la discussion : la question de l'utilisateur, ou la réponse de Leon avec ses renvois [n] et la
// liste de ses sources. Un renvoi et une source ouvrent l'aperçu du passage cité, sans quitter la page.

export type OpenCitation = (citation: DiscussionCitation, trigger: HTMLElement) => void;

const titleOf = (citation: DiscussionCitation): string => citation.title?.trim() || 'Sans titre';

function CitationChip({
  citation,
  onOpen,
  className,
}: {
  citation: DiscussionCitation;
  onOpen: OpenCitation;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onOpen(citation, event.currentTarget)}
      title={titleOf(citation)}
      aria-label={`Source ${citation.n} : ${titleOf(citation)}`}
      className={cn(
        'inline-flex h-[18px] min-w-[18px] cursor-pointer items-center justify-center rounded-[5px] bg-primary-soft px-1 align-[1px] text-[12px] leading-none font-medium text-primary tabular-nums transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        className,
      )}
    >
      {citation.n}
    </button>
  );
}

// Le texte, avec ses renvois en boutons. Jamais de HTML : le texte vient du modèle.
export function MessageText({
  text,
  citations,
  onOpen,
}: {
  text: string;
  citations: DiscussionCitation[];
  onOpen: OpenCitation;
}) {
  const byNumber = new Map(citations.map((citation) => [citation.n, citation]));
  return messageSegments(text, new Set(byNumber.keys())).map((segment, index) =>
    'text' in segment ? (
      segment.text
    ) : (
      <CitationChip
        // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte découpé une fois, jamais réordonnés
        key={index}
        citation={byNumber.get(segment.ref) as DiscussionCitation}
        onOpen={onOpen}
        className="mx-px"
      />
    ),
  );
}

export function CitationList({
  citations,
  onOpen,
  heading,
}: {
  citations: DiscussionCitation[];
  onOpen: OpenCitation;
  heading: string;
}) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-[13px] leading-[18px] font-medium text-muted-foreground">{heading}</p>
      <ol className="mt-1.5 space-y-0.5">
        {citations.map((citation) => (
          <li key={citation.n} className="flex min-h-9 items-center gap-2.5 text-[14px] leading-5">
            <span
              aria-hidden="true"
              className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[5px] bg-primary-soft px-1 text-[12px] font-medium text-primary tabular-nums"
            >
              {citation.n}
            </span>
            <button
              type="button"
              onClick={(event) => onOpen(citation, event.currentTarget)}
              className={cn(
                'min-w-0 cursor-pointer truncate py-1.5 text-left text-primary underline-offset-2 hover:underline',
                !citation.title && 'text-muted-foreground',
              )}
            >
              <span className="sr-only">Lire la source {citation.n} : </span>
              {titleOf(citation)}
            </button>
            {citation.url && (
              <a
                href={citation.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ouvrir l’original de « ${titleOf(citation)} » (nouvel onglet)`}
                className="ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ExternalLink size={15} strokeWidth={1.5} aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function UserMessage({
  content,
  seeds,
  onOpen,
}: {
  content: string;
  // Les résultats de la barre d'où part la discussion (sur sa première question seulement).
  seeds: DiscussionCitation[];
  onOpen: OpenCitation;
}) {
  return (
    <div className="ml-auto w-fit max-w-[88%] rounded-xl bg-primary-soft px-4 py-3">
      <p className="sr-only">Vous :</p>
      <p className="text-[15px] leading-6 break-words whitespace-pre-wrap text-foreground">
        {content}
      </p>
      <CitationList
        citations={seeds}
        onOpen={onOpen}
        heading={`À partir de ${seeds.length} résultat${seeds.length > 1 ? 's' : ''} de la recherche`}
      />
    </div>
  );
}

export function LeonHeading() {
  return (
    <p className="flex items-center gap-1.5 text-[13px] leading-[18px] font-medium text-primary">
      <Sparkles size={15} strokeWidth={1.5} aria-hidden="true" />
      Leon
    </p>
  );
}

export function AssistantMessage({
  content,
  citations,
  onOpen,
}: {
  content: string;
  citations: DiscussionCitation[];
  onOpen: OpenCitation;
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4 shadow-xs">
      <LeonHeading />
      <p className="mt-2 text-[15px] leading-6 break-words whitespace-pre-wrap text-foreground-2">
        <MessageText text={content} citations={citations} onOpen={onOpen} />
      </p>
      <CitationList citations={citations} onOpen={onOpen} heading="Sources citées" />
    </div>
  );
}

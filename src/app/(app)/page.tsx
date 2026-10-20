import { ArrowRight, MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PAGE } from '@/components/page-header';
import { AnswerBox } from '@/components/search/answer-box';
import { EXAMPLES, SYNTAX } from '@/components/search/examples';
import { ResultList } from '@/components/search/result-list';
import { runSearch } from '@/components/search/run-search';
import { SearchBar } from '@/components/search/search-bar';
import { SearchFilters } from '@/components/search/search-filters';
import { fromSearchParams, searchHref } from '@/components/search/url-state';
import {
  countLabel,
  pageCount,
  queryTerms,
  toResultViews,
  unknownPeopleMessage,
} from '@/components/search/view-model';
import { SourceChip } from '@/components/source-chip';
import { buttonVariants } from '@/components/ui/button';
import { formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { type DiscussionSummary, listDiscussions } from '@/server/discussion/discussions';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { type KindTally, tallyByKind } from '@/server/memory/sources';
import { parseQuery } from '@/server/search/parse-query';

export const metadata: Metadata = { title: 'Recherche' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Code({ children }: { children: string }) {
  return (
    <code className="font-mono text-[12.5px] leading-5 whitespace-nowrap text-foreground">
      {children}
    </code>
  );
}

// Une entrée en cascade au chargement : le bloc monte de 8 px et apparaît, `step` fois 70 ms après le précédent.
function rise(step: number) {
  return {
    className: 'animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out',
    style: { animationDelay: `${step * 70}ms`, animationFillMode: 'both' } as const,
  };
}

function Card({
  title,
  aside,
  children,
  className,
  step,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  step: number;
}) {
  const id = `carte-${title.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`;
  const motion = rise(step);
  return (
    <section
      aria-labelledby={id}
      className={cn('rounded-xl border bg-card shadow-xs', motion.className, className)}
      style={motion.style}
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-3">
        <h2 id={id} className="text-[15px] leading-6 font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// Ce que Leon a gardé, outil par outil, avec la part de chacun en barre : on sait où chercher avant de taper.
function MemoryLedger({ tallies, now }: { tallies: KindTally[]; now: Date }) {
  const total = tallies.reduce((sum, tally) => sum + tally.sourceCount, 0);
  const most = Math.max(1, ...tallies.map((tally) => tally.sourceCount));
  return (
    <Card
      title="Ce que Leon a gardé"
      step={2}
      className="col-span-7"
      aside={
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {formatNumber(total)} {total > 1 ? 'sources' : 'source'}
        </span>
      }
    >
      {tallies.length === 0 ? (
        <p className="px-5 pb-5 text-[14px] leading-5 text-muted-foreground">
          Rien pour l’instant : branchez un outil dans Connexions, ou installez l’extension.
        </p>
      ) : (
        <ul className="px-5 pb-2">
          {tallies.map((tally) => (
            <li
              key={tally.kind}
              className="grid grid-cols-[120px_minmax(0,1fr)_48px_96px] items-center gap-4 border-t border-border/60 py-2.5 first:border-t-0"
            >
              <SourceChip kind={tally.kind} label={tally.kindLabel} />
              <span aria-hidden="true" className="h-1.5 rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(tally.sourceCount / most) * 100}%` }}
                />
              </span>
              <span className="text-right text-[14px] font-semibold tabular-nums">
                {formatNumber(tally.sourceCount)}
              </span>
              <span className="text-right text-[12.5px] text-muted-foreground tabular-nums">
                {tally.lastTurnAt ? (
                  <time dateTime={tally.lastTurnAt.toISOString()}>
                    {formatRelative(tally.lastTurnAt, now)}
                  </time>
                ) : (
                  '—'
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t px-5 py-3">
        <Link
          href="/sources"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
        >
          Voir toutes les sources
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

function RecentDiscussions({ discussions, now }: { discussions: DiscussionSummary[]; now: Date }) {
  return (
    <Card
      title="Discussions récentes"
      step={3}
      className="flex flex-col"
      aside={
        <Link href="/discussions" className="text-[13px] font-medium text-primary hover:underline">
          Nouvelle
        </Link>
      }
    >
      {discussions.length === 0 ? (
        <p className="px-5 pb-5 text-[14px] leading-5 text-muted-foreground">
          Aucune discussion. Posez une question à Leon : il répond en citant ses sources.
        </p>
      ) : (
        <ul className="flex-1 px-2 pb-2">
          {discussions.map((discussion) => (
            <li key={discussion.id}>
              <Link
                href={`/discussions/${discussion.id}`}
                className="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted"
              >
                <MessagesSquare
                  size={15}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate text-[14px] leading-5">
                  {discussion.title}
                </span>
                <time
                  dateTime={discussion.updatedAt.toISOString()}
                  className="shrink-0 text-[12.5px] text-muted-foreground tabular-nums"
                >
                  {formatRelative(discussion.updatedAt, now)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SyntaxHelp() {
  return (
    <Card title="Pour affiner, écrivez-le dans la barre" step={4}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 pb-5">
        {SYNTAX.map((item) => (
          <div key={item.code} className="min-w-0">
            <dt>
              <Code>{item.code}</Code>
            </dt>
            <dd className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{item.text}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

// L'accueil avant toute recherche : la question posée en grand, la barre, des recherches à essayer, puis ce que
// la mémoire contient et les discussions en cours.
function Home({
  firstName,
  organizationName,
  tallies,
  discussions,
  now,
}: {
  firstName: string;
  organizationName: string;
  tallies: KindTally[];
  discussions: DiscussionSummary[];
  now: Date;
}) {
  const greeting = rise(0);
  const bar = rise(1);
  return (
    <>
      {/* Un lavis d'indigo derrière la question : la seule atmosphère de l'application, ici seulement. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgb(79_70_200/0.07),transparent_70%)]"
      />
      <div className="relative mx-auto max-w-[860px] pt-10 text-center">
        <div className={greeting.className} style={greeting.style}>
          <h1 className="font-heading text-[52px] leading-[56px] tracking-[-0.015em]">
            Bonjour {firstName}.
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
            Que cherchez-vous dans la mémoire{' '}
            {/^[aeiouyhàâéèêîôû]/i.test(organizationName) ? 'd’' : 'de '}
            {organizationName} ?
          </p>
        </div>
        <div className={cn('mt-8 text-left', bar.className)} style={bar.style}>
          <SearchBar initialQuery="" autoFocus />
          <ul
            className="mt-4 flex flex-wrap justify-center gap-2"
            aria-label="Recherches à essayer"
          >
            {EXAMPLES.map((example) => (
              <li key={example.q}>
                <Link
                  href={searchHref({ q: example.q })}
                  title={example.hint}
                  className="inline-flex h-8 items-center rounded-full border bg-card px-2.5 shadow-xs transition-colors hover:border-primary/40 hover:bg-primary-soft"
                >
                  <Code>{example.q}</Code>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="relative mt-14 grid grid-cols-12 items-start gap-5">
        <MemoryLedger tallies={tallies} now={now} />
        <div className="col-span-5 flex flex-col gap-5">
          <RecentDiscussions discussions={discussions} now={now} />
          <SyntaxHelp />
        </div>
      </div>
    </>
  );
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUserContext();
  const { q, page } = fromSearchParams(await searchParams);
  const searching = q.trim() !== '';
  const now = new Date();
  const found = searching ? await runSearch(ctx, q, page) : null;
  const [tallies, profile, discussions] = searching
    ? [null, null, []]
    : await Promise.all([
        tallyByKind(ctx),
        getViewerProfile(ctx),
        listDiscussions(ctx).then((all) => all.slice(0, 5)),
      ]);
  const pages = found ? pageCount(found.totalSources) : 1;
  const unknownPeople = found ? unknownPeopleMessage(found.unknownPeople) : null;
  // La réponse en tête porte sur la première page, et seulement quand un modèle est branché : sans lui,
  // l'encadré n'apparaît pas et la recherche marche quand même.
  const answer = found !== null && found.hits.length > 0 && page === 1 && getLlm(env) !== null;

  return (
    <div className={cn('@container relative', PAGE)}>
      {searching ? (
        <>
          <h1 className="sr-only">Recherche</h1>
          <SearchBar initialQuery={q} autoFocus={false} />
        </>
      ) : (
        <Home
          firstName={profile?.userName.split(' ')[0] ?? ''}
          organizationName={profile?.organizationName ?? ''}
          tallies={tallies ?? []}
          discussions={discussions}
          now={now}
        />
      )}

      {searching && (
        <div className="mt-5 space-y-5">
          {/* Le fieldset des filtres annule sa marge (m-0) : ce bloc garde l'écart de space-y-5 avec la suite. */}
          <div>
            <SearchFilters q={q} now={now} />
          </div>
          {/* Avant les résultats, sans les retarder : l'encadré lit la réponse une fois la page affichée. */}
          {answer && (
            <AnswerBox
              key={q}
              query={q}
              results={found.hits.map((hit) => ({ sourceId: hit.sourceId, title: hit.title }))}
            />
          )}
          {unknownPeople && (
            <p
              role="status"
              className="rounded-lg bg-warning-soft px-4 py-2.5 text-[15px] text-warning"
            >
              {unknownPeople}
            </p>
          )}
          {found === null && (
            <div role="alert" className="rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
              La recherche n’a pas abouti. Réessayez dans un instant ; si cela persiste, regardez la
              page Sources.
            </div>
          )}
          {found && found.hits.length === 0 && page === 1 && (
            <EmptyState
              reason="Aucun résultat."
              nextStep="Essayez d’autres mots, retirez un filtre, ou cherchez le titre d’un document."
            />
          )}
          {found && found.hits.length === 0 && page > 1 && (
            <EmptyState
              reason="Il n’y a pas autant de résultats."
              nextStep="Cette page est vide : les résultats s’arrêtent avant."
            >
              <Link
                href={searchHref({ q })}
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'h-9 rounded-lg px-3 text-[15px]',
                )}
              >
                Revenir à la première page
              </Link>
            </EmptyState>
          )}
          {found && found.hits.length > 0 && (
            <>
              <p role="status" className="text-[14px] leading-5 text-muted-foreground">
                {countLabel(found.totalSources)}
              </p>
              <ResultList
                key={`${q}\u0000${page}`}
                results={toResultViews(found.hits)}
                terms={queryTerms(parseQuery(q, now).text)}
                pagination={{
                  page,
                  pages,
                  previousHref: page > 1 ? searchHref({ q, page: page - 1 }) : null,
                  nextHref: page < pages ? searchHref({ q, page: page + 1 }) : null,
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { PAGE, PageHeader } from '@/components/page-header';
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
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { type KindTally, tallyByKind } from '@/server/memory/sources';
import { parseQuery } from '@/server/search/parse-query';

export const metadata: Metadata = { title: 'Recherche' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Code({ children }: { children: string }) {
  return (
    <code className="font-mono text-[13px] leading-5 whitespace-nowrap text-foreground">
      {children}
    </code>
  );
}

function Welcome() {
  return (
    <div className="mt-10 space-y-10">
      <section aria-labelledby="exemples">
        <h2 id="exemples" className="text-[16px] leading-6 font-medium">
          Quelques recherches pour commencer
        </h2>
        <ul className="mt-2">
          {EXAMPLES.map((example) => (
            <li key={example.q} className="border-b border-border/70 last:border-b-0">
              <Link
                href={searchHref({ q: example.q })}
                className="-mx-2 grid min-h-11 grid-cols-[minmax(0,15rem)_1fr] items-center gap-4 rounded-md px-2 py-2 transition-colors hover:bg-muted"
              >
                <Code>{example.q}</Code>
                <span className="text-[14px] leading-5 text-muted-foreground">{example.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="filtres">
        <h2 id="filtres" className="text-[16px] leading-6 font-medium">
          Pour affiner, écrivez-le dans la barre
        </h2>
        <dl className="mt-3 grid grid-cols-[minmax(0,15rem)_1fr] gap-x-4 gap-y-2.5 text-[14px] leading-5">
          {SYNTAX.map((item) => (
            <div key={item.code} className="contents">
              <dt>
                <Code>{item.code}</Code>
              </dt>
              <dd className="text-muted-foreground">{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

// Ce que Leon a gardé, outil par outil : on sait où chercher avant de taper.
function MemoryLedger({ tallies, now }: { tallies: KindTally[]; now: Date }) {
  const total = tallies.reduce((sum, tally) => sum + tally.sourceCount, 0);
  return (
    <section aria-labelledby="memoire" className="rounded-lg border bg-card">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-2">
        <h2 id="memoire" className="text-[16px] leading-6 font-medium">
          Ce que Leon a gardé
        </h2>
        <Link href="/sources" className="text-[13px] text-muted-foreground hover:text-foreground">
          Voir les sources
        </Link>
      </div>
      {tallies.length === 0 ? (
        <p className="px-5 pb-5 text-[14px] leading-5 text-muted-foreground">
          Rien pour l’instant : branchez un outil dans Connexions, ou installez l’extension.
        </p>
      ) : (
        <>
          <table className="w-full text-[14px] leading-5">
            <thead className="sr-only">
              <tr>
                <th scope="col">Outil</th>
                <th scope="col">Sources</th>
                <th scope="col">Plus récente</th>
              </tr>
            </thead>
            <tbody>
              {tallies.map((tally) => (
                <tr key={tally.kind} className="border-t border-border/70">
                  <td className="py-2.5 pl-5">
                    <SourceChip kind={tally.kind} label={tally.kindLabel} />
                  </td>
                  <td className="py-2.5 text-right font-medium tabular-nums">
                    {formatNumber(tally.sourceCount)}
                  </td>
                  <td className="py-2.5 pr-5 pl-4 text-right text-[13px] text-muted-foreground tabular-nums">
                    {tally.lastTurnAt ? (
                      <time dateTime={tally.lastTurnAt.toISOString()}>
                        {formatRelative(tally.lastTurnAt, now)}
                      </time>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="flex justify-between border-t px-5 py-3 text-[14px] leading-5">
            <span className="text-muted-foreground">Au total</span>
            <span className="tabular-nums">
              {formatNumber(total)} {total > 1 ? 'sources' : 'source'}
            </span>
          </p>
        </>
      )}
    </section>
  );
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUserContext();
  const { q, page } = fromSearchParams(await searchParams);
  const searching = q.trim() !== '';
  const now = new Date();
  const found = searching ? await runSearch(ctx, q, page) : null;
  const tallies = searching ? null : await tallyByKind(ctx);
  const pages = found ? pageCount(found.totalSources) : 1;
  const unknownPeople = found ? unknownPeopleMessage(found.unknownPeople) : null;
  // La réponse en tête porte sur la première page, et seulement quand un modèle est branché : sans lui,
  // l'encadré n'apparaît pas et la recherche marche quand même.
  const answer = found !== null && found.hits.length > 0 && page === 1 && getLlm(env) !== null;

  return (
    <div className={cn('@container', PAGE)}>
      {searching ? (
        <>
          <h1 className="sr-only">Recherche</h1>
          <SearchBar initialQuery={q} autoFocus={false} />
        </>
      ) : (
        <>
          <PageHeader
            title="Recherche"
            description="Retrouver une information dans tout ce que Leon a gardé."
          />
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)_360px] items-start gap-10">
            <div className="min-w-0">
              <SearchBar initialQuery={q} autoFocus />
              <Welcome />
            </div>
            <MemoryLedger tallies={tallies ?? []} now={now} />
          </div>
        </>
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

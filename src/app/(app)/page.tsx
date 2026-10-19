import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
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
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { requireUserContext } from '@/server/auth/session';
import { parseQuery } from '@/server/search/parse-query';

export const metadata: Metadata = { title: 'Recherche' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Des recherches à essayer, qui montrent la syntaxe des filtres sans supposer un nom ni un outil branché.
const EXAMPLES = [
  { q: 'outil:github type:ticket', hint: 'Les tickets GitHub, les plus récents d’abord' },
  { q: 'type:réunion depuis:7j', hint: 'Les réunions de la semaine' },
  { q: '"renouvellement du contrat"', hint: 'Les mots exacts d’une phrase' },
  { q: 'budget depuis:3m', hint: 'Un sujet, sur les trois derniers mois' },
];

const SYNTAX = [
  { code: 'de:julie', text: 'ce qu’une personne a écrit (son nom ou son e-mail)' },
  { code: 'outil:github', text: 'un seul outil' },
  {
    code: 'type:réunion',
    text: 'une sorte de source : ticket, page, mail, fichier, conversation…',
  },
  { code: 'depuis:7j', text: 'les 7 derniers jours (j), semaines (s) ou mois (m)' },
  { code: 'avant:2026-10-01', text: 'avant une date' },
  { code: '"phrase exacte"', text: 'les mots tels quels, dans cet ordre' },
];

function Code({ children }: { children: string }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] leading-5 whitespace-nowrap text-foreground">
      {children}
    </code>
  );
}

function Welcome() {
  return (
    <div className="mt-10 space-y-10">
      <section aria-labelledby="exemples" className="space-y-3">
        <h2 id="exemples" className="text-[15px] font-medium">
          Quelques recherches pour commencer
        </h2>
        <ul className="grid gap-3 @[640px]:grid-cols-2">
          {EXAMPLES.map((example) => (
            <li key={example.q}>
              <Link
                href={searchHref({ q: example.q })}
                className="block rounded-xl border bg-card px-4 py-3.5 transition-colors hover:bg-muted"
              >
                <Code>{example.q}</Code>
                <span className="mt-2 block text-[14px] leading-5 text-muted-foreground">
                  {example.hint}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="filtres" className="space-y-3">
        <h2 id="filtres" className="text-[15px] font-medium">
          Pour affiner, écrivez-le dans la barre
        </h2>
        <dl className="grid gap-x-6 gap-y-2.5 text-[15px] leading-6 @[640px]:grid-cols-[max-content_1fr]">
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

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUserContext();
  const { q, page } = fromSearchParams(await searchParams);
  const searching = q.trim() !== '';
  const now = new Date();
  const found = searching ? await runSearch(ctx, q, page) : null;
  const pages = found ? pageCount(found.totalSources) : 1;
  const unknownPeople = found ? unknownPeopleMessage(found.unknownPeople) : null;

  return (
    <div className="@container mx-auto w-full max-w-[1180px] px-10 pt-14 pb-28 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <header className={searching ? 'sr-only' : 'mb-8 border-b pb-7'}>
        <h1 className="text-[36px] leading-[44px] font-semibold tracking-[-0.02em]">Recherche</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Retrouver une information dans tout ce que Leon a gardé.
        </p>
      </header>

      <SearchBar initialQuery={q} autoFocus={!searching} />

      {!searching && <Welcome />}

      {searching && (
        <div className="mt-5 space-y-5">
          <SearchFilters q={q} now={now} />
          {/* La réponse de l'agent se pose ici, avant les résultats, sans les retarder (encadré de la tâche T10). */}
          <div aria-live="polite" data-reponse-en-tete="" />
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

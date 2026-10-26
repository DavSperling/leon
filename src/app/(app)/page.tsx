import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { runSearch } from '@/components/search/run-search';
import { SearchFilters } from '@/components/search/search-filters';
import { fromSearchParams } from '@/components/search/url-state';
import {
  countLabel,
  pageCount,
  queryTerms,
  toResultViews,
  unknownPeopleMessage,
} from '@/components/search/view-model';
import { SearchBar } from '@/components/verre/recherche/search-bar';
import { SearchResults } from '@/components/verre/recherche/search-results';
import { Welcome } from '@/components/verre/recherche/welcome';
import { PageHeader } from '@/components/verre/ui/layout';
import { requireUserContext } from '@/server/auth/session';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { parseQuery } from '@/server/search/parse-query';

export async function generateMetadata(): Promise<Metadata> {
  return { title: await (await getTranslations('search'))('title') };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('search');
  const locale = await getLocale();
  const ctx = await requireUserContext();
  const { q, page } = fromSearchParams(await searchParams);
  const searching = q.trim() !== '';
  const now = new Date();
  const found = searching ? await runSearch(ctx, q, page) : null;
  const pages = found ? pageCount(found.totalSources) : 1;
  const unknownPeople = found ? unknownPeopleMessage(found.unknownPeople, locale) : null;
  // La réponse en tête porte sur la première page, et seulement quand un modèle est branché : sans lui,
  // la carte n'apparaît pas et la recherche marche quand même.
  const answer = found !== null && found.hits.length > 0 && page === 1 && getLlm(env) !== null;

  return (
    <>
      {searching ? (
        <h1 className="sr-only">{t('title')}</h1>
      ) : (
        <PageHeader title={t('title')} subtitle={t('homeSubtitle')} className="mb-7" />
      )}

      <SearchBar query={q} home={!searching} />

      {searching ? (
        <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)] gap-5">
          <SearchFilters q={q} now={now} />
          <SearchResults
            // Une autre recherche, une autre page : l'aperçu et les éclairages repartent de zéro.
            key={`${q}\u0000${page}`}
            q={q}
            page={page}
            pages={pages}
            results={found ? toResultViews(found.hits, locale) : []}
            terms={queryTerms(parseQuery(q, now).text)}
            count={found ? countLabel(found.totalSources, locale) : ''}
            unknownPeople={unknownPeople}
            failed={found === null}
            answer={answer}
          />
        </div>
      ) : (
        <Welcome />
      )}
    </>
  );
}

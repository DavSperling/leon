import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { askSuggestions } from '@/components/discussion/ask-suggestions';
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
import { Button, Section } from '@/components/verre';
import { AboutSuggestionCard } from '@/components/verre/discussions/about-suggestion-card';
import { AskTiles } from '@/components/verre/discussions/ask-tiles';
import { BriefingSheet, Greeting, HomeAsk } from '@/components/verre/recherche/home';
import { SearchBar } from '@/components/verre/recherche/search-bar';
import { SearchResults } from '@/components/verre/recherche/search-results';
import { SearchSyntax } from '@/components/verre/recherche/welcome';
import { briefingFact } from '@/lib/briefing-view';
import { dayPart } from '@/lib/day-part';
import { cn } from '@/lib/verre/cn';
import { formatDateTime, formatRelative } from '@/lib/verre/format';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { getViewerProfile } from '@/server/auth/viewer';
import { ABOUT_MAX_CHARS } from '@/server/briefing/about';
import { readAboutSuggestion } from '@/server/briefing/about-suggestion';
import { homeBriefing } from '@/server/discussion/citation-sources';
import { listDiscussions } from '@/server/discussion/discussions';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { logError } from '@/server/log';
import { parseQuery } from '@/server/search/parse-query';
import { SHELL_RECENTS } from '@/server/shell/shell';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { q } = fromSearchParams(await searchParams);
  if (q.trim() !== '') return { title: await (await getTranslations('search'))('title') };
  return { title: await (await getTranslations('welcome'))('title') };
}

// `/` : l'Accueil ; `/?q=` : les résultats d'une recherche (avec ses filtres, ses pages, et la réponse de Leon quand un
// modèle est branché ; sans modèle, la recherche marche quand même).
export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireUserContext();
  const { q, page } = fromSearchParams(await searchParams);
  if (q.trim() === '') return <Home ctx={ctx} />;

  const t = await getTranslations('search');
  const locale = await getLocale();
  const now = new Date();
  const found = await runSearch(ctx, q, page);
  const pages = found ? pageCount(found.totalSources) : 1;
  const unknownPeople = found ? unknownPeopleMessage(found.unknownPeople, locale) : null;
  // La réponse en tête porte sur la première page, et seulement quand un modèle est branché.
  const answer = found !== null && found.hits.length > 0 && page === 1 && getLlm(env) !== null;

  return (
    <div className="w-full">
      <h1 className="sr-only">{t('title')}</h1>
      {/* La barre où l'on demande, à la place qu'elle a sur tous les écrans, et ses filtres dessous, à sa largeur. */}
      <div className="mx-auto w-[min(720px,100%)] shell:-mt-3">
        <SearchBar query={q} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <SearchFilters q={q} now={now} />
          </div>
          <SearchSyntax />
        </div>
      </div>
      <div className="mt-8">
        <SearchResults
          // Une autre recherche, une autre page : le panneau et la réponse repartent de zéro.
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
    </div>
  );
}

// Une partie facultative de l'Accueil : sa panne ne prive pas du reste (elle est notée).
const optional = <T,>(what: string, read: Promise<T>) =>
  read.catch((error) => {
    logError(what, error);
    return null;
  });

/**
 * L'Accueil : le bonjour et le fait du jour, le champ où l'on demande et ses questions à essayer, puis le point du
 * matin (s'il y en a un) et, à côté, la proposition « About you » et les discussions récentes.
 */
async function Home({ ctx }: { ctx: TenantContext }) {
  const t = await getTranslations('welcome');
  const shell = await getTranslations('shell');
  const locale = await getLocale();
  const modelAvailable = getLlm(env) !== null;
  const [profile, member, suggestion, briefing, discussions] = await Promise.all([
    optional('accueil.profil', getViewerProfile(ctx)),
    readOnboardingMember(ctx),
    optional('apropos.lecture', readAboutSuggestion(ctx)),
    optional('accueil.point', homeBriefing(ctx)),
    optional('accueil.recentes', listDiscussions(ctx)),
  ]);
  const questions = modelAvailable ? await askSuggestions(member) : [];
  const name = profile?.userName?.trim().split(/\s+/)[0] || null;
  const now = new Date();
  const sources = briefing?.sources.map(({ sourceId: _id, ...source }) => source);
  const recents = (discussions ?? []).slice(0, SHELL_RECENTS);
  const aside = recents.length > 0 || Boolean(suggestion);

  return (
    // group/home : le fait du jour et sa ligne dans le point se répondent quand on pointe l'un (home.tsx)
    <div className="group/home @container w-full shell:pt-5">
      <Greeting
        name={name}
        serverPart={dayPart(now.getHours())}
        fact={briefing && briefingFact(briefing.sections)}
        sources={sources}
      />
      <HomeAsk canAsk={modelAvailable} />
      {questions.length > 0 && (
        <div className="mt-3">
          <AskTiles questions={questions} />
        </div>
      )}

      {/* Le point du matin est la feuille de l'écran ; à sa droite, sur le bureau, les discussions récentes. Sans point,
          ou à l'étroit, elles passent dans la colonne de lecture. */}
      <div
        className={cn(
          'mt-9 grid grid-cols-[minmax(0,1fr)] items-start gap-x-12 gap-y-10',
          briefing && aside && '@[55rem]:grid-cols-[minmax(0,1fr)_clamp(300px,30cqi,380px)]',
        )}
      >
        {briefing && (
          <Section
            id="point"
            title={t('briefing.title')}
            actions={
              <time dateTime={briefing.preparedAt.toISOString()} className="text-label text-muted">
                {formatDateTime(briefing.preparedAt, locale)}
              </time>
            }
            className="mt-0"
          >
            <BriefingSheet sections={briefing.sections} sources={sources ?? []} />
          </Section>
        )}

        {aside && (
          <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-8', !briefing && 'max-w-[772px]')}>
            {recents.length > 0 && (
              <Section
                id="recentes"
                title={shell('recent')}
                actions={
                  <Button asChild variant="link">
                    <Link href="/discussions">{shell('newDiscussion')}</Link>
                  </Button>
                }
                className="mt-0"
              >
                {/* sur le bureau : une ligne par discussion, qui l'ouvre ; un filet entre deux */}
                <ul>
                  {recents.map((discussion) => (
                    <li key={discussion.id} className="border-line-strong [&+&]:border-t">
                      <Link
                        href={`/discussions/${discussion.id}`}
                        className="-mx-3 flex min-h-11 items-center gap-4 rounded-item px-3 py-2 text-ui transition-colors duration-150 hover:bg-hover active:bg-n-150"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-fg">
                          {discussion.title}
                        </span>
                        <time
                          dateTime={discussion.updatedAt.toISOString()}
                          // « hier » commence la colonne comme une date : par une majuscule
                          className="inline-block shrink-0 text-label text-muted first-letter:uppercase"
                        >
                          {formatRelative(discussion.updatedAt, now, locale)}
                        </time>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {suggestion && (
              <AboutSuggestionCard
                text={suggestion.text}
                kinds={suggestion.kinds}
                max={ABOUT_MAX_CHARS}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

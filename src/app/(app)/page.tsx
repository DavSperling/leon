import type { Metadata } from 'next';
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
import { Section } from '@/components/verre';
import { AboutSuggestionCard } from '@/components/verre/discussions/about-suggestion-card';
import { AskTiles } from '@/components/verre/discussions/ask-tiles';
import { BriefingSheet, Greeting } from '@/components/verre/recherche/home';
import { SearchBar } from '@/components/verre/recherche/search-bar';
import { SearchResults } from '@/components/verre/recherche/search-results';
import { SearchSyntax } from '@/components/verre/recherche/welcome';
import { dayPart } from '@/lib/day-part';
import { cn } from '@/lib/verre/cn';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { getViewerProfile } from '@/server/auth/viewer';
import { ABOUT_MAX_CHARS } from '@/server/briefing/about';
import { readAboutSuggestion } from '@/server/briefing/about-suggestion';
import { homeBriefing } from '@/server/discussion/citation-sources';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { logError } from '@/server/log';
import { parseQuery } from '@/server/search/parse-query';

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

/** L'Accueil : le bonjour, la proposition « About you », le point du matin (s'il y en a un), les questions à essayer. */
async function Home({ ctx }: { ctx: TenantContext }) {
  const t = await getTranslations('welcome');
  const modelAvailable = getLlm(env) !== null;
  const [profile, member, suggestion, briefing] = await Promise.all([
    optional('accueil.profil', getViewerProfile(ctx)),
    readOnboardingMember(ctx),
    optional('apropos.lecture', readAboutSuggestion(ctx)),
    optional('accueil.point', homeBriefing(ctx)),
  ]);
  const questions = modelAvailable ? await askSuggestions(member) : [];
  const name = profile?.userName?.trim().split(/\s+/)[0] || null;

  const aside = questions.length > 0 || Boolean(suggestion);

  return (
    <div className="@container w-full">
      <Greeting name={name} serverPart={dayPart(new Date().getHours())} />

      {/* Le point du matin est le document de l'écran ; à sa droite, en colonne, ce qu'on peut demander et ce que Leon
          propose. Sans point, ou à l'étroit, la colonne redevient une rangée sous le bonjour. */}
      <div
        className={cn(
          'mt-7 grid grid-cols-[minmax(0,1fr)] items-start gap-x-8 gap-y-10',
          briefing && aside && '@[60rem]:grid-cols-[minmax(0,1fr)_340px]',
        )}
      >
        {briefing && (
          <Section id="point" title={t('briefing.title')} className="mt-0">
            <BriefingSheet
              sections={briefing.sections}
              sources={briefing.sources.map(({ sourceId: _id, ...source }) => source)}
            />
          </Section>
        )}

        {aside && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            {questions.length > 0 && (
              <Section id="essayer" title={t('tryAsking')} className="mt-0">
                <AskTiles questions={questions} />
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

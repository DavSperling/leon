import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { CODE_SESSION_KINDS, repoOf } from '@/capture/turn';
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
import { DraftQuestionsCard } from '@/components/verre/recherche/draft-questions-card';
import { BriefingSheet, Greeting, HomeAsk } from '@/components/verre/recherche/home';
import { SearchBar } from '@/components/verre/recherche/search-bar';
import { SearchResults } from '@/components/verre/recherche/search-results';
import { WeekCalendar } from '@/components/verre/recherche/week-calendar';
import { SearchSyntax } from '@/components/verre/recherche/welcome';
import { parisTime } from '@/lib/agenda';
import { briefingFact } from '@/lib/briefing-view';
import { dayPart } from '@/lib/day-part';
import { cn } from '@/lib/verre/cn';
import { formatDateTime } from '@/lib/verre/format';
import { agendaIsStale, readWeek } from '@/server/agenda/agenda';
import { readOnboardingMember } from '@/server/auth/onboarding';
import { requireUserContext } from '@/server/auth/session';
import type { TenantContext } from '@/server/auth/tenant-context';
import { getViewerProfile } from '@/server/auth/viewer';
import { ABOUT_MAX_CHARS } from '@/server/briefing/about';
import { readAboutSuggestion } from '@/server/briefing/about-suggestion';
import { refreshShownBriefing } from '@/server/briefing/briefings';
import { enqueueAgendaRefresh } from '@/server/briefing/queue';
import { type HomeBriefing, homeBriefings } from '@/server/discussion/citation-sources';
import { env } from '@/server/env';
import { getLlm } from '@/server/llm/get-llm';
import { logError } from '@/server/log';
import { REPONSE_MAX_CHARS } from '@/server/portrait/brouillon-prompt';
import { readHomeDemandes } from '@/server/portrait/screen';
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

// Le nom du dossier d'un point : son dépôt, ou le titre de sa session de code la plus récente (un dossier sans dépôt
// n'a qu'une clé chiffrée). Les sources d'un point viennent dans l'ordre de ses numéros, les sessions d'abord.
function pointLabel(point: HomeBriefing): string | null {
  const repo = repoOf(point.project);
  if (repo) return repo.split('/')[1] ?? repo;
  const kinds: readonly string[] = CODE_SESSION_KINDS;
  return point.sources.find((source) => kinds.includes(source.kind))?.title ?? null;
}

// Une partie facultative de l'Accueil : sa panne ne prive pas du reste (elle est notée).
const optional = <T,>(what: string, read: Promise<T>) =>
  read.catch((error) => {
    logError(what, error);
    return null;
  });

/**
 * L'Accueil : le bonjour et le fait du jour, les demandes de Leon quand il a besoin d'elle pour répondre à un mail, le
 * champ où l'on demande et ses questions à essayer, puis le point du matin (s'il y en a un) et, à côté, le calendrier
 * de la semaine et la proposition « About you ».
 */
async function Home({ ctx }: { ctx: TenantContext }) {
  const t = await getTranslations('welcome');
  const locale = await getLocale();
  const modelAvailable = getLlm(env) !== null;
  const [profile, member, suggestion, points, week, demandes] = await Promise.all([
    optional('accueil.profil', getViewerProfile(ctx)),
    readOnboardingMember(ctx),
    optional('apropos.lecture', readAboutSuggestion(ctx)),
    optional('accueil.point', homeBriefings(ctx)),
    optional('accueil.semaine', readWeek(ctx)),
    optional('accueil.demandes', readHomeDemandes(ctx)),
  ]);
  const [questions] = await Promise.all([
    modelAvailable ? askSuggestions(member) : [],
    // un point montré a vieilli : il sera à jour à la prochaine visite (le plafond du jour borne la dépense)
    ...(modelAvailable ? (points ?? []) : [])
      .filter((point) => point.stale)
      .map((point) => refreshShownBriefing(ctx, point.project, point.preparedAt)),
    // les rendez-vous des e-mails ont vieilli : relus en arrière-plan, sans appel au modèle s'il n'y a rien de neuf
    week && modelAvailable && agendaIsStale(week.preparedAt)
      ? optional(
          'accueil.semaine_file',
          enqueueAgendaRefresh({ tenantId: ctx.tenantId, userId: ctx.userId }),
        )
      : null,
  ]);
  const name = profile?.userName?.trim().split(/\s+/)[0] || null;
  const now = new Date();
  // toutes ses lignes retirées (ou « Supprimer ») : le point n'est pas montré, mais son recalcul suit son projet
  const shown = (points ?? []).filter((point) => point.sections.length > 0);
  const first = shown[0] ?? null;
  const viewOf = (point: HomeBriefing) =>
    point.sources.map(({ sourceId: _id, ...source }) => source);
  const aside = Boolean(week) || Boolean(suggestion);

  return (
    // group/home : le fait du jour et sa ligne dans le point se répondent quand on pointe l'un (home.tsx)
    <div className="group/home @container w-full shell:pt-5">
      <Greeting
        name={name}
        serverPart={dayPart(now.getHours())}
        fact={first && briefingFact(first.sections)}
        sources={first ? viewOf(first) : undefined}
      />
      {/* Leon a besoin d'elle : dit tout de suite, sous le bonjour, avant tout le reste. */}
      {demandes && demandes.length > 0 && (
        <DraftQuestionsCard demandes={demandes} max={REPONSE_MAX_CHARS} />
      )}
      <HomeAsk canAsk={modelAvailable} />
      {questions.length > 0 && (
        <div className="mt-3">
          <AskTiles questions={questions} />
        </div>
      )}

      {/* Le point du matin est la feuille de l'écran ; à sa droite, sur le bureau, le calendrier de la semaine. Sans
          point, ou à l'étroit, il passe dans la colonne de lecture. */}
      <div
        className={cn(
          'mt-9 grid grid-cols-[minmax(0,1fr)] items-start gap-x-12 gap-y-10',
          first && aside && '@[55rem]:grid-cols-[minmax(0,1fr)_clamp(300px,30cqi,380px)]',
        )}
      >
        {first && (
          <Section id="point" title={t('briefing.title')} className="mt-0">
            <div className="grid gap-6">
              {shown.map((point) => (
                <BriefingSheet
                  // un autre point (refait, autre projet) : les lignes retirées sur la page repartent de zéro
                  key={`${point.project}\u0000${point.preparedAt.toISOString()}`}
                  project={point.project}
                  heading={
                    <>
                      {/* un seul point : pas besoin de dire de quel dossier il parle */}
                      {shown.length > 1 && (
                        <span className="truncate font-semibold text-fg">
                          {pointLabel(point) ?? t('briefing.folder')}
                        </span>
                      )}
                      <time dateTime={point.preparedAt.toISOString()} className="shrink-0">
                        {formatDateTime(point.preparedAt, locale)}
                      </time>
                    </>
                  }
                  sections={point.sections}
                  sources={viewOf(point)}
                  canRedo={modelAvailable}
                />
              ))}
            </div>
          </Section>
        )}

        {aside && (
          <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-8', !first && 'max-w-[772px]')}>
            {week && (
              <WeekCalendar days={week.days} rendezVous={week.rendezVous} now={parisTime(now)} />
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

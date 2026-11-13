import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { type Situation, type Team, TOOL_COUNT, toolLabel, useSiteContent } from '../content';
import { DemoScene } from '../demo-card';
import {
  ArrowLink,
  CtaBand,
  CtaLink,
  isFilterQuery,
  order,
  QueryCode,
  SectionHeading,
  ToolLogo,
  tone,
} from '../parts';
import { TeamTabs } from '../team-tabs';
import { FactList, PageHero } from './page-hero';
import { QuestionReel } from './question-reel';

// Cas d'usage : le hub (les six équipes, des situations, les onglets, toutes les questions) et la page de chaque équipe.

function TeamCard({ team, index }: { team: Team; index: number }) {
  return (
    <li style={order(index)} className="pg-land">
      <Link
        href={`/cas-usage/${team.slug}`}
        className="group s-sheet pg-lift flex h-full flex-col px-6 py-5"
      >
        <span className="flex items-center justify-between gap-4">
          <span className="s-h3">{team.label}</span>
          <ArrowRight
            aria-hidden="true"
            strokeWidth={1.8}
            className="size-4 text-muted transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </span>
        <span className="s-body mt-1.5 text-muted">{nb(team.pitch)}</span>
        <span className="mt-auto flex gap-3 pt-6">
          {team.tools.slice(0, 4).map((id) => (
            <ToolLogo key={id} id={id} size={22} />
          ))}
        </span>
      </Link>
    </li>
  );
}

/** Une situation, sur toute la largeur : à gauche ce qu'on demande (le moment, puis la question dans le champ où l'on
 *  demande), à droite ce qui revient (ce que Leon fait, ce que ça change, et ses sources numérotées dans leur couleur).
 *  Au défilement la question s'écrit, puis les numéros sortent un à un (motion/pages.ts, geste « case »). */
function SituationItem({ s }: { s: Situation }) {
  const t = useTranslations('site.useCases');
  return (
    <li data-pm="case" className="pg-sit">
      <article className="s-grid gap-y-6">
        <div className="pg-sit__ask">
          <h3 className="s-h3">{nb(s.title)}</h3>
          <p className="s-small mt-1">
            {nb(s.moment)} · {nb(s.who)}
          </p>
          <p className="group pg-ask">
            <span aria-hidden="true" className="strokes">
              <i />
              <i />
              <i />
            </span>
            <span className="min-w-0">
              {isFilterQuery(s.question) ? <QueryCode q={s.question} /> : nb(s.question)}
            </span>
          </p>
        </div>
        <div className="pg-sit__back">
          <p className="s-body">{nb(s.does)}</p>
          <p className="s-body mt-3">
            <span className="font-semibold">{t('changes')}</span>
            {nb(s.gain)}
          </p>
          <ul className="pg-srcs">
            {s.tools.map((id, i) => (
              <li key={id} title={toolLabel(id)}>
                <span aria-hidden="true" className={cn('num', tone(i + 1))}>
                  {i + 1}
                </span>
                <ToolLogo id={id} size={22} />
                <span className="sr-only">{toolLabel(id)}</span>
              </li>
            ))}
            {s.alsoReads && <li className="s-small">{nb(s.alsoReads)}</li>}
          </ul>
        </div>
      </article>
    </li>
  );
}

function SituationsSection({ situations, lead }: { situations: Situation[]; lead: string }) {
  const t = useTranslations('site.useCases');
  return (
    <section aria-labelledby="situations-titre" className="s-sec">
      <div className="s-wrap">
        <SectionHeading id="situations-titre" title={t('situationsTitle')} lead={lead} />
        <ul className="pg-sits mt-12">
          {situations.map((s) => (
            <SituationItem key={s.id} s={s} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Les questions de toutes les équipes, mêlées, une par une. */
const allQuestions = (teams: Team[]) =>
  teams
    .flatMap((t, ti) => t.questions.map((q, qi) => ({ q, team: t, order: qi * teams.length + ti })))
    .sort((a, b) => a.order - b.order)
    .filter((x, i, arr) => arr.findIndex((y) => y.q === x.q) === i);

export function CasUsagePage() {
  const t = useTranslations('site.useCases');
  const cta = useTranslations('site.cta');
  const { teams, situations } = useSiteContent();
  return (
    <div className="s-page">
      <PageHero
        title={t('heroTitle')}
        accent={t('heroAccent')}
        tone={4}
        lead={t('heroLead')}
        actions={
          <>
            <CtaLink href="/inscription">{cta('create')}</CtaLink>
            <CtaLink href="/produit" variant="secondary">
              {cta('howItWorks')}
            </CtaLink>
          </>
        }
        aside={
          <>
            <h2 id="equipes-titre" className="sr-only">
              {t('sixTeams')}
            </h2>
            <ul aria-labelledby="equipes-titre" className="s-grid pg-teams gap-y-5">
              {teams.map((team, i) => (
                <TeamCard key={team.slug} team={team} index={i} />
              ))}
            </ul>
          </>
        }
      />

      <SituationsSection situations={situations} lead={t('situationsLead')} />

      <section aria-labelledby="onglets-titre" className="s-sec">
        <div className="s-wrap">
          <SectionHeading id="onglets-titre" title={t('tabsTitle')} lead={t('tabsLead')} />
          <TeamTabs detail="gains" className="mt-12" />
        </div>
      </section>

      <section aria-labelledby="questions-titre" className="s-sec">
        <div className="s-wrap">
          <SectionHeading
            id="questions-titre"
            title={t('questionsTitle')}
            lead={t('questionsLead')}
          />
          <QuestionReel
            wide
            className="mt-12"
            items={allQuestions(teams).map(({ q, team }) => ({
              q,
              aside: team.label,
              href: `/cas-usage/${team.slug}`,
            }))}
          />
        </div>
      </section>

      <CtaBand title={t('ctaTitle')} text={t('ctaText', { count: TOOL_COUNT })} />
    </div>
  );
}

// ---------- Page d'une équipe ----------

export function EquipePage({ team }: { team: Team }) {
  const t = useTranslations('site.useCases');
  const cta = useTranslations('site.cta');
  const common = useTranslations('site.common');
  const content = useSiteContent();
  const others = content.teams.filter((o) => o.slug !== team.slug);
  const situations = content.situations.filter((s) => s.team === team.slug);
  return (
    <div className="s-page">
      <PageHero
        crumbs={[{ href: '/cas-usage', label: common('useCases') }]}
        current={team.label}
        title={team.headline}
        lead={team.lead}
        actions={
          <>
            <CtaLink href="/inscription">{cta('create')}</CtaLink>
            <CtaLink href="/connexion" variant="secondary">
              {cta('signIn')}
            </CtaLink>
          </>
        }
        aside={
          <>
            <DemoScene demo={team.demo} className="pg-cited" />
            <p className="s-fict mt-6">{common('fictional')}</p>
          </>
        }
      />

      <section aria-labelledby="questions-titre" className="s-sec">
        <div className="s-wrap s-grid s-split">
          <div className="s-split__head s-rv">
            <h2 id="questions-titre" className="s-h2">
              {t('teamQuestionsTitle')}
            </h2>
            <p className="s-lead mt-5">{nb(t('teamQuestionsLead'))}</p>
          </div>
          <QuestionReel className="s-split__body" items={team.questions.map((q) => ({ q }))} />
        </div>
      </section>

      {situations.length > 0 && (
        <SituationsSection situations={situations} lead={t('teamSituationsLead')} />
      )}

      <section aria-labelledby="gains-titre" className="s-sec">
        <div className="s-wrap s-grid s-split">
          <div className="s-split__head s-rv">
            <h2 id="gains-titre" className="s-h2">
              {t('gainsTitle')}
            </h2>
          </div>
          <FactList items={team.gains} className="s-split__body" />
        </div>
      </section>

      <section aria-labelledby="outils-titre" className="s-sec">
        <div className="s-wrap s-grid s-split">
          <div className="s-split__head s-rv">
            <h2 id="outils-titre" className="s-h2">
              {nb(t('toolsTitle'))}
            </h2>
            <p className="s-lead mt-5">{nb(t('toolsLead'))}</p>
            <ArrowLink href="/connecteurs" className="mt-6">
              {nb(t('allConnectors', { count: TOOL_COUNT }))}
            </ArrowLink>
          </div>
          <ul className="s-rows s-split__body">
            {team.tools.map((id) => (
              <li
                key={id}
                className="s-row grid-cols-[24px_150px_minmax(0,1fr)]! max-sm:grid-cols-[24px_minmax(0,1fr)]!"
              >
                <ToolLogo id={id} size={24} />
                <span className="font-medium">{toolLabel(id)}</span>
                <span className="text-muted max-sm:col-[2]">
                  <span className="pg-read">{nb(content.reads[id])}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="autres-titre" className="s-sec">
        <div className="s-wrap">
          <h2 id="autres-titre" className="s-h3">
            {t('otherTeams')}
          </h2>
          <ul className="pg-others mt-5 grid gap-x-6 border-b border-line">
            {others.map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/cas-usage/${o.slug}`}
                  className={cn(
                    'group flex min-h-12 items-center justify-between gap-3 border-t border-line font-medium',
                  )}
                >
                  {o.label}
                  <ArrowRight
                    aria-hidden="true"
                    strokeWidth={1.8}
                    className="size-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand title={t('teamCtaTitle')} text={t('teamCtaText')} />
    </div>
  );
}

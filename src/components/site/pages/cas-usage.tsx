import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { type Situation, type Team, TOOL_COUNT, toolLabel, useSiteContent } from '../content';
import { DemoCard } from '../demo-card';
import { Tilt } from '../fx';
import {
  ArrowLink,
  CtaBand,
  CtaLink,
  isFilterQuery,
  Kicker,
  QueryCode,
  SectionHeading,
  ToolLogo,
} from '../parts';
import { TeamTabs } from '../team-tabs';
import { PageHero, PageSection } from './page-hero';
import { TypedText, TypingList } from './typing-list';
import './pages.css';

// Cas d'usage : le hub (les six équipes, leurs questions, les onglets) et la page de chaque équipe.

const ICON_BOX =
  'grid shrink-0 place-items-center rounded-item border border-line bg-glass-3 text-accent transition-colors duration-300';

/** Une question comme dans la barre : en code si elle s'écrit en filtres, sinon en clair. */
function Question({ q, className }: { q: string; className?: string }) {
  return isFilterQuery(q) ? (
    <QueryCode q={q} className={className} />
  ) : (
    <span className={cn('text-ui font-medium text-fg', className)}>{nb(q)}</span>
  );
}

/** Ligne qui ressemble à la barre de recherche, avec la touche « / » (décorative) devant ; `row` : elle se tape. */
function QuestionRow({ q, aside, row }: { q: string; aside?: string; row?: number }) {
  return (
    <span className="flex min-h-[52px] items-center gap-3 rounded-box border border-line bg-glass-2 px-4 py-2.5 shadow-hi">
      <span
        aria-hidden="true"
        className="inline-grid h-[20px] min-w-[20px] shrink-0 place-items-center rounded-[6px] border border-line-strong bg-glass-3 px-[5px] font-mono text-[11px] text-muted"
      >
        /
      </span>
      <span className="min-w-0 flex-1">
        {row === undefined ? (
          <Question q={q} />
        ) : (
          <TypedText text={q} row={row}>
            <Question q={q} />
          </TypedText>
        )}
      </span>
      {aside && (
        <span className="shrink-0 font-mono text-meta tracking-normal text-muted max-sm:hidden">
          {aside}
        </span>
      )}
    </span>
  );
}

function TeamCard({ team }: { team: Team }) {
  const common = useTranslations('site.common');
  return (
    <li className="site-reveal">
      <Tilt max={8} scale={1.02} className="h-full rounded-box">
        <Link
          href={`/cas-usage/${team.slug}`}
          className="group relative flex h-full flex-col rounded-box border border-line bg-panel p-6 shadow-hi transition-[border-color,box-shadow] duration-300 [transform-style:preserve-3d] hover:border-accent-line hover:shadow-panel"
        >
          {/* le halo est rogné par son propre calque : un overflow sur le lien aplatirait la 3D de la carte */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
          >
            <span className="site-halo absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </span>
          <span className="relative flex items-start justify-between gap-4 [transform-style:preserve-3d]">
            <span
              className={cn(
                ICON_BOX,
                'fx-pop size-11 [--pop:44px] group-hover:border-accent-line group-hover:bg-accent-soft group-hover:shadow-[0_18px_40px_-16px_color-mix(in_srgb,var(--accent)_70%,transparent)]',
              )}
            >
              <team.icon aria-hidden="true" strokeWidth={1.7} className="size-5" />
            </span>
            <ArrowUpRight
              aria-hidden="true"
              strokeWidth={1.8}
              className="size-5 text-muted transition-[translate,color] duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent"
            />
          </span>
          <h3 className="relative mt-6 text-title font-bold tracking-[-0.02em] text-fg">
            {team.label}
          </h3>
          <span className="relative mt-2 text-body leading-[1.55] text-fg-2">{nb(team.pitch)}</span>
          <span className="relative mt-auto flex items-center gap-2 pt-7">
            <span className="flex -space-x-2">
              {team.tools.slice(0, 4).map((id) => (
                <ToolLogo key={id} id={id} size={30} className="ring-2 ring-[var(--bg)]" />
              ))}
            </span>
            <span className="font-mono text-meta tracking-normal text-muted">
              {common('toolCount', { count: team.tools.length })}
            </span>
          </span>
        </Link>
      </Tilt>
    </li>
  );
}

/** Une situation : qui, quand, ce qu'on demande, ce que Leon fait et lit. */
function SituationCard({ s }: { s: Situation }) {
  const t = useTranslations('site.useCases');
  return (
    <li className="site-reveal">
      <article className="flex h-full flex-col gap-4 rounded-box border border-line bg-panel p-6 shadow-hi">
        <div>
          <p className="font-mono text-meta tracking-normal text-accent">{nb(s.moment)}</p>
          <h3 className="mt-2 text-title font-bold tracking-[-0.02em] text-fg">{nb(s.title)}</h3>
          <p className="mt-1 text-label text-muted">{nb(s.who)}</p>
        </div>
        <QuestionRow q={s.question} />
        <p className="text-body leading-[1.6] text-fg-2">{nb(s.does)}</p>
        <p className="text-body leading-[1.6] text-fg-2">
          <span className="font-semibold text-fg">{t('changes')}</span>
          {nb(s.gain)}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {s.tools.map((id) => (
            <ToolLogo key={id} id={id} size={28} title />
          ))}
          {s.alsoReads && (
            <span className="rounded-full border border-line bg-glass-3 px-3 py-1 text-label text-fg-2">
              {nb(s.alsoReads)}
            </span>
          )}
        </div>
      </article>
    </li>
  );
}

function SituationsSection({ situations, lead }: { situations: Situation[]; lead: string }) {
  const t = useTranslations('site.useCases');
  return (
    <PageSection labelledBy="situations-titre">
      <SectionHeading
        id="situations-titre"
        kicker={t('situationsKicker')}
        title={t('situationsTitle')}
        lead={lead}
      />
      {/* une seule situation : une carte à sa largeur, pas une grille à moitié vide */}
      <ul
        className={
          situations.length > 1
            ? 'mt-10 grid gap-4 md:grid-cols-2'
            : 'mt-10 grid max-w-[640px] gap-4'
        }
      >
        {situations.map((s) => (
          <SituationCard key={s.id} s={s} />
        ))}
      </ul>
    </PageSection>
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
  const common = useTranslations('site.common');
  const { teams, situations } = useSiteContent();
  return (
    <>
      <PageHero
        kicker={common('useCases')}
        title={t('heroTitle')}
        accent={t('heroAccent')}
        lead={t('heroLead')}
        align="center"
        actions={
          <>
            <CtaLink href="/inscription">{cta('create')}</CtaLink>
            <CtaLink href="/produit" variant="secondary">
              {cta('howItWorks')}
            </CtaLink>
          </>
        }
      >
        <ul className="flex flex-wrap justify-center gap-2">
          {teams.map((team) => (
            <li key={team.slug}>
              <Link
                href={`/cas-usage/${team.slug}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-glass-3 px-3.5 text-label font-semibold text-fg-2 transition-colors duration-200 hover:border-accent-line hover:text-fg pointer-coarse:h-11"
              >
                <team.icon aria-hidden="true" strokeWidth={1.8} className="size-3.5 text-accent" />
                {team.label}
              </Link>
            </li>
          ))}
        </ul>
      </PageHero>

      <PageSection labelledBy="equipes-titre" className="pt-4 sm:pt-8">
        <h2 id="equipes-titre" className="sr-only">
          {t('sixTeams')}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <TeamCard key={team.slug} team={team} />
          ))}
        </ul>
      </PageSection>

      <SituationsSection situations={situations} lead={t('situationsLead')} />

      <PageSection labelledBy="onglets-titre">
        <SectionHeading
          id="onglets-titre"
          kicker={t('tabsKicker')}
          title={t('tabsTitle')}
          lead={t('tabsLead')}
        />
        <TeamTabs detail="gains" className="mt-10" />
      </PageSection>

      <PageSection labelledBy="questions-titre">
        <SectionHeading
          id="questions-titre"
          kicker={common('inTheBar')}
          title={t('questionsTitle')}
          lead={t('questionsLead')}
          align="center"
        />
        <ul className="mx-auto mt-12 grid max-w-[1000px] gap-2.5 md:grid-cols-2">
          {allQuestions(teams).map(({ q, team }) => (
            <li key={q} className="site-reveal">
              <Link
                href={`/cas-usage/${team.slug}`}
                className="block rounded-box transition-[translate] duration-300 ease-out hover:-translate-y-0.5"
              >
                <QuestionRow q={q} aside={team.label} />
              </Link>
            </li>
          ))}
        </ul>
      </PageSection>

      <CtaBand title={t('ctaTitle')} text={t('ctaText', { count: TOOL_COUNT })} />
    </>
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
    <>
      <PageHero
        crumbs={[{ href: '/cas-usage', label: common('useCases') }]}
        current={team.label}
        kicker={
          <span className="inline-flex items-center gap-2.5">
            <span className={cn(ICON_BOX, 'size-8 border-accent-line bg-accent-soft')}>
              <team.icon aria-hidden="true" strokeWidth={1.8} className="size-4" />
            </span>
            <Kicker>{team.label}</Kicker>
          </span>
        }
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
          <div className="fx-untilt">
            <Tilt max={4} scale={1} perspective={1600} glare={false} className="rounded-panel">
              <DemoCard demo={team.demo} />
            </Tilt>
          </div>
        }
      />

      <PageSection labelledBy="questions-titre">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <SectionHeading
            id="questions-titre"
            kicker={common('inTheBar')}
            title={t('teamQuestionsTitle')}
            lead={t('teamQuestionsLead')}
          />
          <TypingList className="grid content-start gap-2.5">
            {team.questions.map((q, i) => (
              <li key={q} className="site-reveal flex items-center gap-3">
                <span className="w-6 shrink-0 font-mono text-meta tracking-normal text-muted">
                  0{i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <QuestionRow q={q} row={i} />
                </span>
              </li>
            ))}
          </TypingList>
        </div>
      </PageSection>

      {situations.length > 0 && (
        <SituationsSection situations={situations} lead={t('teamSituationsLead')} />
      )}

      <PageSection labelledBy="gains-titre">
        <SectionHeading id="gains-titre" kicker={t('gainsKicker')} title={t('gainsTitle')} />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {team.gains.map((g, i) => (
            <li key={g.title} className="site-reveal">
              <Tilt className="h-full rounded-box border border-line bg-panel p-6 shadow-hi">
                {/* le filet Signal sur un calque rogné à part : un overflow sur la carte aplatirait sa 3D */}
                <span
                  aria-hidden="true"
                  className="signal-line pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                />
                <span className="fx-pop block w-fit font-mono text-[34px] leading-none font-medium tracking-[-0.02em] text-accent [--pop:50px]">
                  0{i + 1}
                </span>
                <h3 className="mt-6 text-title font-bold tracking-[-0.02em] text-fg">
                  {nb(g.title)}
                </h3>
                <p className="mt-2 text-body leading-[1.6] text-fg-2">{nb(g.text)}</p>
              </Tilt>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection labelledBy="outils-titre">
        <div className="site-reveal relative overflow-hidden rounded-panel border border-line bg-panel p-6 shadow-hi sm:p-10">
          <div
            aria-hidden="true"
            className="site-dots pointer-events-none absolute inset-0 opacity-70"
          />
          <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <Kicker>{t('toolsKicker')}</Kicker>
              <h2
                id="outils-titre"
                className="mt-3 text-[clamp(26px,3vw,36px)] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-fg"
              >
                {nb(t('toolsTitle'))}
              </h2>
              <p className="mt-3 text-body leading-[1.6] text-fg-2">{nb(t('toolsLead'))}</p>
              <ArrowLink href="/connecteurs" className="mt-6">
                {nb(t('allConnectors', { count: TOOL_COUNT }))}
              </ArrowLink>
            </div>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {team.tools.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-field border border-line bg-glass-2 px-3 py-2.5 shadow-hi"
                >
                  <ToolLogo id={id} size={30} />
                  <span className="min-w-0 truncate text-ui font-semibold text-fg-2">
                    {toolLabel(id)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PageSection>

      <PageSection labelledBy="autres-titre" className="pt-4 sm:pt-8">
        <h2 id="autres-titre" className="text-title font-bold tracking-[-0.02em] text-fg">
          {t('otherTeams')}
        </h2>
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {others.map((o) => (
            <li key={o.slug}>
              <Link
                href={`/cas-usage/${o.slug}`}
                className="group flex h-full items-center gap-3 rounded-box border border-line bg-panel px-4 py-3.5 shadow-hi transition-[border-color,background-color] duration-200 hover:border-accent-line hover:bg-hover"
              >
                <o.icon
                  aria-hidden="true"
                  strokeWidth={1.7}
                  className="size-[18px] shrink-0 text-accent"
                />
                <span className="min-w-0 flex-1 truncate text-ui font-semibold text-fg">
                  {o.label}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  strokeWidth={1.8}
                  className="size-4 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      </PageSection>

      <CtaBand title={t('teamCtaTitle')} text={t('teamCtaText')} />
    </>
  );
}

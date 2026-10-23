import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { TEAMS, type Team, TOOL_COUNT, toolLabel } from '../content';
import { DemoCard } from '../demo-card';
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

/** Ligne qui ressemble à la barre de recherche, avec la touche « / » (décorative) devant. */
function QuestionRow({ q, aside }: { q: string; aside?: string }) {
  return (
    <span className="flex min-h-[52px] items-center gap-3 rounded-box border border-line bg-glass-2 px-4 py-2.5 shadow-hi">
      <span
        aria-hidden="true"
        className="inline-grid h-[20px] min-w-[20px] shrink-0 place-items-center rounded-[6px] border border-line-strong bg-glass-3 px-[5px] font-mono text-[11px] text-muted"
      >
        /
      </span>
      <span className="min-w-0 flex-1">
        <Question q={q} />
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
  return (
    <li className="site-reveal">
      <Link
        href={`/cas-usage/${team.slug}`}
        className="site-lift group relative flex h-full flex-col overflow-hidden rounded-box border border-line bg-panel p-6 shadow-hi"
      >
        <span
          aria-hidden="true"
          className="site-halo pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
        <span className="relative flex items-start justify-between gap-4">
          <span
            className={cn(
              ICON_BOX,
              'size-11 group-hover:border-accent-line group-hover:bg-accent-soft',
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
        <span className="relative mt-6 text-title font-bold tracking-[-0.02em] text-fg">
          {team.label}
        </span>
        <span className="relative mt-2 text-body leading-[1.55] text-fg-2">{nb(team.pitch)}</span>
        <span className="relative mt-auto flex items-center gap-2 pt-7">
          <span className="flex -space-x-2">
            {team.tools.slice(0, 4).map((id) => (
              <ToolLogo key={id} id={id} size={30} className="ring-2 ring-[var(--bg)]" />
            ))}
          </span>
          <span className="font-mono text-meta tracking-normal text-muted">
            {team.tools.length} outils
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Les questions de toutes les équipes, mêlées, une par une. */
const ALL_QUESTIONS = TEAMS.flatMap((t, ti) =>
  t.questions.map((q, qi) => ({ q, team: t, order: qi * TEAMS.length + ti })),
)
  .sort((a, b) => a.order - b.order)
  .filter((x, i, arr) => arr.findIndex((y) => y.q === x.q) === i);

export function CasUsagePage() {
  return (
    <>
      <PageHero
        kicker="Cas d’usage"
        title="Chaque équipe a ses questions. Leon répond avec les mêmes sources."
        lead="Direction, ventes, support, produit, projets, nouvelles arrivées : chacun cherche autre chose, dans les mêmes outils. Voici ce qu’on tape dans la barre, et ce que Leon répond."
        align="center"
        actions={
          <>
            <CtaLink href="/inscription">Créer un espace</CtaLink>
            <CtaLink href="/produit" variant="secondary">
              Comment ça marche
            </CtaLink>
          </>
        }
      >
        <ul className="flex flex-wrap justify-center gap-2">
          {TEAMS.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/cas-usage/${t.slug}`}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-glass-3 px-3.5 text-label font-semibold text-fg-2 transition-colors duration-200 hover:border-accent-line hover:text-fg"
              >
                <t.icon aria-hidden="true" strokeWidth={1.8} className="size-3.5 text-accent" />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </PageHero>

      <PageSection labelledBy="equipes-titre" className="pt-4 sm:pt-8">
        <h2 id="equipes-titre" className="sr-only">
          Les six équipes
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEAMS.map((t) => (
            <TeamCard key={t.slug} team={t} />
          ))}
        </ul>
      </PageSection>

      <PageSection labelledBy="onglets-titre">
        <SectionHeading
          id="onglets-titre"
          kicker="Une même barre"
          title="Une seule recherche, des réponses différentes."
          lead="Choisissez une équipe : voici ce qu’elle demande, et l’écran que Leon lui rend. Les données de ces exemples sont fictives."
        />
        <TeamTabs detail="gains" className="mt-10" />
      </PageSection>

      <PageSection labelledBy="questions-titre">
        <SectionHeading
          id="questions-titre"
          kicker="Dans la barre"
          title="Les questions qu’on tape vraiment."
          lead="En langage courant ou avec des filtres : de:, outil:, type:, depuis:, avant:, et les mots exacts entre guillemets."
          align="center"
        />
        <ul className="mx-auto mt-12 grid max-w-[1000px] gap-2.5 md:grid-cols-2">
          {ALL_QUESTIONS.map(({ q, team }) => (
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

      <CtaBand
        title="Commencez par une équipe."
        text={`Branchez ses outils parmi les ${TOOL_COUNT} connecteurs et posez la première question.`}
      />
    </>
  );
}

// ---------- Page d'une équipe ----------

export function EquipePage({ team }: { team: Team }) {
  const others = TEAMS.filter((t) => t.slug !== team.slug);
  return (
    <>
      <PageHero
        crumbs={[{ href: '/cas-usage', label: 'Cas d’usage' }]}
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
            <CtaLink href="/inscription">Créer un espace</CtaLink>
            <CtaLink href="/connexion" variant="secondary">
              Se connecter
            </CtaLink>
          </>
        }
        aside={<DemoCard demo={team.demo} />}
      />

      <PageSection labelledBy="questions-titre">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <SectionHeading
            id="questions-titre"
            kicker="Dans la barre"
            title="Les questions de l’équipe."
            lead="Écrites telles qu’on les tape. Leon cherche dans tous les outils branchés, puis répond en citant."
          />
          <ol className="grid content-start gap-2.5">
            {team.questions.map((q, i) => (
              <li key={q} className="site-reveal flex items-center gap-3">
                <span className="w-6 shrink-0 font-mono text-meta tracking-normal text-muted">
                  0{i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <QuestionRow q={q} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </PageSection>

      <PageSection labelledBy="gains-titre">
        <SectionHeading
          id="gains-titre"
          kicker="Ce qui change"
          title="Trois choses, concrètement."
        />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {team.gains.map((g, i) => (
            <li
              key={g.title}
              className="site-reveal signal-line relative overflow-hidden rounded-box border border-line bg-panel p-6 shadow-hi"
            >
              <span className="font-mono text-[28px] leading-none font-medium tracking-[-0.02em] text-accent">
                0{i + 1}
              </span>
              <h3 className="mt-6 text-title font-bold tracking-[-0.02em] text-fg">
                {nb(g.title)}
              </h3>
              <p className="mt-2 text-body leading-[1.6] text-fg-2">{nb(g.text)}</p>
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
              <Kicker>Les outils</Kicker>
              <h2
                id="outils-titre"
                className="mt-3 text-[clamp(26px,3vw,36px)] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-fg"
              >
                {nb('Les outils de l’équipe, déjà branchables.')}
              </h2>
              <p className="mt-3 text-body leading-[1.6] text-fg-2">
                {nb(
                  'Une clé d’API ou un bouton de connexion suffit. Leon relève ce qui change toutes les 15 minutes.',
                )}
              </p>
              <ArrowLink href="/connecteurs" className="mt-6">
                {nb(`Les ${TOOL_COUNT} connecteurs`)}
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
          Les autres équipes
        </h2>
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {others.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/cas-usage/${t.slug}`}
                className="group flex h-full items-center gap-3 rounded-box border border-line bg-panel px-4 py-3.5 shadow-hi transition-[border-color,background-color] duration-200 hover:border-accent-line hover:bg-hover"
              >
                <t.icon
                  aria-hidden="true"
                  strokeWidth={1.7}
                  className="size-[18px] shrink-0 text-accent"
                />
                <span className="min-w-0 flex-1 truncate text-ui font-semibold text-fg">
                  {t.label}
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

      <CtaBand
        title="Branchez les outils de l’équipe. Posez la première question."
        text="Leon répond avec la source, ou dit qu’il ne sait pas."
      />
    </>
  );
}

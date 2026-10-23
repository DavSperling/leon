'use client';

import { Check } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { TEAMS, type Team } from './content';
import { DemoAnswerCard, DemoSourceRow } from './demo-card';
import { ArrowLink, isFilterQuery, QueryCode, ToolLogo } from './parts';

// Les cas d'usage par équipe, en onglets (Radix Tabs : flèches du clavier, rôles ARIA). Chaque panneau : la promesse,
// puis les questions que l'équipe tape (accueil) ou ce qui change pour elle (page Cas d'usage), une réponse d'exemple
// et les outils de l'équipe.

function Questions({ team }: { team: Team }) {
  return (
    <>
      <p className="mt-6 font-mono text-meta tracking-normal text-muted">
        Ce que l’équipe tape dans la barre
      </p>
      <ul className="mt-2.5 grid gap-2">
        {team.questions.map((q) => (
          <li
            key={q}
            className="flex min-h-11 items-center gap-3 rounded-field border border-line bg-glass-3 px-3.5 py-2 text-ui text-fg"
          >
            <span aria-hidden="true" className="font-mono text-[11px] text-muted">
              /
            </span>
            {isFilterQuery(q) ? <QueryCode q={q} /> : <span>{nb(q)}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

function Gains({ team }: { team: Team }) {
  return (
    <ul className="mt-6 grid gap-4">
      {team.gains.map((g) => (
        <li key={g.title} className="flex gap-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
            <Check aria-hidden="true" strokeWidth={2.4} className="size-3" />
          </span>
          <span>
            <span className="block text-ui font-semibold text-fg">{nb(g.title)}</span>
            <span className="mt-0.5 block text-label leading-[1.55] text-muted">{nb(g.text)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TeamTabs({
  detail = 'questions',
  className,
}: {
  /** Sous la promesse : les questions de l'équipe, ou ses trois gains. */
  detail?: 'questions' | 'gains';
  className?: string;
}) {
  return (
    <Tabs.Root defaultValue={TEAMS[0]?.slug} className={cn('site-reveal', className)}>
      <Tabs.List
        aria-label="Cas d’usage par équipe"
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
      >
        {TEAMS.map((t) => (
          <Tabs.Trigger
            key={t.slug}
            value={t.slug}
            className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-glass-3 px-4 text-ui font-semibold text-fg-2 backdrop-blur-[12px] transition-[border-color,background-color,color] duration-200 hover:border-line-strong hover:text-fg data-[state=active]:border-accent-line data-[state=active]:bg-accent-soft data-[state=active]:text-accent"
          >
            <t.icon
              aria-hidden="true"
              strokeWidth={1.7}
              className="size-4 text-muted transition-colors group-data-[state=active]:text-accent"
            />
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {TEAMS.map((t) => (
        <Tabs.Content key={t.slug} value={t.slug} className="mt-6 outline-none">
          <div className="fade-in grid gap-6 rounded-panel border border-line bg-[linear-gradient(180deg,var(--glass-2),var(--glass))] p-5 shadow-panel backdrop-blur-[30px] sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
            <div className="flex flex-col">
              <h3 className="text-[clamp(24px,2.8vw,32px)] leading-[1.15] font-bold tracking-[-0.03em] text-balance text-fg">
                {nb(t.headline)}
              </h3>
              <p className="mt-3 text-body leading-[1.65] text-fg-2">{nb(t.lead)}</p>
              {detail === 'questions' ? <Questions team={t} /> : <Gains team={t} />}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 lg:mt-auto lg:pt-6">
                <div className="flex flex-wrap gap-1.5">
                  {t.tools.slice(0, 6).map((id) => (
                    <ToolLogo key={id} id={id} size={30} title />
                  ))}
                </div>
                <ArrowLink href={`/cas-usage/${t.slug}`}>Tout le cas d’usage</ArrowLink>
              </div>
            </div>
            <div className="grid content-start gap-2.5">
              <div className="flex items-center gap-2 px-1 font-mono text-meta tracking-normal text-muted">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-ok" />
                <span className="truncate">{nb(t.demo.query)}</span>
              </div>
              <DemoAnswerCard demo={t.demo} />
              <ol className="grid gap-2">
                {t.demo.sources.slice(0, 2).map((s, i) => (
                  <DemoSourceRow key={s.title} source={s} n={i + 1} />
                ))}
              </ol>
              <p className="px-1 font-mono text-meta tracking-normal text-muted">Exemple fictif</p>
            </div>
          </div>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

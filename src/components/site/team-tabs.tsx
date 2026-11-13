'use client';

import { useTranslations } from 'next-intl';
import { Tabs } from 'radix-ui';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { type Team, toolLabel, useSiteContent } from './content';
import { AnswerSheet } from './demo-card';
import { CheckMark } from './pages/page-hero';
import { ArrowLink, isFilterQuery, QueryCode, ToolLogo } from './parts';

// Les cas d'usage par équipe, en onglets d'index joints au bureau (Radix Tabs : flèches du clavier, rôles ARIA).
// Chaque panneau : la promesse, puis les questions que l'équipe tape ou ce qui change pour elle, les outils de
// l'équipe, et à côté une réponse d'exemple.

function Questions({ team }: { team: Team }) {
  const t = useTranslations('site.teamTabs');
  return (
    <>
      <p className="s-small mt-6 font-medium">{t('typed')}</p>
      <ul className="mt-2 border-b border-line">
        {team.questions.map((q) => (
          <li key={q} className="flex min-h-12 items-center gap-3 border-t border-line py-2">
            <span aria-hidden="true" className="strokes">
              <i />
              <i />
              <i />
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
    <ul className="s-facts mt-6">
      {team.gains.map((g) => (
        <li key={g.title}>
          <CheckMark />
          <h4 className="font-semibold">{nb(g.title)}</h4>
          <p className="s-body text-muted">{nb(g.text)}</p>
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
  const t = useTranslations('site.teamTabs');
  const common = useTranslations('site.common');
  const { teams } = useSiteContent();
  return (
    <Tabs.Root defaultValue={teams[0]?.slug} className={className}>
      <Tabs.List aria-label={t('list')} className="s-tabs mt-0 max-sm:overflow-x-auto">
        {teams.map((team) => (
          <Tabs.Trigger key={team.slug} value={team.slug} className="s-tab">
            {team.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {teams.map((team) => (
        <Tabs.Content
          key={team.slug}
          value={team.slug}
          className={cn(
            'rounded-[0_var(--s-r)_var(--s-r)_var(--s-r)] bg-[var(--s-desk)] p-10 max-sm:-mx-4 max-sm:rounded-none max-sm:px-4 max-sm:py-6',
          )}
        >
          <div className="s-grid items-start gap-y-10">
            <div className="col-[1/13] min-[1100px]:col-[1/6]">
              <h3 className="s-h2">{nb(team.headline)}</h3>
              <p className="s-lead mt-4">{nb(team.lead)}</p>
              {detail === 'questions' ? <Questions team={team} /> : <Gains team={team} />}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-3">
                  <p className="sr-only">
                    {nb(t('tools', { tools: team.tools.slice(0, 6).map(toolLabel).join(', ') }))}
                  </p>
                  {team.tools.slice(0, 6).map((id) => (
                    <ToolLogo key={id} id={id} size={24} title />
                  ))}
                </div>
                <ArrowLink href={`/cas-usage/${team.slug}`}>{t('more')}</ArrowLink>
              </div>
            </div>
            <figure className="col-[1/13] min-[1100px]:col-[7/13]">
              <AnswerSheet demo={team.demo} />
              <figcaption className="s-fict mt-4">{common('fictional')}</figcaption>
            </figure>
          </div>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

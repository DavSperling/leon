'use client';

import { Check, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';
import { setFollowedAction, setSeeAllAction } from '@/app/(app)/equipe/actions';
import { NATURE_LABELS } from '@/components/search/view-model';
import {
  Button,
  EmptyState,
  GlassCard,
  PageHeader,
  SourceChip,
  SourceLink,
  Switch,
  toast,
} from '@/components/verre';
import { NATURE_LABELS_EN } from '@/lib/labels';
import { FOLLOW_FAMILIES, type FollowFamily } from '@/lib/providers';
import { cn, nb } from '@/lib/verre';
import type { Report } from '@/server/auth/organisation';
import type { SourceHit } from '@/server/search/types';
import { type ChartMember, OrgChart } from './org-chart';

type Activity = { hits: SourceHit[]; total: number };

/**
 * « Mon équipe » : l'organigramme de toute l'organisation, puis les gens sous le lecteur (directs, puis indirects en retrait), et pour la personne choisie
 * (?personne=…) ce qu'il suit d'elle et son activité récente, privé compris s'il le lit (0057). L'interrupteur de ce
 * privé ne paraît que si l'organisation le permet (`seeAllAllowed`).
 */
export function Team({
  reports,
  selected,
  activity,
  chart,
  seeAllAllowed,
}: {
  reports: Report[];
  selected: Report | null;
  activity: Activity | null;
  chart: ChartMember[];
  seeAllAllowed: boolean;
}) {
  const t = useTranslations('team');
  return (
    <div className="mx-auto max-w-[1040px]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <OrgChart members={chart} under={reports.map((r) => r.memberId)} />
      {selected === null ? (
        <EmptyState
          icon={Users}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button asChild variant="secondary">
              <Link href="/reglages#membres">{t('emptyAction')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,250px)_minmax(0,1fr)] md:items-start">
          <People reports={reports} selectedId={selected.memberId} />
          {/* clé : une autre personne repart de ses propres familles, sans l'état optimiste de la précédente */}
          <Person
            key={selected.memberId}
            report={selected}
            activity={activity}
            seeAllAllowed={seeAllAllowed}
          />
        </div>
      )}
    </div>
  );
}

function People({ reports, selectedId }: { reports: Report[]; selectedId: string }) {
  const t = useTranslations('team');
  return (
    <nav aria-label={t('people')}>
      <GlassCard className="p-1.5">
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {reports.map((report) => {
            const current = report.memberId === selectedId;
            return (
              <li key={report.memberId}>
                <Link
                  href={`/equipe?personne=${report.memberId}`}
                  scroll={false}
                  aria-current={current ? 'page' : undefined}
                  // retrait de 14 px par niveau sous le premier : l'arbre se lit sans traits
                  style={{ paddingLeft: `${12 + (report.depth - 1) * 14}px` }}
                  className={cn(
                    'flex min-h-11 flex-col justify-center rounded-field py-2 pr-3 transition-colors duration-200 hover:bg-hover',
                    current && 'bg-ink shadow-hi',
                  )}
                >
                  <span
                    className={cn(
                      'truncate text-ui font-medium text-fg-2',
                      current && 'font-semibold text-fg',
                    )}
                  >
                    {report.name}
                  </span>
                  {report.depth > 1 && (
                    <span className="truncate text-label text-muted">
                      {t('reportsTo', { name: report.managerName })}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </GlassCard>
    </nav>
  );
}

function Person({
  report,
  activity,
  seeAllAllowed,
}: {
  report: Report;
  activity: Activity | null;
  seeAllAllowed: boolean;
}) {
  const t = useTranslations('team');
  const family = useTranslations('connections.family');
  const [families, setFamilies] = useOptimistic(report.families);
  const [seeAll, setSeeAll] = useOptimistic(report.voitTout);
  const [saving, startTransition] = useTransition();

  const toggleSeeAll = (on: boolean) =>
    startTransition(async () => {
      setSeeAll(on);
      try {
        const { ok } = await setSeeAllAction(report.memberId, on);
        if (!ok) toast.error(t('followFailed'));
      } catch {
        toast.error(t('followFailed'));
      }
    });

  const toggle = (picked: FollowFamily) =>
    startTransition(async () => {
      const next = families.includes(picked)
        ? families.filter((f) => f !== picked)
        : FOLLOW_FAMILIES.filter((f) => f === picked || families.includes(f));
      setFamilies(next);
      try {
        const { ok } = await setFollowedAction(report.memberId, next);
        if (!ok) toast.error(t('followFailed'));
      } catch {
        toast.error(t('followFailed'));
      }
    });

  return (
    <section aria-labelledby="personne-nom" className="grid gap-5">
      <GlassCard variant="raised" className="grid gap-4 p-5">
        <div className="min-w-0">
          <h2 id="personne-nom" className="text-h2 font-semibold [overflow-wrap:anywhere] text-fg">
            {report.name}
          </h2>
          <p className="mt-0.5 text-label [overflow-wrap:anywhere] text-muted">
            {report.email}
            {report.depth > 1 && ` · ${t('reportsTo', { name: report.managerName })}`}
          </p>
        </div>
        {seeAllAllowed && (
          <div className="grid gap-1.5">
            <Switch
              label={t('seeAll')}
              checked={seeAll}
              onCheckedChange={toggleSeeAll}
              aria-describedby="voir-tout-aide"
            />
            <p id="voir-tout-aide" className="text-label text-muted">
              {nb(t('seeAllHelp', { name: report.name }))}
            </p>
          </div>
        )}
        <fieldset className="grid min-w-0 gap-2.5" aria-describedby="suivi-aide">
          <legend className="mb-2.5 text-label font-semibold text-fg-2">{t('following')}</legend>
          <div className="flex flex-wrap gap-2">
            {FOLLOW_FAMILIES.map((f) => {
              const on = families.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(f)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-label font-medium transition-colors duration-200',
                    on
                      ? 'border-accent-line bg-accent-soft text-fg'
                      : 'border-line text-muted hover:border-line-strong hover:text-fg-2',
                  )}
                >
                  {/* la coche dit l'état sans la couleur seule */}
                  <Check
                    aria-hidden="true"
                    strokeWidth={2}
                    className={cn('size-3.5 text-accent', !on && 'hidden')}
                  />
                  {f === 'documents' ? t('documents') : family(f)}
                </button>
              );
            })}
          </div>
          <p id="suivi-aide" className="text-label text-muted">
            {nb(t('followingHelp'))}
          </p>
        </fieldset>
      </GlassCard>

      <div aria-busy={saving} className={cn('transition-opacity', saving && 'opacity-60')}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-ui font-semibold text-fg">{t('activity')}</h3>
          <Link
            href={`/?q=${encodeURIComponent(`de:${report.email}`)}`}
            className="inline-flex items-center gap-1.5 rounded-sm text-label font-medium text-accent underline-offset-4 hover:underline"
          >
            <Search aria-hidden="true" strokeWidth={1.7} className="size-[13px]" />
            {t('searchAll', { name: report.name })}
          </Link>
        </div>
        {families.length === 0 ? (
          <EmptyState title={t('nothingFollowed')} description={t('nothingFollowedHelp')} />
        ) : !activity || activity.hits.length === 0 ? (
          <EmptyState title={t('nothingRecent')} description={t('nothingRecentHelp')} />
        ) : (
          <GlassCard className="px-4">
            <ul>
              {activity.hits.map((hit) => (
                <ActivityItem key={hit.sourceId} hit={hit} />
              ))}
            </ul>
          </GlassCard>
        )}
      </div>
    </section>
  );
}

function ActivityItem({ hit }: { hit: SourceHit }) {
  const t = useTranslations('team');
  const locale = useLocale();
  const title = hit.title?.trim() || t('untitled');
  const snippet = hit.passages[0]?.snippet;
  const nature = locale === 'en' ? NATURE_LABELS_EN[hit.nature] : NATURE_LABELS[hit.nature];
  return (
    <li className="grid gap-1 border-b border-line py-3.5 last:border-0">
      <SourceChip kind={hit.kind} extra={[nature]} date={hit.lastTs} />
      <p className="truncate text-ui font-medium text-fg" title={title}>
        {title}
      </p>
      {snippet && <p className="line-clamp-2 text-label text-fg-2">{snippet}</p>}
      <SourceLink href={hit.url} kind={hit.kind} className="mt-0.5 justify-self-start" />
    </li>
  );
}

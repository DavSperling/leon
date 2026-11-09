'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { Button, GlassCard } from '@/components/verre';
import { departmentLabelKey, jobLabelKey } from '@/lib/onboarding';
import { cn } from '@/lib/verre';
import type { MemberRow } from '@/server/auth/members';

export type ChartMember = Pick<
  MemberRow,
  'id' | 'name' | 'managerId' | 'department' | 'job' | 'self'
>;

// L'organigramme vu depuis une personne, comme Google et Microsoft : ses managers au-dessus (`chain`, du haut vers
// elle), sa rangée (elle et ses collègues, même manager), ses directs dans `children`. Sans manager, ou rattachée à
// quelqu'un qui n'est plus là, elle est dans la rangée des racines, celles qui ont une équipe d'abord.
export function orgView(members: ChartMember[], focusId: string | null) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const children = new Map<string, ChartMember[]>();
  for (const m of members)
    if (m.managerId && byId.has(m.managerId))
      children.set(m.managerId, [...(children.get(m.managerId) ?? []), m]);
  const byName = (a: ChartMember, b: ChartMember) => a.name.localeCompare(b.name, 'fr');
  for (const list of children.values()) list.sort(byName);
  const focus = byId.get(focusId ?? '') ?? members.find((m) => m.self) ?? members[0];
  const chain: ChartMember[] = [];
  for (
    let m = byId.get(focus?.managerId ?? '');
    m && m !== focus && !chain.includes(m);
    m = byId.get(m.managerId ?? '')
  )
    chain.unshift(m);
  const manager = chain.at(-1);
  const row = manager
    ? (children.get(manager.id) ?? [])
    : members
        .filter((m) => !m.managerId || !byId.has(m.managerId))
        .sort((a, b) => Number(children.has(b.id)) - Number(children.has(a.id)) || byName(a, b));
  return { focus, chain, row, children };
}

// La personne au centre reste en vue quand sa rangée dépasse la largeur de la carte.
const keepInView = (el: HTMLElement | null) =>
  el?.scrollIntoView({ block: 'nearest', inline: 'center' });

/**
 * L'organigramme de « Mon équipe » (.org-tree, globals.css), centré sur le lecteur, puis sur la personne où il clique.
 * Il ne montre que ce que la liste des membres montre déjà : qui est rattaché à qui, et le poste pour un propriétaire
 * ou un administrateur. Une personne sous le lecteur ouvre aussi sa fiche.
 */
export function OrgChart({ members, under }: { members: ChartMember[]; under: string[] }) {
  const t = useTranslations('team');
  const [focusId, setFocusId] = useState<string | null>(null);
  const { focus, chain, row, children } = orgView(members, focusId);
  if (!focus) return null;
  const reachable = new Set(under);

  const box = (m: ChartMember) => (
    <Box
      member={m}
      reports={children.get(m.id)?.length ?? 0}
      focused={m.id === focus.id}
      href={reachable.has(m.id) ? `/equipe?personne=${m.id}` : undefined}
      onSelect={() => setFocusId(m.id)}
    />
  );
  // Seule la personne au centre déplie ses directs.
  const item = (m: ChartMember) => {
    const reports = m.id === focus.id ? children.get(m.id) : undefined;
    return (
      <li key={m.id}>
        {box(m)}
        {reports && <ul>{reports.map(item)}</ul>}
      </li>
    );
  };
  const [top] = chain;
  const trees = top
    ? [
        <ul key={top.id} className="org-tree">
          {chain.reduceRight<ReactNode>(
            (inner, c) => (
              <li key={c.id}>
                {box(c)}
                <ul>{inner}</ul>
              </li>
            ),
            row.map(item),
          )}
        </ul>,
      ]
    : row.map((m) => (
        <ul key={m.id} className="org-tree">
          {item(m)}
        </ul>
      ));

  return (
    <section aria-labelledby="organigramme" className="mb-8">
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 id="organigramme" className="text-ui font-semibold text-fg">
          {t('chartTitle')}
        </h2>
        {!focus.self && (
          <Button variant="ghost" size="sm" onClick={() => setFocusId(null)}>
            {t('chartBack')}
          </Button>
        )}
      </div>
      {/* le défilement reste dans la carte : la page ne défile jamais en largeur */}
      <GlassCard className="overflow-x-auto p-5">
        <div className="flex w-max min-w-full flex-wrap justify-center gap-x-6 gap-y-8">
          {trees}
        </div>
      </GlassCard>
    </section>
  );
}

function Box({
  member: m,
  reports,
  focused,
  href,
  onSelect,
}: {
  member: ChartMember;
  reports: number;
  focused: boolean;
  href?: string;
  onSelect: () => void;
}) {
  const t = useTranslations('team');
  const o = useTranslations('onboarding');
  const role = [
    m.job && o(jobLabelKey(m.department, m.job)),
    m.department && o(departmentLabelKey(m.department)),
  ]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <>
      <span className="block truncate text-ui font-medium text-fg">
        {m.name}
        {m.self && <span className="font-normal text-muted"> · {t('you')}</span>}
      </span>
      {role && <span className="mt-0.5 block truncate text-label text-muted">{role}</span>}
      {reports > 0 && (
        <span className="mt-0.5 block text-label text-muted">
          {t('chartReports', { count: reports })}
        </span>
      )}
    </>
  );
  const props = {
    ref: focused ? keepInView : undefined,
    onClick: onSelect,
    'aria-current': focused ? ('true' as const) : undefined,
    className: cn(
      'relative z-[1] block w-40 rounded-field border px-3 py-2 text-center transition-colors duration-200 hover:bg-hover',
      focused ? 'border-accent-line bg-ink shadow-hi' : 'border-line bg-surface',
    ),
  };
  return href ? (
    <Link href={href} scroll={false} {...props}>
      {body}
    </Link>
  ) : (
    <button type="button" {...props}>
      {body}
    </button>
  );
}

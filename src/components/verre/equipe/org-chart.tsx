'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { GlassCard } from '@/components/verre';
import { departmentLabelKey, jobLabelKey } from '@/lib/onboarding';
import { cn } from '@/lib/verre';
import type { MemberRow } from '@/server/auth/members';

export type ChartMember = Pick<
  MemberRow,
  'id' | 'name' | 'managerId' | 'department' | 'job' | 'self'
>;

// Les racines : sans manager, ou rattachées à quelqu'un qui n'est plus là. Celles qui ont une équipe d'abord.
export function chartRoots(members: ChartMember[]) {
  const ids = new Set(members.map((m) => m.id));
  const children = new Map<string, ChartMember[]>();
  for (const m of members)
    if (m.managerId && ids.has(m.managerId))
      children.set(m.managerId, [...(children.get(m.managerId) ?? []), m]);
  const byName = (a: ChartMember, b: ChartMember) => a.name.localeCompare(b.name, 'fr');
  for (const list of children.values()) list.sort(byName);
  const roots = members
    .filter((m) => !m.managerId || !ids.has(m.managerId))
    .sort((a, b) => Number(children.has(b.id)) - Number(children.has(a.id)) || byName(a, b));
  return { roots, children };
}

/**
 * L'organigramme de toute l'organisation, en boîtes et traits (.org-tree, globals.css). Il ne montre que ce que la
 * liste des membres montre déjà : qui est rattaché à qui, et le poste pour un propriétaire ou un administrateur. Une
 * personne sous le lecteur mène à sa fiche.
 */
export function OrgChart({ members, under }: { members: ChartMember[]; under: string[] }) {
  const t = useTranslations('team');
  const { roots, children } = chartRoots(members);
  const reachable = new Set(under);
  const tree = useRef<HTMLDivElement>(null);
  // Une fois, à l'ouverture : la carte défile jusqu'au milieu, le haut de l'arbre en vue sur un écran étroit.
  useEffect(() => {
    const card = tree.current?.parentElement;
    if (card) card.scrollLeft = (card.scrollWidth - card.clientWidth) / 2;
  }, []);

  const node = (m: ChartMember) => {
    const kids = children.get(m.id);
    return (
      <li key={m.id}>
        <Box member={m} href={reachable.has(m.id) ? `/equipe?personne=${m.id}` : undefined} />
        {kids && <ul>{kids.map(node)}</ul>}
      </li>
    );
  };

  return (
    <section aria-labelledby="organigramme" className="mb-8">
      <h2 id="organigramme" className="mb-3 text-ui font-semibold text-fg">
        {t('chartTitle')}
      </h2>
      {/* le défilement reste dans la carte : la page ne défile jamais en largeur */}
      <GlassCard className="overflow-x-auto p-5">
        <div ref={tree} className="flex w-max min-w-full flex-wrap justify-center gap-x-6 gap-y-8">
          {roots.map((root) => (
            <ul key={root.id} className="org-tree">
              {node(root)}
            </ul>
          ))}
        </div>
      </GlassCard>
    </section>
  );
}

function Box({ member: m, href }: { member: ChartMember; href?: string }) {
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
    </>
  );
  const box = cn(
    'relative z-[1] block w-40 rounded-field border bg-surface px-3 py-2 text-center',
    m.self ? 'border-accent-line' : 'border-line',
  );
  return href ? (
    <Link
      href={href}
      scroll={false}
      className={cn(box, 'transition-colors duration-200 hover:bg-hover')}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

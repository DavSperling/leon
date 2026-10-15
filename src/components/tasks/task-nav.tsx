'use client';

import { ListChecks, ListFilter, type LucideIcon, Settings, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { formatNumber } from '@/lib/format';
import { projectHref, viewHref } from '@/lib/tasks/task-links';
import { cn } from '@/lib/utils';

type NavProject = { id: string; key: string; name: string; openCount: number };
type NavView = { id: string; name: string };
type TaskNavProps = { projects: NavProject[]; personalViews: NavView[]; teamViews: NavView[] };

type NavKey = 'mine' | 'all' | `project:${string}` | `view:${string}`;

export const FIXED_ITEMS: Array<{ key: NavKey; href: string; label: string; icon: LucideIcon }> = [
  { key: 'mine', href: '/taches?assigne=moi', label: 'Mes tâches', icon: UserRound },
  { key: 'all', href: '/taches', label: 'Toutes les tâches', icon: ListChecks },
];

export const SETTINGS_HREF = '/taches/reglages';

const Uuid = z.uuid();

// Comme la liste, qui ignore un identifiant invalide : il ne désigne alors aucune entrée.
function uuidParam(params: URLSearchParams, name: string): string | null {
  const raw = params.get(name);
  return raw !== null && Uuid.safeParse(raw).success ? raw.toLowerCase() : null;
}

// L'URL décrit l'affichage : l'entrée de navigation courante s'en déduit, la vue enregistrée et le
// projet d'abord, puis « Mes tâches » (assignées, créées, activité). Hors de la liste (page d'une
// tâche, réglages), aucune n'est courante.
export function currentNavKey(pathname: string, params: URLSearchParams): NavKey | null {
  if (pathname !== '/taches') return null;
  const view = uuidParam(params, 'vue');
  if (view) return `view:${view}`;
  const project = uuidParam(params, 'projet');
  if (project) return `project:${project}`;
  const mine =
    params.get('assigne') === 'moi' ||
    params.get('createur') === 'moi' ||
    params.get('onglet') === 'activite';
  return mine ? 'mine' : 'all';
}

type NavLinkProps = {
  href: string;
  current: boolean;
  icon: ReactNode;
  label: string;
  openCount?: number;
};

function NavLink({ href, current, icon, label, openCount = 0 }: NavLinkProps) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm text-foreground-2 transition-colors hover:bg-accent hover:text-foreground',
          current && 'bg-accent font-medium text-foreground',
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {openCount > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatNumber(openCount)}
            <span className="sr-only"> {openCount > 1 ? 'tâches ouvertes' : 'tâche ouverte'}</span>
          </span>
        )}
      </Link>
    </li>
  );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="px-2.5 pt-5 pb-1.5 text-xs font-medium text-muted-foreground">{title}</h2>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function ViewSection({
  title,
  views,
  current,
}: {
  title: string;
  views: NavView[];
  current: NavKey | null;
}) {
  if (views.length === 0) return null;
  return (
    <NavSection title={title}>
      {views.map((view) => (
        <NavLink
          key={view.id}
          href={viewHref(view.id)}
          current={current === `view:${view.id}`}
          icon={<ListFilter size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />}
          label={view.name}
        />
      ))}
    </NavSection>
  );
}

// Colonne de gauche des pages de tâches : Mes tâches, Toutes les tâches, puis les projets (avec
// leurs tâches ouvertes) et les vues enregistrées, personnelles d'abord ; les réglages en dernier.
export function TaskNav({ projects, personalViews, teamViews }: TaskNavProps) {
  const pathname = usePathname();
  const current = currentNavKey(pathname, useSearchParams());
  return (
    <nav aria-label="Navigation des tâches" className="px-3">
      <ul className="space-y-0.5">
        {FIXED_ITEMS.map(({ key, href, label, icon: Icon }) => (
          <NavLink
            key={key}
            href={href}
            current={current === key}
            icon={<Icon size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />}
            label={label}
          />
        ))}
      </ul>
      <NavSection title="Projets">
        {projects.map((project) => (
          <NavLink
            key={project.id}
            href={projectHref(project.id)}
            current={current === `project:${project.id}`}
            icon={
              <span className="min-w-8 shrink-0 font-mono text-xs text-muted-foreground">
                {project.key}
              </span>
            }
            label={project.name}
            openCount={project.openCount}
          />
        ))}
      </NavSection>
      <ViewSection title="Mes vues" views={personalViews} current={current} />
      <ViewSection title="Vues de l’équipe" views={teamViews} current={current} />
      <ul className="mt-5 border-t pt-3">
        <NavLink
          href={SETTINGS_HREF}
          current={pathname === SETTINGS_HREF}
          icon={<Settings size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />}
          label="Réglages"
        />
      </ul>
    </nav>
  );
}

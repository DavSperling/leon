import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { CommandSearch } from '@/components/command-search';
import { Panel } from '@/components/panel';
import { TaskNav } from '@/components/tasks/task-nav';
import { requireUserContext } from '@/server/auth/session';
import { getViewerProfile } from '@/server/auth/viewer';
import { buildBriefing } from '@/server/memory/briefing';
import { ensureDefaultProject, listProjects } from '@/server/tasks/projects';
import { countOpenByProject } from '@/server/tasks/task-list';
import { listViews, type ViewRow } from '@/server/tasks/views';

// La navigation n'a besoin que du nom et de l'identifiant : la configuration d'une vue ne part pas au client.
const navViews = (views: ViewRow[], team: boolean) =>
  views.filter((view) => view.team === team).map(({ id, name }) => ({ id, name }));

export default async function TasksLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUserContext();
  const profile = await getViewerProfile(ctx);
  // Le projet par défaut naît à la première visite : la navigation le liste ensuite.
  await ensureDefaultProject(ctx, profile.organizationName);
  const [briefing, projects, openCounts, views] = await Promise.all([
    buildBriefing(ctx),
    listProjects(ctx),
    countOpenByProject(ctx),
    listViews(ctx),
  ]);
  return (
    <AppShell
      organizationName={profile.organizationName}
      userName={profile.userName}
      userEmail={profile.email}
      reviewCount={briefing.reviewCount}
      search={<CommandSearch />}
      column={
        <Panel label="Tâches" title="Tâches">
          <TaskNav
            projects={projects.map((project) => ({
              ...project,
              openCount: openCounts[project.id] ?? 0,
            }))}
            personalViews={navViews(views, false)}
            teamViews={navViews(views, true)}
          />
        </Panel>
      }
    >
      {children}
    </AppShell>
  );
}

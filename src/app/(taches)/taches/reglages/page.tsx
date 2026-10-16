import type { Metadata } from 'next';
import { z } from 'zod';
import { ListBreadcrumb } from '@/components/tasks/list-breadcrumb';
import { projectStatuses } from '@/components/tasks/list-context';
import { LabelSettings } from '@/components/tasks/settings/label-settings';
import { ProjectSettings } from '@/components/tasks/settings/project-settings';
import { StatusSettings } from '@/components/tasks/settings/status-settings';
import { SETTINGS_PROJECT_PARAM } from '@/lib/tasks/task-links';
import { requireUserContext } from '@/server/auth/session';
import { listLabels } from '@/server/tasks/labels';
import { listProjects } from '@/server/tasks/projects';
import { listStatuses } from '@/server/tasks/statuses';

export const metadata: Metadata = { title: 'Réglages des tâches' };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Projets, statuts du projet choisi (`?projet=`, le premier à défaut), étiquettes. Un identifiant
// absent, mal formé ou inconnu donne le premier projet.
export default async function TaskSettingsPage({ searchParams }: PageProps) {
  const [params, ctx] = await Promise.all([searchParams, requireUserContext()]);
  const [projects, statuses, labels] = await Promise.all([
    listProjects(ctx),
    listStatuses(ctx),
    listLabels(ctx),
  ]);
  const wanted = z.uuid().safeParse([params[SETTINGS_PROJECT_PARAM]].flat()[0]);
  const project = projects.find((p) => wanted.success && p.id === wanted.data) ?? projects[0];
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex min-h-12 items-center border-b bg-card px-5 py-2">
        <ListBreadcrumb title="Réglages" />
      </header>
      <div className="mx-auto w-full max-w-[720px] space-y-10 px-5 py-8">
        <ProjectSettings projects={projects} />
        {project && (
          <StatusSettings
            projects={projects}
            projectId={project.id}
            statuses={projectStatuses(statuses, project.id)}
          />
        )}
        <LabelSettings labels={labels} />
      </div>
    </div>
  );
}

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { taskHref } from '@/lib/tasks/task-links';
import type { TaskDetail } from '@/server/tasks/tasks';

type TaskHeaderProps = {
  task: Pick<TaskDetail, 'ref' | 'projectId' | 'projectKey' | 'parent'>;
  back: string; // la liste d'où l'on vient
  listQuery: string; // sa requête, que le lien du parent reprend
};

// En-tête collant : retour à la liste, puis le fil d'Ariane « LEO / LEO-3 / LEO-12 » (projet,
// parent s'il y en a un, tâche).
export function TaskHeader({ task, back, listQuery }: TaskHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex min-h-12 items-center gap-2 border-b bg-card px-5 py-2">
      <Button asChild variant="ghost" size="icon-sm" className="-ml-1.5 text-muted-foreground">
        <Link href={back} aria-label="Retour à la liste">
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </Button>
      <Breadcrumb aria-label="Fil d’Ariane">
        <BreadcrumbList className="gap-1.5 sm:gap-1.5">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/taches?projet=${task.projectId}`} className="font-mono text-xs">
                {task.projectKey}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {task.parent && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={taskHref(task.parent.ref, listQuery)} className="font-mono text-xs">
                    {task.parent.ref}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono text-xs">{task.ref}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TaskProperties } from '@/components/tasks/task-properties';
import { TaskTitle } from '@/components/tasks/task-title';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { requireUserContext } from '@/server/auth/session';
import { getTaskByRef } from '@/server/tasks/tasks';

export const metadata: Metadata = { title: 'Tâche' };

// Version minimale : le titre et les propriétés en lecture. La page complète vient ensuite.
// Une référence mal formée, inconnue ou invisible donne la même réponse.
export default async function TaskPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const ctx = await requireUserContext();
  const task = await getTaskByRef(ctx, ref);
  if (!task) notFound();

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6 px-10 pt-10 pb-20">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/taches">Tâches</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {task.parent && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/taches/${task.parent.ref}`}>{task.parent.ref}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{task.ref}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-2xl leading-8 font-semibold tracking-tight">
        <TaskTitle title={task.title} />
      </h1>
      <TaskProperties task={task} now={new Date()} />
    </div>
  );
}

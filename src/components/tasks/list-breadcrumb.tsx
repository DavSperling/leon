import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

// Le fil d'Ariane des listes : « Tâches / <nom de la liste> ».
export function ListBreadcrumb({ title }: { title: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1.5 sm:gap-1.5">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/taches">Tâches</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <h1 aria-current="page" className="text-sm font-medium text-foreground">
            {title}
          </h1>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

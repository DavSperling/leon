import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Le haut de chaque page : un nom à 24 px, une phrase sur ce qu'on y trouve, et les actions à droite s'il y en a.
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex items-start justify-between gap-6', className)}>
      <div className="min-w-0">
        <h1 className="text-[24px] leading-8 font-medium tracking-[-0.01em]">{title}</h1>
        {description && (
          <p className="mt-1 text-[14px] leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

// La largeur commune des pages : une gouttière de 40 px, un plafond à 1240 px.
export const PAGE = 'mx-auto w-full max-w-[1240px] px-10 pt-9 pb-24';

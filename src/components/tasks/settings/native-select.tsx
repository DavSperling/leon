import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Un `select` natif : liste courte, clavier et lecteurs d'écran pris en charge sans rien ajouter.
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Touche de clavier : « ⌘K », « ↵ », « esc ». Décorative par défaut (aria-hidden) : dites le raccourci en toutes lettres ailleurs. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      aria-hidden="true"
      className={cn('inline-grid h-[18px] min-w-[18px] place-items-center rounded-[6px] border border-line-strong bg-glass-3 px-[5px] font-mono text-[10.5px] leading-none font-medium tracking-normal text-muted', className)}
      {...props}
    />
  );
}

/** « ⌘ » sur Mac, « Ctrl » ailleurs. */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ';

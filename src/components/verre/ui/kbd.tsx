'use client';

import { type ComponentProps, useSyncExternalStore } from 'react';
import { cn } from '@/lib/verre/cn';

/** Touche de clavier : « ⌘K », « ↵ », « esc ». Décorative par défaut (aria-hidden) : dites le raccourci en toutes lettres ailleurs. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: un <kbd> n'est pas focalisable
    <kbd
      aria-hidden="true"
      className={cn(
        'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-chip border border-b-2 border-line bg-n-50 px-1.5 font-sans text-label leading-none font-medium text-fg-2 tabular-nums',
        className,
      )}
      {...props}
    />
  );
}

const noop = () => () => {};
const readModKey = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ');

/** « ⌘ » sur Mac, « Ctrl » ailleurs ; « ⌘ » au rendu serveur, corrigé à l'hydratation. */
export const useModKey = (): string => useSyncExternalStore(noop, readModKey, () => '⌘');

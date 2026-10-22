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
        'inline-grid h-[18px] min-w-[18px] place-items-center rounded-[6px] border border-line-strong bg-glass-3 px-[5px] font-mono text-[10.5px] leading-none font-medium tracking-normal text-muted',
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

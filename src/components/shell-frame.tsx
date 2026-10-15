'use client';

import { PanelLeft } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { railCookie } from '@/lib/rail-cookie';
import { cn } from '@/lib/utils';

type ShellFrameProps = { rail: ReactNode; panel: ReactNode; defaultRailOpen: boolean };

type Target = { tagName?: string; isContentEditable?: boolean } | null;

// Un champ ou un éditeur a le focus : une touche y est du texte, pas un raccourci.
export function isTypingTarget(target: Target): boolean {
  if (!target) return false;
  return (
    target.isContentEditable === true ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName ?? '')
  );
}

// ⌘B (Ctrl+B hors Mac) : `event.key` reste « b » sur un clavier AZERTY.
export function isRailShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): boolean {
  const modifier = event.metaKey || event.ctrlKey;
  return modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b';
}

// Bandeau du haut (marque, bouton qui replie la barre latérale) et disposition barre + panneau.
// L'état replié vient du cookie lu par le serveur et y est réécrit à chaque changement.
export function ShellFrame({ rail, panel, defaultRailOpen }: ShellFrameProps) {
  const [railOpen, setRailOpen] = useState(defaultRailOpen);

  useEffect(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: simple préférence que le serveur relit ; pas de dépendance à l'API Cookie Store
    document.cookie = railCookie(railOpen);
  }, [railOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isRailShortcut(event) || isTypingTarget(event.target as HTMLElement | null)) return;
      event.preventDefault();
      setRailOpen((open) => !open);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleLabel = railOpen ? 'Replier la barre latérale' : 'Déplier la barre latérale';
  return (
    <div className="flex h-dvh min-w-5xl flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-3 px-5">
        <span className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full bg-foreground text-[13px] font-bold text-background"
          >
            L
          </span>
          Leon
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={toggleLabel}
              aria-expanded={railOpen}
              aria-controls="barre-laterale"
              aria-keyshortcuts="Meta+B Control+B"
              onClick={() => setRailOpen(!railOpen)}
              className={cn(
                'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[margin,color,background-color] duration-300 ease-out hover:bg-accent hover:text-foreground',
                railOpen ? 'ml-[148px]' : 'ml-2',
              )}
            >
              <PanelLeft size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {toggleLabel}
            <Kbd>⌘B</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex min-h-0 flex-1 px-2 pb-2">
        <div
          id="barre-laterale"
          inert={!railOpen}
          className={cn(
            'shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-out',
            railOpen ? 'w-[256px] opacity-100' : 'w-0 opacity-0',
          )}
        >
          <div className="w-[248px] pt-3 pl-1">{rail}</div>
        </div>
        {panel}
      </div>
    </div>
  );
}

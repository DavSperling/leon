'use client';

import { PanelLeft } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';

type ShellFrameProps = { rail: ReactNode; panel: ReactNode };

// Bandeau du haut (marque, bouton qui replie la barre latérale) et disposition barre + panneau.
export function ShellFrame({ rail, panel }: ShellFrameProps) {
  const [railOpen, setRailOpen] = useState(true);
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
        <button
          type="button"
          aria-label={railOpen ? 'Replier la barre latérale' : 'Déplier la barre latérale'}
          aria-expanded={railOpen}
          aria-controls="barre-laterale"
          onClick={() => setRailOpen(!railOpen)}
          className={cn(
            'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[margin,color,background-color] duration-300 ease-out hover:bg-accent hover:text-foreground',
            railOpen ? 'ml-[148px]' : 'ml-2',
          )}
        >
          <PanelLeft size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
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

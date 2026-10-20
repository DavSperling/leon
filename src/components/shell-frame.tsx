'use client';

import { PanelLeft } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';

type ShellFrameProps = { rail: ReactNode; panel: ReactNode };

// La marque : une pile de fiches, la dernière dans la teinte des renvois (ce que Leon garde, et d'où il le tient).
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <rect x="2" y="2" width="3" height="16" rx="1" className="fill-foreground" />
      <rect x="7" y="5" width="11" height="3" rx="1" className="fill-foreground" />
      <rect x="7" y="10" width="8" height="3" rx="1" className="fill-foreground" />
      <rect x="7" y="15" width="5" height="3" rx="1" className="fill-cite" />
    </svg>
  );
}

function RailToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={open ? 'Replier la barre latérale' : 'Déplier la barre latérale'}
      aria-expanded={open}
      aria-controls="barre-laterale"
      onClick={onToggle}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <PanelLeft size={16} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}

// Barre latérale sur le fond de la page, séparée de la page par un seul filet ; la page est blanche et pleine hauteur.
export function ShellFrame({ rail, panel }: ShellFrameProps) {
  const [railOpen, setRailOpen] = useState(true);
  const toggle = () => setRailOpen(!railOpen);
  return (
    <div className="flex h-dvh min-w-5xl bg-background">
      <div
        id="barre-laterale"
        inert={!railOpen}
        className={cn(
          'shrink-0 overflow-hidden border-r transition-[width,opacity] duration-200 ease-out',
          railOpen ? 'w-[240px] opacity-100' : 'w-0 border-r-0 opacity-0',
        )}
      >
        <div className="flex h-full w-[240px] flex-col px-3 pb-3">
          <div className="flex h-14 shrink-0 items-center justify-between pl-2">
            <span className="flex items-center gap-2 text-[16px] font-medium tracking-[-0.01em]">
              <Mark />
              Leon
            </span>
            <RailToggle open={railOpen} onToggle={toggle} />
          </div>
          {rail}
        </div>
      </div>
      <div className="relative flex min-w-0 flex-1 bg-card">
        {!railOpen && (
          <div className="absolute top-3 left-3 z-10">
            <RailToggle open={railOpen} onToggle={toggle} />
          </div>
        )}
        {panel}
      </div>
    </div>
  );
}

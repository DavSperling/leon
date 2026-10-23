import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/verre/cn';
import { MAQUETTES, type MaquetteNumber } from './maquettes';

/** Barre flottante des pages /maquettes/<n> : passer d'une maquette à l'autre, revenir à la comparaison. */
export function MaquetteSwitcher({ current }: { current: MaquetteNumber }) {
  return (
    <nav
      aria-label="Maquettes de l’accueil"
      className="site-maquette-switcher pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line-strong bg-float p-1.5 shadow-float backdrop-blur-[28px]">
        <Link
          href="/maquettes"
          aria-label="Comparer les maquettes"
          title="Comparer les maquettes"
          className="inline-grid size-10 place-items-center rounded-full text-fg-2 transition-colors hover:bg-hover hover:text-fg"
        >
          <LayoutGrid aria-hidden="true" strokeWidth={1.7} className="size-4" />
        </Link>
        {MAQUETTES.map((m) => (
          <Link
            key={m.n}
            href={`/maquettes/${m.n}`}
            aria-current={m.n === current ? 'page' : undefined}
            className={cn(
              'inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-full px-3.5 text-label font-semibold text-fg-2 transition-colors hover:bg-hover hover:text-fg sm:px-4',
              'aria-[current=page]:bg-accent aria-[current=page]:text-accent-ink',
            )}
          >
            <span className="font-mono text-[11px] opacity-80">{m.n}</span>
            <span className="max-[420px]:sr-only">{m.name}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

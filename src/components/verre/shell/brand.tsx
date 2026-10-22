import { cn } from '@/lib/verre/cn';

/** Pastille « L » en dégradé accent → sarcelle. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full bg-[linear-gradient(140deg,var(--accent),var(--logo-2))] text-[12.5px] font-extrabold text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_0_0_1px_var(--line)]',
        className,
      )}
    >
      L
    </span>
  );
}

// La pastille de version de la maquette n'est pas reprise : l'appli n'expose pas de numéro de version.
export function Brand() {
  return (
    <div className="flex h-9 items-center gap-2.5 px-1.5 text-[15.5px] font-bold tracking-[-0.02em]">
      <Logo />
      Leon
    </div>
  );
}

/** Initiale de l'organisation, dans la pastille du menu du compte. */
export const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase();

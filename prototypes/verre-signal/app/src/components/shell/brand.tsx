import { ORG } from '@/data/people';
import { cn } from '@/lib/cn';

/** Pastille « L » en dégradé accent → sarcelle. */
export function Logo({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('grid size-6 shrink-0 place-items-center rounded-full bg-[linear-gradient(140deg,var(--accent),var(--logo-2))] text-[12.5px] font-extrabold text-accent-ink shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_0_0_1px_var(--line)]', className)}>
      L
    </span>
  );
}

export function Brand({ withVersion = true }: { withVersion?: boolean }) {
  return (
    <div className="flex h-9 items-center gap-2.5 px-1.5 text-[15.5px] font-bold tracking-[-0.02em]">
      <Logo />
      Leon
      {withVersion && <span className="ml-auto rounded-full border border-line px-[7px] py-1 font-mono text-[10.5px] leading-none font-medium tracking-normal text-muted">{ORG.version}</span>}
    </div>
  );
}

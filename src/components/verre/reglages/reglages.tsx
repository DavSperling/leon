import type { ReactNode } from 'react';

export const INLINE =
  'rounded-[6px] border border-line bg-glass-3 px-1.5 py-px font-mono text-[12.5px] tracking-normal whitespace-nowrap text-fg';
// Les sections défilent jusqu'à leur titre sous la barre mobile (56 px) ou en haut du panneau (/reglages#extension).
export const SECTION = 'mt-12 first:mt-0 scroll-mt-20 shell:scroll-mt-6';

export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden="true"
        className="mt-[1px] grid size-6 place-items-center rounded-full border border-line-strong font-mono text-[11px] tracking-normal text-fg-2"
      >
        {n}
      </span>
      <p className="text-body leading-[1.65] text-fg-2">
        <span className="sr-only">{n}. </span>
        {children}
      </p>
    </li>
  );
}

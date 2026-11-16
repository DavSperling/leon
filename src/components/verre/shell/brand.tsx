import { cn } from '@/lib/verre/cn';

function ColorBars() {
  return (
    <g transform="rotate(-5 20 20)" fill="none" strokeLinecap="round" strokeWidth="4.5">
      <path data-brand-stroke="1" d="M6 9H29" stroke="var(--stroke-1)" />
      <path data-brand-stroke="2" d="M7 20H35" stroke="var(--stroke-2)" />
      <path data-brand-stroke="3" d="M9 31H27" stroke="var(--stroke-3)" />
    </g>
  );
}

/** Le symbole seul : les trois barres colorées, carré pour les petites tailles. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={cn('size-6 shrink-0', className)}
    >
      <ColorBars />
    </svg>
  );
}

/** Le logo « Leon » en entier ; son nom accessible est « Leon ». */
export function Brand({ className }: { className?: string }) {
  return (
    <svg
      viewBox="124 140 616 170"
      // Barre latérale repliée : les trois barres restent visibles, le mot est coupé sans rapetisser.
      preserveAspectRatio="xMinYMid slice"
      role="img"
      aria-label="Leon"
      className={cn('h-5 w-auto shrink-0 select-none text-fg', className)}
    >
      <g transform="translate(124 126) scale(5)">
        <ColorBars />
      </g>
      <text
        x={390}
        y={272}
        fill="currentColor"
        fontSize={132}
        fontWeight={500}
        letterSpacing={-2}
        style={{ fontFamily: "var(--font-inter), 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
      >
        Leon
      </text>
    </svg>
  );
}

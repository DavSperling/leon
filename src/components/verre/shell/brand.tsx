import { cn } from '@/lib/verre/cn';

// Tracé repris tel quel du logo fourni (leon-logo-noir.svg, novembre 2026) ; unités : celles de son viewBox. Trois traits
// qui se rejoignent dans le point, tout en couleur du texte (noir en clair, blanc en sombre). Même dessin dans
// src/app/icon.svg. Le mot « Leon » est en Inter 500, chargée dans src/app/layout.tsx.
const FORK = 'M140 157C196 157 236 226 300 226M140 226H300M140 294C196 294 236 226 300 226';

function Fork() {
  return (
    <>
      <path d={FORK} fill="none" stroke="currentColor" strokeWidth={17} strokeLinecap="round" />
      <circle cx={313} cy={226} r={17} fill="currentColor" />
    </>
  );
}

/** Le symbole seul (les trois traits et leur point), carré : pastilles et petites tailles. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="131 126 200 200"
      aria-hidden="true"
      className={cn('size-6 shrink-0 text-fg', className)}
    >
      <Fork />
    </svg>
  );
}

// La pastille de version de la maquette n'est pas reprise : l'appli n'expose pas de numéro de version.
/** Le logo « Leon » en entier ; son nom accessible est « Leon ». */
export function Brand({ className }: { className?: string }) {
  return (
    <svg
      viewBox="124 140 616 170"
      // plus étroit que le logo (barre latérale qui se replie), il est coupé à droite comme un libellé, sans rapetisser
      preserveAspectRatio="xMinYMid slice"
      role="img"
      aria-label="Leon"
      className={cn('h-5 w-auto shrink-0 select-none text-fg', className)}
    >
      <Fork />
      <text
        x={432}
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

/** Initiale de l'organisation, dans la pastille du menu du compte. */
export const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase();

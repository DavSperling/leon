import { cn } from '@/lib/verre/cn';

// Tracé d'après le logo fourni (2000 px de large) ; unités : ses pixels, origine en haut à gauche du « L ». La fourche
// remplace le « e » : deux courbes et un trait qui se rejoignent dans le point. Le point suit --logo-2 (la même sarcelle
// que le logo, en clair comme en sombre), le reste suit la couleur du texte. Même dessin dans src/app/icon.svg.
const FORK =
  'M130.3 75.6C188.2 75.6 186.7 129.6 234.1 129.6M130.3 183.6C188.2 183.6 186.7 129.6 234.1 129.6M130.3 129.6H258.6';
const LETTERS =
  'M0 0h32.7v163h90.8v29.8H0zM441.8 124.7C441.8 80.8 414 52.8 370.6 52.8C327.2 52.8 299.4 80.8 299.4 124.7C299.4 168.6 327.2 196.6 370.6 196.6C414 196.6 441.8 168.6 441.8 124.7zM410.1 124.7C410.1 97.5 395.1 80.8 370.6 80.8C346.1 80.8 331.1 97.5 331.1 124.7C331.1 151.9 346.1 168.6 370.6 168.6C395.1 168.6 410.1 151.9 410.1 124.7zM464.3 192.8V56.6h31.6v22.6C505.9 69.3 509.5 54.2 541.9 54.2C575.7 54.2 594.7 80 594.7 110.1v82.7h-31.2v-83.4C563.5 90.3 548.3 80.5 531 80.5C515 80.5 495.9 95.5 495.9 115v77.8z';

function Fork() {
  return (
    <>
      <path d={FORK} fill="none" stroke="currentColor" strokeWidth={19.3} />
      <circle cx={258.6} cy={129.6} r={20.8} className="fill-logo-2" />
    </>
  );
}

/** Le symbole seul (la fourche et son point), carré : pastilles et petites tailles. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="125 50 160 160"
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
      viewBox="0 0 595 197"
      // plus étroit que le logo (barre latérale qui se replie), il est coupé à droite comme un libellé, sans rapetisser
      preserveAspectRatio="xMinYMid slice"
      role="img"
      aria-label="Leon"
      className={cn('h-5 w-auto shrink-0 text-fg', className)}
    >
      <Fork />
      <path d={LETTERS} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/** Initiale de l'organisation, dans la pastille du menu du compte. */
export const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase();

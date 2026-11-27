import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/verre/cn';
import type { AgentId } from '@/server/portrait/agents';
import type { FlagTone } from '../ui/marks';

// Le personnage d'un agent : une tête et des épaules, des formes à plat, deux couleurs. Chacun a sa tête et ce qu'il
// porte (un crayon sur l'oreille, un casque-micro, des lunettes et un nœud papillon, deux antennes, un soleil qui se
// lève), et son propre badge au cou. Son état ne se dessine pas ici : la classe de son parent le dit (kit.css, .af) :
// `is-on` éveillé, en couleur, il cligne des yeux ; sans elle il dort ; `is-soon` une silhouette sans visage.
// Décoratif : le nom et l'état sont écrits à côté.

/** La seconde couleur de chaque agent : ses accessoires. La première est son drapeau (sheet.tsx, TONE). */
const SECOND: Record<AgentId, FlagTone> = {
  'suite-reunion': 1,
  'brouillon-reponse': 4,
  'brief-rendez-vous': 3,
  relance: 2,
  'point-du-jour': 4,
};

type Look = {
  /** Où sont ses yeux : leur hauteur, et leur écart au milieu. */
  ey: number;
  dx: number;
  head: ReactNode;
  /** Ce qu'il porte : derrière la tête, devant la tête, sur le visage. */
  back?: ReactNode;
  front?: ReactNode;
  onFace?: ReactNode;
  /** Le nœud papillon prend la place du badge au cou. */
  noBadge?: boolean;
};

const LOOK: Record<AgentId, Look> = {
  'brouillon-reponse': {
    ey: 56,
    dx: 17,
    head: <rect className="af__sk" x="36" y="20" width="88" height="72" rx="26" />,
    back: (
      <>
        <path className="af__ln" d="M80 20V8" />
        <circle className="af__ac" cx="80" cy="5" r="5.5" />
      </>
    ),
    front: (
      <g transform="rotate(28 126 44)">
        <rect className="af__ac" x="121" y="22" width="10" height="30" rx="2" />
        <path className="af__sk" d="M121 52h10l-5 9Z" />
      </g>
    ),
  },
  'suite-reunion': {
    ey: 55,
    dx: 16,
    head: <ellipse className="af__sk" cx="80" cy="56" rx="42" ry="38" />,
    back: <path className="af__ln" d="M36 56a44 44 0 0 1 88 0" />,
    front: (
      <>
        <rect className="af__ac" x="28" y="44" width="15" height="26" rx="7" />
        <rect className="af__ac" x="117" y="44" width="15" height="26" rx="7" />
        <path className="af__ln" d="M36 70v4a16 16 0 0 0 16 16h4" />
        <circle className="af__ac" cx="60" cy="90" r="4.5" />
      </>
    ),
  },
  'brief-rendez-vous': {
    ey: 54,
    dx: 17,
    head: <rect className="af__sk" x="42" y="16" width="76" height="76" rx="18" />,
    back: (
      <>
        <rect className="af__ac" x="33" y="42" width="11" height="22" rx="4" />
        <rect className="af__ac" x="116" y="42" width="11" height="22" rx="4" />
      </>
    ),
    front: <path className="af__ac" d="M80 113l-15-9v18ZM80 113l15-9v18Z" />,
    onFace: (
      <path
        className="af__ln"
        d="M51 54a12 12 0 1 0 24 0a12 12 0 1 0-24 0M85 54a12 12 0 1 0 24 0a12 12 0 1 0-24 0M75 54h10"
      />
    ),
    noBadge: true,
  },
  relance: {
    ey: 58,
    dx: 22,
    head: <rect className="af__sk" x="28" y="28" width="104" height="62" rx="31" />,
    back: (
      <>
        <path className="af__ln" d="M60 30l-7-15M100 30l7-15" />
        <circle className="af__ac" cx="52" cy="12" r="5.5" />
        <circle className="af__ac" cx="108" cy="12" r="5.5" />
      </>
    ),
  },
  'point-du-jour': {
    ey: 60,
    dx: 17,
    head: (
      <path className="af__sk" d="M38 84V60a42 42 0 0 1 84 0v24a8 8 0 0 1-8 8H46a8 8 0 0 1-8-8Z" />
    ),
    back: (
      <>
        <path className="af__ln" d="M80 -2v-7M60 4l-5-6M100 4l5-6" />
        <path className="af__ac" d="M63 19a17 17 0 0 1 34 0Z" />
      </>
    ),
  },
};

/** Le personnage d'un agent ; sans `agent`, la silhouette de ceux qu'on construira soi-même. */
export function AgentFace({ agent, className }: { agent?: AgentId; className?: string }) {
  const look = agent && LOOK[agent];
  return (
    <svg
      aria-hidden="true"
      className={cn('af', className)}
      viewBox="0 -12 160 156"
      style={look && ({ '--af-2': `var(--f${SECOND[agent]})` } as CSSProperties)}
    >
      <rect className="af__bo" x="68" y="86" width="24" height="24" />
      <path className="af__bo" d="M18 150v-14a36 36 0 0 1 36-36h52a36 36 0 0 1 36 36v14Z" />
      {look && !look.noBadge && (
        <rect className="af__ac" x="71" y="121" width="18" height="15" rx="3" />
      )}
      <g className="af__hd">
        {look ? (
          <>
            {look.back}
            {look.head}
            {look.front}
            <g className="af__face">
              <g className="af__eyes">
                {[-look.dx, look.dx].map((d) => (
                  <g key={d}>
                    <circle className="af__eye" cx={80 + d} cy={look.ey} r="7.5" />
                    <circle className="af__glint" cx={82.4 + d} cy={look.ey - 2.6} r="2.3" />
                  </g>
                ))}
              </g>
              {look.onFace}
              <path className="af__ln af__mouth" d={`M73 ${look.ey + 13}q7 7 14 0`} />
            </g>
          </>
        ) : (
          <ellipse className="af__sk" cx="80" cy="56" rx="42" ry="38" />
        )}
      </g>
    </svg>
  );
}

// Un agent éveillé suit le pointeur des yeux, de trois unités au plus. Une seule écoute pour toute la page, une
// lecture par image ; rien en mouvement réduit.
export function followPointer(): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  let frame = 0;
  const move = (event: PointerEvent) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const eyes of document.querySelectorAll<SVGGElement>('.is-on .af__eyes')) {
        const box = eyes.getBoundingClientRect();
        const x = event.clientX - box.x - box.width / 2;
        const y = event.clientY - box.y - box.height / 2;
        const far = Math.hypot(x, y) || 1;
        const pull = Math.min(1, far / 260);
        eyes.style.transform = `translate(${((x / far) * 3.2 * pull).toFixed(2)}px,${((y / far) * 2.6 * pull).toFixed(2)}px)`;
      }
    });
  };
  window.addEventListener('pointermove', move);
  return () => {
    window.removeEventListener('pointermove', move);
    cancelAnimationFrame(frame);
  };
}

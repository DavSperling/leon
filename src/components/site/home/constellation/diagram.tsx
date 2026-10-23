import { Globe, type LucideIcon, Terminal } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Logo } from '@/components/verre/shell/brand';
import { cn } from '@/lib/verre/cn';
import { ToolLogo } from '../../parts';

// Schéma vivant du haut de la maquette Constellation : Leon au centre, deux orbites qui portent de vrais outils et deux
// assistants d'IA (sans nom), des traits où la donnée descend vers le centre. Rendu par le serveur, animé en CSS (et
// animateMotion pour les étincelles) ; en mouvement réduit, il reste figé et lisible. Tailles en unités de conteneur :
// le schéma se réduit avec sa colonne, sans déborder.

type Node = { tool: ProviderId } | { ai: LucideIcon; key: string };

const OUTER: Node[] = (
  [
    'hubspot',
    'notion',
    'github',
    'linear',
    'granola',
    'intercom',
    'asana',
    'outlook',
    'pipedrive',
    'zendesk',
  ] as ProviderId[]
).map((tool) => ({ tool }));

const INNER: Node[] = [
  { ai: Globe, key: 'navigateur' },
  { tool: 'fathom' },
  { tool: 'jira' },
  { ai: Terminal, key: 'code' },
  { tool: 'front' },
];

const VB = 560; // côté du repère des traits (viewBox)
const C = VB / 2;

type Ring = { nodes: Node[]; radius: number; offset: number; duration: number; reverse?: boolean };
const RINGS: Ring[] = [
  { nodes: OUTER, radius: 43, offset: -90, duration: 120 },
  { nodes: INNER, radius: 26.5, offset: -54, duration: 90, reverse: true },
];

const at = (ring: Ring, i: number) => {
  const a = ((ring.offset + (i * 360) / ring.nodes.length) * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
};
const pct = (n: number) => `${n.toFixed(3)}%`;
const px = (n: number) => Number(n.toFixed(2));

function RingLayer({ ring, idx }: { ring: Ring; idx: number }) {
  const rPx = (ring.radius / 100) * VB;
  return (
    <div
      className="site-orbit absolute inset-0"
      data-reverse={ring.reverse || undefined}
      style={{ '--orbit-dur': `${ring.duration}s` } as CSSProperties}
    >
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        aria-hidden="true"
        className="absolute inset-0 size-full overflow-visible"
      >
        <defs>
          <radialGradient id={`cs-ray-${idx}`} gradientUnits="userSpaceOnUse" cx={C} cy={C} r={rPx}>
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.95" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.12" />
          </radialGradient>
        </defs>
        {ring.nodes.map((n, i) => {
          const d = at(ring, i);
          const x1 = px(C + d.x * (rPx - 24));
          const y1 = px(C + d.y * (rPx - 24));
          const x2 = px(C + d.x * 52);
          const y2 = px(C + d.y * 52);
          const key = 'tool' in n ? n.tool : n.key;
          const path = `M${x1} ${y1} L${x2} ${y2}`;
          return (
            <g key={key}>
              <path
                d={path}
                stroke={`url(#cs-ray-${idx})`}
                strokeWidth={1.2}
                strokeLinecap="round"
                fill="none"
                className={i % 2 === 0 ? 'site-flow' : 'site-flow-slow'}
              />
              {i % 2 === idx % 2 && (
                <circle r={2.6} fill="var(--accent)" className="cs-spark" opacity="0">
                  <animateMotion
                    dur={`${3 + ((i * 7) % 5) * 0.45}s`}
                    begin={`${(i * 0.9) % 3.4}s`}
                    repeatCount="indefinite"
                    path={path}
                    keyPoints="0;1"
                    keyTimes="0;1"
                    calcMode="spline"
                    keySplines="0.4 0 0.2 1"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.15;0.8;1"
                    dur={`${3 + ((i * 7) % 5) * 0.45}s`}
                    begin={`${(i * 0.9) % 3.4}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          );
        })}
      </svg>
      {ring.nodes.map((n, i) => {
        const d = at(ring, i);
        const style = {
          left: pct(50 + d.x * ring.radius),
          top: pct(50 + d.y * ring.radius),
          '--n': idx === 0 ? '8.6cqw' : '7.6cqw',
        } as CSSProperties;
        if ('tool' in n)
          return (
            <span key={n.tool} className="site-orbit-item cs-node cs-node-logo" style={style}>
              {/* biome-ignore lint/performance/noImgElement: petit SVG statique de public/logos */}
              <img src={`/logos/${n.tool}.svg`} alt="" />
            </span>
          );
        const Icon = n.ai;
        return (
          <span key={n.key} className="site-orbit-item cs-node cs-node-ai" style={style}>
            <Icon strokeWidth={1.7} />
          </span>
        );
      })}
    </div>
  );
}

/** Une pastille de verre qui flotte : ce que Leon vient de garder. */
function Chip({
  className,
  icon,
  title,
  meta,
  float = 'site-float',
}: {
  className?: string;
  icon: ReactNode;
  title: string;
  meta: string;
  float?: string;
}) {
  return (
    <div
      className={cn(
        float,
        'absolute z-[2] flex items-center gap-2.5 rounded-full border border-line-strong bg-float py-1.5 pr-3.5 pl-1.5 shadow-float backdrop-blur-[18px] max-sm:gap-2 max-sm:pr-2.5',
        className,
      )}
    >
      {icon}
      <span className="grid leading-tight">
        <span className="text-label font-semibold whitespace-nowrap text-fg max-sm:text-[11.5px]">
          {title}
        </span>
        <span className="font-mono text-[10.5px] tracking-normal whitespace-nowrap text-muted max-sm:text-[10px]">
          {meta}
        </span>
      </span>
    </div>
  );
}

export function ConstellationDiagram({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Schéma : vos outils et vos assistants d’IA convergent vers Leon, qui garde tout avec sa source."
      className={cn('cs-diagram relative mx-auto aspect-square w-full max-w-[600px]', className)}
    >
      {/* orbites fixes : deux cercles pointillés et un halo */}
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        aria-hidden="true"
        className="absolute inset-0 size-full overflow-visible"
      >
        <defs>
          <radialGradient id="cs-floor" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.14" />
            <stop offset="0.6" stopColor="var(--logo-2)" stopOpacity="0.05" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={C} fill="url(#cs-floor)" />
        {RINGS.map((r) => (
          <circle
            key={r.radius}
            cx={C}
            cy={C}
            r={(r.radius / 100) * VB}
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth={1}
            strokeDasharray="2 6"
          />
        ))}
        <circle
          cx={C}
          cy={C}
          r={(14 / 100) * VB}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1}
        />
      </svg>

      {RINGS.map((r, i) => (
        <RingLayer key={r.radius} ring={r} idx={i} />
      ))}

      <div className="cs-core" aria-hidden="true">
        <span className="cs-core-glow" />
        <span className="cs-core-ring site-ping" />
        <span className="cs-core-ring site-ping site-ping-2" />
        <Logo className="relative size-full text-[7cqw] shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_0_0_1px_var(--line-strong),0_20px_50px_-12px_color-mix(in_srgb,var(--accent)_70%,transparent)]" />
      </div>

      <Chip
        className="top-[7%] left-[-2%] max-sm:left-0"
        icon={<ToolLogo id="granola" size={30} />}
        title="Réunion · Granola"
        meta="gardée il y a 2 min"
      />
      <Chip
        float="site-float-2"
        className="top-[54%] right-[-4%] max-sm:right-0"
        icon={<ToolLogo id="linear" size={30} />}
        title="Ticket · Linear"
        meta="relevé à 14:12"
      />
      <Chip
        className="bottom-[5%] left-[6%] max-sm:left-[2%]"
        icon={
          <span className="grid size-[30px] place-items-center rounded-full bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
            <Globe aria-hidden="true" strokeWidth={1.7} className="size-4" />
          </span>
        }
        title="Conversation d’IA"
        meta="privée · visible de vous seul"
      />
    </div>
  );
}

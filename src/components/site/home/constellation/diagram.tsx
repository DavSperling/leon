import { Globe, type LucideIcon, Terminal } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { Logo } from '@/components/verre/shell/brand';
import { cn } from '@/lib/verre/cn';
import { ParticleField, Tilt } from '../../fx';
import { ToolLogo } from '../../parts';

// Schéma vivant du haut de la maquette Constellation, en 3D : un plan d'orbites incliné en perspective (rotateX), où
// tournent de vrais outils et deux assistants d'IA (sans nom) ; les traits où la donnée descend vers le centre sont
// couchés dans le plan ; chaque logo est redressé face à vous (contre-rotation), Leon flotte au-dessus du centre, relié
// au plan par une colonne de lumière, et des ondes partent du centre sur le sol. Les pastilles flottent devant le plan
// (translate en Z) : quand le pointeur incline la scène, elles bougent plus que lui. Une nappe de particules en dessous.
// Rendu par le serveur (sauf l'inclinaison au pointeur et les particules) ; figé et lisible en mouvement réduit.
// Tailles en unités de conteneur : le schéma se réduit avec sa colonne, sans déborder.

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
      className="site-orbit cs-ring absolute inset-0"
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
                strokeWidth={1.4}
                strokeLinecap="round"
                fill="none"
                className={i % 2 === 0 ? 'site-flow' : 'site-flow-slow'}
              />
              {i % 2 === idx % 2 && (
                <circle r={3} fill="var(--accent)" className="cs-spark" opacity="0">
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

/** Une pastille de verre qui flotte devant le plan : ce que Leon vient de garder. */
function Chip({
  className,
  icon,
  title,
  meta,
  depth,
  float = 'site-float',
}: {
  className?: string;
  icon: ReactNode;
  title: string;
  meta: string;
  /** Avance vers vous, en unités de conteneur : plus elle est grande, plus la pastille bouge avec le pointeur. */
  depth: number;
  float?: string;
}) {
  return (
    <div
      className={cn(
        float,
        'cs-chip absolute z-[2] flex items-center gap-2.5 rounded-full border border-line-strong bg-[color-mix(in_srgb,var(--menu)_94%,transparent)] py-1.5 pr-3.5 pl-1.5 shadow-float max-sm:gap-2 max-sm:pr-2.5',
        className,
      )}
      style={{ '--depth': `${depth}cqw` } as CSSProperties}
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
      className={cn('cs-diagram relative mx-auto w-full max-w-[620px]', className)}
    >
      {/* nappe de particules sous le plan */}
      <div className="pointer-events-none absolute inset-x-[-12%] top-[18%] bottom-[-14%] opacity-80">
        <ParticleField density={0.55} height={1.5} />
      </div>

      {/* la scène s'incline doucement vers le pointeur ; tout ce qui est dedans garde sa profondeur */}
      <div aria-hidden="true" className="absolute inset-0">
        <Tilt max={7} scale={1} perspective={1300} glare={false} className="cs-scene size-full">
          <div className="cs-plane">
            {/* sol : halo, orbites en pointillés, ondes qui partent du centre */}
            <svg
              viewBox={`0 0 ${VB} ${VB}`}
              aria-hidden="true"
              className="absolute inset-0 size-full overflow-visible"
            >
              <defs>
                <radialGradient id="cs-spot" cx="50%" cy="50%" r="50%">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity="0.45" />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="cs-floor" cx="50%" cy="50%" r="50%">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity="0.2" />
                  <stop offset="0.55" stopColor="var(--logo-2)" stopOpacity="0.07" />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx={C} cy={C} r={C} fill="url(#cs-floor)" />
              <circle cx={C} cy={C} r={(20 / 100) * VB} fill="url(#cs-spot)" />
              {RINGS.map((r) => (
                <circle
                  key={r.radius}
                  cx={C}
                  cy={C}
                  r={(r.radius / 100) * VB}
                  fill="none"
                  stroke="var(--accent-line)"
                  strokeWidth={1.6}
                  strokeDasharray="2 6"
                />
              ))}
              <circle
                cx={C}
                cy={C}
                r={(49.5 / 100) * VB}
                fill="none"
                stroke="var(--accent-line)"
                strokeWidth={1}
                className="cs-rim"
              />
              <circle
                cx={C}
                cy={C}
                r={(14 / 100) * VB}
                fill="none"
                stroke="var(--line)"
                strokeWidth={1}
              />
            </svg>
            <span className="cs-wave site-ping" />
            <span className="cs-wave site-ping site-ping-2" />

            {RINGS.map((r, i) => (
              <RingLayer key={r.radius} ring={r} idx={i} />
            ))}

            {/* colonne de lumière entre le sol et Leon, debout dans le plan */}
            <span className="cs-beam" />
            <div className="cs-core">
              <Logo className="relative size-full text-[7cqw] shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_0_0_1px_var(--line-strong),0_24px_60px_-10px_color-mix(in_srgb,var(--accent)_80%,transparent)]" />
            </div>
          </div>

          <Chip
            depth={44}
            className="top-[8%] left-[8%] max-sm:left-[6%]"
            icon={<ToolLogo id="granola" size={30} lazy={false} />}
            title="Réunion · Granola"
            meta="gardée il y a 2 min"
          />
          <Chip
            depth={48}
            float="site-float-2"
            className="top-[44%] right-[6%] max-sm:right-[5%]"
            icon={<ToolLogo id="linear" size={30} lazy={false} />}
            title="Ticket · Linear"
            meta="relevé à 14:12"
          />
          <Chip
            depth={46}
            className="bottom-[8%] left-[14%] max-sm:left-[8%]"
            icon={
              <span className="grid size-[30px] place-items-center rounded-full bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">
                <Globe aria-hidden="true" strokeWidth={1.7} className="size-4" />
              </span>
            }
            title="Conversation d’IA"
            meta="privée · visible de vous seul"
          />
        </Tilt>
      </div>
    </div>
  );
}

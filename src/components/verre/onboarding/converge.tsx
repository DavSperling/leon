import type { CSSProperties } from 'react';
import { ToolLogo } from '@/components/verre/ui/chips';
import { cn } from '@/lib/verre/cn';
import './onboarding.css';

/** Le dessin de l'onboarding : chaque outil, un trait jusqu'au point de Leon (le geste du logo, et celui de Connexions). */
export const CONVERGE = { w: 360, h: 176, chip: 36, max: 8 } as const;

export type ConvergeItem = { id: string; on: boolean };

const round = (v: number) => Math.round(v * 10) / 10;

/** Le centre de chaque pastille (deux colonnes décalées dès quatre) et son trait : il part à l'horizontale et rejoint la ligne du point. */
export function convergeLines(n: number): { cx: number; cy: number; d: string }[] {
  const { w, h, chip } = CONVERGE;
  const zig = n > 3;
  // Jusqu'à trois outils, l'écart du logo lui-même ; au-delà, deux colonnes décalées.
  const step = zig ? Math.min(34, (h - chip - 4) / (n - 1)) : 64;
  const top = (h - ((n - 1) * step + chip)) / 2;
  const tx = w - 14;
  const ty = h / 2;
  return Array.from({ length: n }, (_, i) => {
    const cx = chip / 2 + 2 + (zig && i % 2 ? 52 : 0);
    const cy = top + i * step + chip / 2;
    const dx = tx - cx;
    return {
      cx: round(cx),
      cy: round(cy),
      d: `M${round(cx)} ${round(cy)}C${round(cx + dx * 0.46)} ${round(cy)} ${round(cx + dx * 0.7)} ${ty} ${tx} ${ty}`,
    };
  });
}

/**
 * Les outils à gauche, le point de Leon à droite. Un outil choisi ou branché (`on`) : son trait à l'encre, tracé une
 * fois ; un outil seulement proposé : un pointillé gris, sa pastille en retrait. Sans aucun outil, les trois traits du
 * logo, en pointillé (`drawn` : à l'encre, le logo en grand). Un décor (`aria-hidden`) : ce qui l'entoure dit la même chose.
 */
export function Converge({
  items,
  drawn = false,
  className,
}: {
  items: ConvergeItem[];
  drawn?: boolean;
  className?: string;
}) {
  const { w, h, max } = CONVERGE;
  const shown = items.slice(0, max);
  const bare = shown.length === 0;
  const lines = convergeLines(bare ? 3 : shown.length);
  const lit = bare ? drawn : shown.some((item) => item.on);
  return (
    <div aria-hidden="true" className={cn('ob-conv', className)}>
      <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {lines.map((line, i) => {
          const on = bare ? drawn : shown[i]?.on;
          return (
            <path
              key={bare ? line.cy : shown[i]?.id}
              d={line.d}
              pathLength={1}
              className={on ? 'is-on' : undefined}
              style={{ '--i': i } as CSSProperties}
            />
          );
        })}
        <circle
          cx={w - 14}
          cy={h / 2}
          r={12}
          className={cn('ob-conv__dot', lit && 'is-on')}
          style={{ '--n': lines.length } as CSSProperties}
        />
      </svg>
      {shown.map((item, i) => (
        <span
          key={item.id}
          className={cn('ob-conv__chip', item.on && 'is-on')}
          style={{
            left: `${((lines[i]?.cx ?? 0) / w) * 100}%`,
            top: `${((lines[i]?.cy ?? 0) / h) * 100}%`,
          }}
        >
          <ToolLogo kind={item.id} size={20} />
        </span>
      ))}
    </div>
  );
}

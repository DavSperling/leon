import type { CSSProperties, ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { ToolLogo } from '../parts';

// Ce que Leon garde, en trois couches de verre éclatées en 3D (CSS seul) : le brut au fond, l'index au milieu, les
// droits au-dessus. Elles s'écartent au survol, et s'ouvrent en entrant dans l'écran (animation-timeline). Décoratif :
// le texte qui l'accompagne dit la même chose.

const RAW: Array<[ProviderId, string, string]> = [
  ['granola', 'Point mensuel ACME', 'Réunion'],
  ['linear', 'ACME : reprise des données', 'Ticket'],
  ['hubspot', 'Devis V2 signé', 'Note'],
  ['outlook', 'Re : calendrier de la V2', 'Mail'],
];

function Plane({
  z,
  label,
  className,
  children,
}: {
  z: number;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="fx-layer" style={{ '--z': z } as CSSProperties}>
      <div
        className={cn(
          'absolute inset-0 overflow-hidden rounded-[22px] border border-line-strong bg-[linear-gradient(160deg,color-mix(in_srgb,var(--menu)_55%,transparent),color-mix(in_srgb,var(--menu)_28%,transparent))] p-5 shadow-[0_40px_80px_-40px_rgba(0,0,0,.55),inset_0_1px_0_var(--hi),0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)] backdrop-blur-[2px]',
          className,
        )}
      >
        <p className="font-mono text-[11px] tracking-[0.08em] text-accent uppercase">{label}</p>
        {children}
      </div>
    </div>
  );
}

export function Layers3D({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'fx-layers grid place-items-center max-sm:scale-[0.78] max-sm:overflow-x-clip',
        className,
      )}
    >
      <div className="fx-layers-stage relative h-[260px] w-[min(340px,86vw)] sm:h-[300px] sm:w-[400px]">
        <Plane z={0} label="Le brut, tel quel">
          <ul className="mt-3 grid gap-2">
            {RAW.map(([tool, title, kind]) => (
              <li
                key={title}
                className="flex items-center gap-2.5 rounded-[10px] border border-line bg-glass-3 px-2.5 py-2"
              >
                <ToolLogo id={tool} size={22} lazy={false} />
                <span className="truncate text-label font-semibold text-fg">{nb(title)}</span>
                <span className="ml-auto font-mono text-[11px] text-fg-2">{kind}</span>
              </li>
            ))}
          </ul>
        </Plane>
        <Plane z={1} label="L’index">
          <div className="mt-4 grid gap-2.5 font-mono text-[11.5px] leading-[1.5] text-fg-2">
            <p>
              on peut <mark>s’engager</mark> sur le <mark>15 novembre</mark>
            </p>
            <p>
              hors <mark>reprise</mark> de l’historique
            </p>
            <p>
              la <mark>reprise des données</mark> fait l’objet
            </p>
            <div className="mt-2 flex gap-2">
              <span className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[10.5px] text-accent">
                plein texte
              </span>
              <span className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[10.5px] text-accent">
                par le sens
              </span>
            </div>
          </div>
        </Plane>
        <Plane z={2} label="Les droits, d’abord" className="signal-line">
          <div className="mt-5 grid gap-2.5">
            <div className="flex items-center gap-3 rounded-[12px] border border-line bg-glass-3 px-3 py-2.5">
              <span className="size-2.5 rounded-full bg-ok" />
              <span className="text-label font-semibold text-fg">Visible de l’équipe</span>
              <span className="ml-auto font-mono text-[11px] text-fg-2">outils de l’équipe</span>
            </div>
            <div className="flex items-center gap-3 rounded-[12px] border border-accent-line bg-accent-soft px-3 py-2.5">
              <span className="size-2.5 rounded-full bg-accent" />
              <span className="text-label font-semibold text-accent">Vous seul</span>
              <span className="ml-auto font-mono text-[10.5px] text-muted">conversations d’IA</span>
            </div>
          </div>
        </Plane>
      </div>
    </div>
  );
}

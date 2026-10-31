import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';
import type { ProviderId } from '@/capture/turn';
import { cn } from '@/lib/verre/cn';
import { nb } from '@/lib/verre/nb';
import { Excerpt, ToolLogo } from '../parts';

// Ce que Leon garde, en trois couches de verre éclatées en 3D (CSS seul) : le brut au fond, l'index au milieu, les
// droits au-dessus. Elles s'écartent au survol, et s'ouvrent en entrant dans l'écran (animation-timeline). Décoratif :
// le texte qui l'accompagne dit la même chose.

// [outil, titre, sorte] : les clés de site.sample, sauf « Ticket » et « Note », les mêmes dans les deux langues.
const RAW = [
  ['granola', 'meeting', 'meetingKind'],
  ['linear', 'migration', 'Ticket'],
  ['hubspot', 'quote', 'Note'],
  ['outlook', 'email', 'emailKind'],
] as const satisfies ReadonlyArray<readonly [ProviderId, string, string]>;

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
          'absolute inset-0 overflow-hidden rounded-[22px] border border-line-strong bg-[linear-gradient(160deg,color-mix(in_srgb,var(--menu)_55%,transparent),color-mix(in_srgb,var(--menu)_28%,transparent))] p-5 shadow-[var(--shadow),inset_0_1px_0_var(--hi),0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)] backdrop-blur-[2px]',
          className,
        )}
      >
        <p className="font-mono text-meta tracking-[0.08em] text-accent uppercase">{label}</p>
        {children}
      </div>
    </div>
  );
}

export function Layers3D({ className }: { className?: string }) {
  const t = useTranslations('site.layers');
  const sample = useTranslations('site.sample');
  return (
    <div
      aria-hidden="true"
      className={cn('fx-layers grid place-items-center max-sm:scale-[0.78]', className)}
    >
      <div className="fx-layers-stage relative h-[260px] w-[min(340px,86vw)] sm:h-[300px] sm:w-[400px]">
        <Plane z={0} label={t('raw.title')}>
          <ul className="mt-3 grid gap-2">
            {RAW.map(([tool, title, kind]) => (
              <li
                key={title}
                className="flex items-center gap-2.5 rounded-[10px] border border-line bg-glass-3 px-2.5 py-2"
              >
                <ToolLogo id={tool} size={22} lazy={false} />
                <span className="truncate text-label font-semibold text-fg">
                  {nb(sample(title))}
                </span>
                <span className="ml-auto font-mono text-meta text-fg-2">
                  {kind === 'Ticket' || kind === 'Note' ? kind : sample(kind)}
                </span>
              </li>
            ))}
          </ul>
        </Plane>
        <Plane z={1} label={t('index.title')}>
          <div className="mt-4 grid gap-2.5 font-mono text-[11.5px] leading-[1.5] text-fg-2">
            {(['line1', 'line2', 'line3'] as const).map((line) => (
              <p key={line}>
                <Excerpt text={t(line)} />
              </p>
            ))}
            <div className="mt-2 flex gap-2">
              <span className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-meta text-accent">
                {t('fullText')}
              </span>
              <span className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-meta text-accent">
                {t('semantic')}
              </span>
            </div>
          </div>
        </Plane>
        <Plane z={2} label={t('rights.title')} className="signal-line">
          <div className="mt-5 grid gap-2.5">
            <div className="flex items-center gap-3 rounded-[12px] border border-line bg-glass-3 px-3 py-2.5">
              <span className="size-2.5 rounded-full bg-ok" />
              <span className="text-label font-semibold text-fg">{t('team')}</span>
              <span className="ml-auto font-mono text-meta text-fg-2">{t('teamTools')}</span>
            </div>
            <div className="flex items-center gap-3 rounded-[12px] border border-accent-line bg-accent-soft px-3 py-2.5">
              <span className="size-2.5 rounded-full bg-accent" />
              <span className="text-label font-semibold text-accent">{t('you')}</span>
              <span className="ml-auto font-mono text-meta text-muted">{t('aiConversations')}</span>
            </div>
          </div>
        </Plane>
      </div>
    </div>
  );
}

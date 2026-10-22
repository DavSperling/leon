import {
  ExternalLink,
  Globe,
  type LucideIcon,
  Monitor,
  PenLine,
  Plug,
  Terminal,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import type { CaptureKind, ProviderId, SourceKind } from '@/capture/turn';
import { PROVIDER_LABELS } from '@/lib/providers';
import { cn } from '@/lib/verre/cn';
import { formatDate, formatDateTime } from '@/lib/verre/format';
import { SOURCE_KIND_LABELS } from '@/server/memory/labels';

// Icône d'un canal de capture, ou des clients du journal de lecture (l'interface, un autre assistant).
const CHANNEL_ICONS: Record<CaptureKind | 'interface' | 'other', LucideIcon> = {
  claude_code: Terminal,
  claude_ai: Globe,
  chatgpt: Globe,
  mcp_remember: PenLine,
  interface: Monitor,
  other: Plug,
};

const isProvider = (kind: string): kind is ProviderId => Object.hasOwn(PROVIDER_LABELS, kind);
// `sources.kind` n'a plus de contrainte en base : un type inconnu (outil retiré) prend la prise et son propre nom.
const kindIcon = (kind: string): LucideIcon =>
  Object.hasOwn(CHANNEL_ICONS, kind) ? CHANNEL_ICONS[kind as keyof typeof CHANNEL_ICONS] : Plug;
const kindLabel = (kind: string): string =>
  Object.hasOwn(SOURCE_KIND_LABELS, kind) ? SOURCE_KIND_LABELS[kind as SourceKind] : kind;

type ChipProps = {
  n: number /** « Source 2 : Relance — contrat ACME v3 » */;
  label: string /** renvoi survolé ou lié au résultat sélectionné */;
  active?: boolean /** éclosion à l'arrivée (flux) */;
  animate?: boolean;
};

const CHIP =
  'relative mx-[1px] ml-1 inline-grid h-[19px] min-w-[19px] place-items-center rounded-full bg-accent-soft px-[5px] align-[2px] font-mono text-[11px] leading-none font-medium tracking-normal text-accent no-underline ' +
  // translate-* de Tailwind 4 = propriété `translate` ; ressort de la planche (.cite) pour la petite montée
  'shadow-[inset_0_0_0_1px_var(--accent-line)] transition-[background-color,color,translate] duration-200 ease-[var(--ease-spring)] ' +
  // zone de clic de 33 px autour d'une puce de 19 px
  'after:absolute after:-inset-[7px] after:content-[""] ' +
  'hover:-translate-y-px hover:bg-accent hover:text-accent-ink focus-visible:-translate-y-px focus-visible:bg-accent focus-visible:text-accent-ink ' +
  'data-[active]:-translate-y-px data-[active]:bg-accent data-[active]:text-accent-ink';

/** Renvoi [n] : un lien (href, recherche) ou un bouton (onClick, discussion). */
export function CitationChip({
  n,
  label,
  active,
  animate,
  className,
  ...props
}: ChipProps &
  (
    | ({ href: string } & Omit<ComponentProps<'a'>, 'children'>)
    | ({ href?: undefined } & Omit<ComponentProps<'button'>, 'children'>)
  )) {
  const shared = {
    'aria-label': label,
    title: label,
    'data-active': active || undefined,
    className: cn(CHIP, animate && 'pop-in', className),
  };
  if ('href' in props && props.href !== undefined)
    return (
      <a {...shared} {...(props as ComponentProps<'a'>)}>
        {n}
      </a>
    );
  return (
    <button type="button" {...shared} {...(props as ComponentProps<'button'>)}>
      {n}
    </button>
  );
}

/** Icône d'une origine : le logo de l'outil (public/logos), ou l'icône du canal de capture ; `boxed` : pastille carrée de 22 px de la planche. */
export function ToolIcon({
  kind,
  boxed,
  className,
}: {
  kind: SourceKind | 'interface' | 'other' | (string & {});
  boxed?: boolean;
  className?: string;
}) {
  // Le logo est posé sur du blanc : les logos sombres (GitHub, Notion, Attio) restent lisibles en thème sombre.
  // #fff écrit en dur : tokens.css retire les couleurs de Tailwind (--color-*: initial), bg-white n'existe pas.
  if (isProvider(kind))
    return (
      <span
        aria-hidden="true"
        className={cn(
          'grid shrink-0 place-items-center bg-[#fff]',
          boxed ? 'size-[22px] rounded-chip border border-line' : 'size-4 rounded-[4px]',
          className,
        )}
      >
        {/* biome-ignore lint/performance/noImgElement: petit SVG statique, rien à optimiser */}
        <img src={`/logos/${kind}.svg`} alt="" className={boxed ? 'size-[14px]' : 'size-[11px]'} />
      </span>
    );
  const Icon = kindIcon(kind);
  if (!boxed)
    return (
      <Icon
        aria-hidden="true"
        strokeWidth={1.6}
        className={cn('size-3.5 shrink-0 text-muted', className)}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-[22px] shrink-0 place-items-center rounded-chip border border-line bg-glass-3',
        className,
      )}
    >
      <Icon strokeWidth={1.6} className="size-[13px] text-fg-2" />
    </span>
  );
}

export type SourceChipProps = {
  kind: SourceKind | (string & {});
  /** Par défaut, le libellé de l'outil */
  label?: string;
  /** Segments après le libellé : nature, origine… */
  extra?: Array<string | null | undefined>;
  author?: string | null;
  date?: Date | null;
  /** Date et heure (« 12 oct. 2026, 14:12 ») au lieu de la date seule */
  time?: boolean;
  boxed?: boolean;
  className?: string;
};

/** Origine d'une source : icône + « Libellé · Réunion · Équipe Sales · Julie Martin · 14 oct. 2026 ». */
export function SourceChip({
  kind,
  label,
  extra = [],
  author,
  date,
  time,
  boxed,
  className,
}: SourceChipProps) {
  const parts = [...extra, author].filter(Boolean) as string[];
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 text-label text-muted', className)}>
      <ToolIcon kind={kind} boxed={boxed} />
      <span className="min-w-0 truncate">
        <span className="font-semibold text-fg-2">{label ?? kindLabel(kind)}</span>
        {parts.map((p) => (
          <span key={p}>
            <span aria-hidden="true" className="mx-1.5 opacity-70">
              ·
            </span>
            {p}
          </span>
        ))}
        {date && (
          <>
            <span aria-hidden="true" className="mx-1.5 opacity-70">
              ·
            </span>
            <time dateTime={date.toISOString()} className="tabular-nums">
              {time ? formatDateTime(date) : formatDate(date)}
            </time>
          </>
        )}
      </span>
    </span>
  );
}

/** « Ouvrir dans GitHub » : l'original, dans un nouvel onglet (SourceLink du vrai Leon). Rien sans adresse. */
export function SourceLink({
  href,
  kind,
  label,
  className,
}: {
  href: string | null | undefined;
  kind: SourceKind | (string & {}) /** Par défaut, le libellé de l'outil */;
  label?: string;
  className?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm text-label font-medium text-muted transition-colors duration-200 hover:text-accent',
        className,
      )}
    >
      <ExternalLink aria-hidden="true" strokeWidth={1.7} className="size-[13px] shrink-0" />
      Ouvrir dans {label ?? kindLabel(kind)}
      <span className="sr-only"> (s'ouvre dans un nouvel onglet)</span>
    </a>
  );
}

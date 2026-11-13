import { Globe, type LucideIcon, Monitor, PenLine, Plug, Terminal } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import type { CaptureKind, ProviderId, SourceKind } from '@/capture/turn';
import { SOURCE_KIND_LABELS } from '@/lib/labels';
import { PROVIDER_LABELS } from '@/lib/providers';
import { cn } from '@/lib/verre/cn';
import { formatDate, formatDateTime } from '@/lib/verre/format';
import { toneOf } from './marks';

// Icône d'un canal de capture, ou des clients du journal de lecture (l'interface, un autre assistant).
const CHANNEL_ICONS: Record<CaptureKind | 'interface' | 'other', LucideIcon> = {
  claude_code: Terminal,
  codex: Terminal,
  cursor: Terminal,
  antigravity: Terminal,
  claude_ai: Globe,
  chatgpt: Globe,
  mcp_remember: PenLine,
  interface: Monitor,
  other: Plug,
};

const isProvider = (kind: string): kind is ProviderId => Object.hasOwn(PROVIDER_LABELS, kind);
// Les fichiers ont leur logo aussi (public/logos) : ToolLogo kind="pdf" pour un document ajouté.
const FILE_LOGOS: ReadonlySet<string> = new Set([
  'pdf',
  'word',
  'excel',
  'powerpoint',
  'calc',
  'writer',
]);
// `sources.kind` n'a plus de contrainte en base : un type inconnu (outil retiré) prend la prise et son propre nom.
const kindIcon = (kind: string): LucideIcon =>
  Object.hasOwn(CHANNEL_ICONS, kind) ? CHANNEL_ICONS[kind as keyof typeof CHANNEL_ICONS] : Plug;
const kindLabel = (kind: string): string =>
  Object.hasOwn(SOURCE_KIND_LABELS, kind) ? SOURCE_KIND_LABELS[kind as SourceKind] : kind;

type ChipProps = {
  n: number /** « Source 2 : Relance — contrat ACME v3 » */;
  label: string /** renvoi pointé, ou lié à la source ouverte : son contour se marque */;
  active?: boolean;
};

/** Renvoi [n], dans la couleur de la source n : un lien (href, recherche) ou un bouton (onClick, discussion). */
export function CitationChip({
  n,
  label,
  active,
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
    className: cn('cite', `c${toneOf(n)}`, className),
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

/** Le numéro d'une source en étiquette, dans sa couleur (une ligne du point du matin) : le même que CitationChip, sans être un bouton. */
export function SourceNumber({ n, className }: { n: number; className?: string }) {
  return <span className={cn('num', `c${toneOf(n)}`, className)}>{n}</span>;
}

/** « sans source », après une phrase que rien n'appuie. */
export function NoSource({ className }: { className?: string }) {
  const t = useTranslations('common');
  return <span className={cn('nosrc', className)}>{t('noSource')}</span>;
}

/**
 * Le logo d'un outil, à la taille d'une image de chose : 36 dans une carte, 28 dans une tuile, 44 en tête du panneau,
 * 18 dans la barre de commande. Nu sur la feuille (sur un carré blanc en sombre) ; sans logo connu, l'icône du canal
 * sur un carré discret.
 */
export function ToolLogo({
  kind,
  size = 36,
  className,
}: {
  kind: SourceKind | 'interface' | 'other' | (string & {});
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (isProvider(kind) || FILE_LOGOS.has(kind))
    return (
      <span aria-hidden="true" className={cn('logo-box', className)} style={box}>
        {/* biome-ignore lint/performance/noImgElement: petit SVG statique, rien à optimiser */}
        <img src={`/logos/${kind}.svg`} alt="" width={size} height={size} />
      </span>
    );
  const Icon = kindIcon(kind);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-item bg-selected text-fg-2',
        className,
      )}
      style={box}
    >
      <Icon strokeWidth={1.6} style={{ width: size / 2, height: size / 2 }} />
    </span>
  );
}

/** Petite icône d'une origine dans une ligne de texte : le logo de l'outil (public/logos), ou l'icône du canal de capture ; `boxed` : carré de 22 px. */
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
  if (isProvider(kind))
    return (
      <span
        aria-hidden="true"
        className={cn(
          'grid shrink-0 place-items-center bg-white',
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
        className={cn('size-3.5 shrink-0 text-icon', className)}
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

// La date dans la langue de l'interface : seule partie de la puce qui la lit.
function ChipDate({ date, time }: { date: Date; time?: boolean }) {
  const locale = useLocale();
  return (
    <time dateTime={date.toISOString()} className="tabular-nums">
      {time ? formatDateTime(date, locale) : formatDate(date, locale)}
    </time>
  );
}

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
        <span className="font-medium text-fg">{label ?? kindLabel(kind)}</span>
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
            <ChipDate date={date} time={time} />
          </>
        )}
      </span>
    </span>
  );
}

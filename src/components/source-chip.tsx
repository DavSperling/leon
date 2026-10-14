import { Globe, type LucideIcon, Monitor, PenLine, Plug, Terminal } from 'lucide-react';
import type { SourceKind } from '@/capture/turn';
import { formatDateTime } from '@/lib/format';

// Les quatre origines d'un fait, plus les clients du journal de lecture : l'interface et les autres assistants.
const ICONS: Record<SourceKind | 'interface' | 'other', LucideIcon> = {
  claude_code: Terminal,
  claude_ai: Globe,
  chatgpt: Globe,
  mcp_remember: PenLine,
  interface: Monitor,
  other: Plug,
};

export type SourceChipKind = keyof typeof ICONS;

type SourceChipProps = { kind: SourceChipKind; label: string; authorName?: string; at?: Date };

// Origine d'un fait (outil, auteur, date) ou assistant d'une lecture (outil seul). Sans lien dans ce jet.
export function SourceChip({ kind, label, authorName, at }: SourceChipProps) {
  const Icon = ICONS[kind];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
      <span>
        {label}
        {authorName && ` · ${authorName}`}
        {at && (
          <>
            {' · '}
            <time dateTime={at.toISOString()} className="tabular-nums">
              {formatDateTime(at)}
            </time>
          </>
        )}
      </span>
    </span>
  );
}

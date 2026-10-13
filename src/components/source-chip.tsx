import { Globe, type LucideIcon, PenLine, Terminal } from 'lucide-react';
import type { SourceKind } from '@/capture/turn';
import { formatDateTime } from '@/lib/format';

const ICONS: Record<SourceKind, LucideIcon> = {
  claude_code: Terminal,
  claude_ai: Globe,
  chatgpt: Globe,
  mcp_remember: PenLine,
};

type SourceChipProps = { kind: SourceKind; label: string; authorName: string; at: Date };

// Origine d'un fait : outil, auteur, date. Sans lien dans ce jet.
export function SourceChip({ kind, label, authorName, at }: SourceChipProps) {
  const Icon = ICONS[kind];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      <span>
        {label} · {authorName} ·{' '}
        <time dateTime={at.toISOString()} className="tabular-nums">
          {formatDateTime(at)}
        </time>
      </span>
    </span>
  );
}

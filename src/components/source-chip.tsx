import {
  Code,
  Globe,
  KanbanSquare,
  LifeBuoy,
  type LucideIcon,
  Mic,
  Monitor,
  PenLine,
  Plug,
  Terminal,
  Users,
} from 'lucide-react';
import type { CaptureKind, ProviderId } from '@/capture/turn';
import { formatDateTime } from '@/lib/format';
import { PROVIDER_FAMILIES, type ProviderFamily } from '@/lib/providers';

// Les quatre origines d'une conversation, plus les clients du journal de lecture : l'interface et les autres assistants.
const ICONS: Record<CaptureKind | 'interface' | 'other', LucideIcon> = {
  claude_code: Terminal,
  claude_ai: Globe,
  chatgpt: Globe,
  mcp_remember: PenLine,
  interface: Monitor,
  other: Plug,
};

// Un outil branché prend l'icône de sa famille.
const FAMILY_ICONS: Record<ProviderFamily, LucideIcon> = {
  dev: Code,
  reunions: Mic,
  projet: KanbanSquare,
  crm: Users,
  support: LifeBuoy,
};

export type SourceChipKind = keyof typeof ICONS | ProviderId;

function isProvider(kind: SourceChipKind): kind is ProviderId {
  return kind in PROVIDER_FAMILIES;
}

function iconOf(kind: SourceChipKind): LucideIcon {
  return isProvider(kind) ? FAMILY_ICONS[PROVIDER_FAMILIES[kind]] : ICONS[kind];
}

type SourceChipProps = { kind: SourceChipKind; label: string; authorName?: string; at?: Date };

// Origine d'un fait (outil, auteur, date) ou assistant d'une lecture (outil seul). Sans lien dans ce jet.
export function SourceChip({ kind, label, authorName, at }: SourceChipProps) {
  const Icon = iconOf(kind);
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

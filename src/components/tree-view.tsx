'use client';

import {
  Building2,
  ChevronRight,
  Folder,
  FolderKanban,
  Gavel,
  type LucideIcon,
  Package,
  ScrollText,
  Truck,
  User,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type KeyboardEvent, useRef, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TreeType } from '@/server/memory/tree';

const TYPE_ICONS: Record<string, LucideIcon> = {
  client: Building2,
  projet: FolderKanban,
  personne: User,
  decision: Gavel,
  regle: ScrollText,
  fournisseur: Truck,
  produit: Package,
  outil: Wrench,
};

type RowBase = { key: string; level: number; parentKey: string | null };
export type TreeRow = RowBase &
  (
    | { kind: 'type'; type: TreeType; expandable: boolean; open: boolean; count: number }
    | { kind: 'card'; card: TreeType['cards'][number] }
  );
export type KeyAction = { focus: string } | { toggle: string } | null;

// Lignes visibles à plat, dans l'ordre d'affichage : types enfants puis fiches sous un type déplié.
export function visibleRows(
  types: TreeType[],
  expanded: ReadonlySet<string>,
  level = 1,
  parentKey: string | null = null,
): TreeRow[] {
  return types.flatMap((type) => {
    const key = `t:${type.slug}`;
    const expandable = type.children.length + type.cards.length > 0;
    const open = expandable && expanded.has(key);
    const count = type.children.reduce((sum, child) => sum + child.cardCount, type.cardCount);
    const row: TreeRow = { kind: 'type', key, level, parentKey, type, expandable, open, count };
    if (!open) return [row];
    const cardRows: TreeRow[] = type.cards.map((card) => ({
      kind: 'card',
      key: `c:${card.id}`,
      level: level + 1,
      parentKey: key,
      card,
    }));
    return [row, ...visibleRows(type.children, expanded, level + 1, key), ...cardRows];
  });
}

// Motif WAI-ARIA « tree » : ce que fait une touche sur la ligne `index`. Entrée sur une fiche
// revient au lien lui-même.
export function keyAction(rows: TreeRow[], index: number, key: string): KeyAction {
  const row = rows[index];
  if (!row) return null;
  const focusAt = (target: TreeRow | undefined): KeyAction =>
    target ? { focus: target.key } : null;
  const isOpenType = row.kind === 'type' && row.open;
  switch (key) {
    case 'ArrowDown':
      return focusAt(rows[index + 1]);
    case 'ArrowUp':
      return focusAt(rows[index - 1]);
    case 'Home':
      return focusAt(rows[0]);
    case 'End':
      return focusAt(rows.at(-1));
    case 'ArrowRight':
      if (row.kind === 'type' && row.expandable && !row.open) return { toggle: row.key };
      return isOpenType ? focusAt(rows[index + 1]) : null;
    case 'ArrowLeft':
      if (isOpenType) return { toggle: row.key };
      return focusAt(rows.find((other) => other.key === row.parentKey));
    case 'Enter':
    case ' ':
      return row.kind === 'type' && row.expandable ? { toggle: row.key } : null;
    default:
      return null;
  }
}

function typeKeysAbove(types: TreeType[], cardId: string): string[] {
  for (const type of types) {
    if (type.cards.some((card) => card.id === cardId)) return [`t:${type.slug}`];
    const below = typeKeysAbove(type.children, cardId);
    if (below.length > 0) return [`t:${type.slug}`, ...below];
  }
  return [];
}

const ROW_CLASS =
  'flex h-7 w-full items-center gap-1.5 border-l-2 border-transparent pr-3 text-[13px] leading-[18px] hover:bg-accent';

function TypeLabel({ row }: { row: Extract<TreeRow, { kind: 'type' }> }) {
  const Icon = TYPE_ICONS[row.type.slug] ?? Folder;
  return (
    <>
      <ChevronRight
        size={14}
        strokeWidth={1.5}
        aria-hidden="true"
        className={cn('shrink-0', !row.expandable && 'invisible', row.open && 'rotate-90')}
      />
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 truncate">{row.type.label}</span>
      {row.type.status === 'proposed' && <StatusBadge status="proposed" />}
      <span className="ml-auto font-mono text-xs leading-4 text-muted-foreground">
        {formatNumber(row.count)}
        <span className="sr-only"> {row.count > 1 ? 'fiches' : 'fiche'}</span>
      </span>
    </>
  );
}

// Arbre des types et des fiches visibles : la navigation de l'app. Le focus reste dans l'arbre
// quand on ouvre une fiche (le layout n'est pas remonté).
export function TreeView({ tree }: { tree: TreeType[] }) {
  const pathname = usePathname();
  const currentCardId = pathname.match(/^\/fiches\/([^/]+)/)?.[1] ?? null;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Une fiche ouverte (lien, recherche) déplie ses types, sans refermer ce que l'on a déplié.
  if (currentCardId !== revealedCardId) {
    setRevealedCardId(currentCardId);
    if (currentCardId) setExpanded(new Set([...expanded, ...typeKeysAbove(tree, currentCardId)]));
  }

  if (tree.every((type) => type.cardCount + type.children.length === 0)) {
    return (
      <div className="px-3">
        <EmptyState
          reason="Aucune fiche pour l'instant."
          nextStep="Leon les crée à partir de vos conversations captées."
        >
          <Link href="/reglages" className="text-primary hover:underline">
            Brancher une source
          </Link>
        </EmptyState>
      </div>
    );
  }

  const rows = visibleRows(tree, expanded);
  const tabbableKey =
    rows.find((row) => row.key === focusKey)?.key ??
    rows.find((row) => row.key === `c:${currentCardId}`)?.key ??
    rows[0]?.key;

  const toggle = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    const action = keyAction(rows, index, event.key);
    if (!action) return;
    event.preventDefault();
    if ('toggle' in action) return toggle(action.toggle);
    containerRef.current?.querySelector<HTMLElement>(`[data-key="${action.focus}"]`)?.focus();
  };

  return (
    <div ref={containerRef} role="tree" aria-label="Fiches par type" className="py-2">
      {rows.map((row, index) => {
        const tabIndex = row.key === tabbableKey ? 0 : -1;
        const style = { paddingLeft: 12 + (row.level - 1) * 12 };
        if (row.kind === 'type') {
          return (
            <div
              key={row.key}
              role="treeitem"
              aria-level={row.level}
              aria-selected={false}
              aria-expanded={row.expandable ? row.open : undefined}
              data-key={row.key}
              tabIndex={tabIndex}
              style={style}
              className={cn(ROW_CLASS, 'cursor-default')}
              onClick={() => row.expandable && toggle(row.key)}
              onFocus={() => setFocusKey(row.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <TypeLabel row={row} />
            </div>
          );
        }
        const current = row.card.id === currentCardId;
        return (
          <Link
            key={row.key}
            href={`/fiches/${row.card.id}`}
            role="treeitem"
            aria-level={row.level}
            aria-selected={current}
            aria-current={current ? 'page' : undefined}
            data-key={row.key}
            tabIndex={tabIndex}
            style={style}
            title={row.card.title}
            className={cn(ROW_CLASS, current && 'border-primary bg-primary-soft text-primary')}
            onFocus={() => setFocusKey(row.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className="w-3.5 shrink-0" aria-hidden="true" />
            <span className={cn('min-w-0 truncate', row.card.status === 'unconfirmed' && 'italic')}>
              {row.card.title}
            </span>
            {row.card.status === 'unconfirmed' && (
              <span className="ml-auto shrink-0 text-xs leading-4 text-muted-foreground">
                non confirmée
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

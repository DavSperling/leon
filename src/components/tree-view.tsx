'use client';

import { FileText, Folder, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type KeyboardEvent, useRef, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TreeType } from '@/server/memory/tree';

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
  'relative mx-2 flex h-9 items-center gap-2.5 rounded-lg pr-2 text-[15px] leading-5 text-foreground-2 transition-colors duration-150 hover:bg-accent hover:text-foreground';

const INDENT = 20;
const rowPadding = (level: number) => ({ paddingLeft: 10 + (level - 1) * INDENT });

// Un trait vertical sous chaque dossier parent, aligné sur son icône, comme dans un explorateur.
function Guides({ level }: { level: number }) {
  return Array.from({ length: level - 1 }, (_, index) => (
    <span
      // biome-ignore lint/suspicious/noArrayIndexKey: un trait par niveau, fixes
      key={index}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 w-px bg-border"
      style={{ left: 18 + index * INDENT }}
    />
  ));
}

function TypeLabel({ row }: { row: Extract<TreeRow, { kind: 'type' }> }) {
  const Icon = row.open ? FolderOpen : Folder;
  return (
    <>
      <Guides level={row.level} />
      <Icon
        size={17}
        strokeWidth={1.5}
        aria-hidden="true"
        className="shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 truncate">{row.type.label}</span>
      {row.type.status === 'proposed' && <StatusBadge status="proposed" />}
      <span className="ml-auto text-xs leading-4 text-muted-foreground/70 tabular-nums">
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
    <div ref={containerRef} role="tree" aria-label="Fiches par type">
      {rows.map((row, index) => {
        const tabIndex = row.key === tabbableKey ? 0 : -1;
        const style = rowPadding(row.level);
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
            className={cn(
              ROW_CLASS,
              current && 'bg-primary-soft text-foreground hover:bg-primary-soft',
            )}
            onFocus={() => setFocusKey(row.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <Guides level={row.level} />
            <FileText
              size={17}
              strokeWidth={1.5}
              aria-hidden="true"
              className={cn('shrink-0 text-muted-foreground', current && 'text-primary')}
            />
            <span className={cn('min-w-0 truncate', row.card.status === 'unconfirmed' && 'italic')}>
              {row.card.title}
            </span>
            {row.card.status === 'unconfirmed' && (
              <span
                title="Non confirmée"
                className="ml-auto size-1.5 shrink-0 rounded-full bg-warning/60"
              >
                <span className="sr-only">non confirmée</span>
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

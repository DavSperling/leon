'use client';

import { Command, PanelLeftClose, PanelLeftOpen, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Kbd, useModKey } from '@/components/verre/ui/kbd';
import { Tooltip } from '@/components/verre/ui/menu';
import { cn } from '@/lib/verre/cn';
import { spring } from '@/lib/verre/motion';
import type { ChannelHealth } from '@/server/memory/sources';
import { Brand } from './brand';
import { navFor, sectionOf } from './nav';
import { usePalette } from './palette-context';
import { EASE, EASE_FOLD, LABEL, railOnly, toggleRail, useRailCollapsed } from './rail';
import { type Viewer, WorkspaceMenu } from './workspace-menu';

// Toutes les icônes de la barre sont centrées sur la même colonne (x = 32 px, le milieu du rail replié) et gardent
// leur hauteur dans les deux états : en repliant, rien ne bouge, seuls les libellés s'effacent et la colonne rétrécit.

// Une ligne de la barre (sections, recherche, état) : 40 px, 44 sous 861 px (doigt) ; fond au survol seulement en rail.
export const ROW =
  'group relative flex h-10 w-full items-center gap-3 rounded-field pr-2.5 pl-3 text-[13.5px] font-medium text-fg-2 transition-colors duration-200 hover:text-fg max-shell:h-11 group-data-[rail=replie]/rail:hover:bg-hover';
export const ROW_ICON = 'relative size-4 shrink-0 transition-colors duration-200';

/** Liens des sections avec l'encre qui glisse sous la section active (layoutId partagé). 44 px de haut sous 861 px (doigt). */
export function NavList({
  onNavigate,
  inkId = 'nav-ink',
  developer = false,
}: {
  onNavigate?: () => void;
  inkId?: string;
  developer?: boolean;
}) {
  // section active calculée ici : sous l'infobulle (Slot de Radix), une className en fonction serait changée en texte
  const current = sectionOf(usePathname());
  const t = useTranslations('navigation');
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
      {navFor(developer).map((item) => {
        const { href, labelKey, icon: Icon } = item;
        const label = t(labelKey);
        const isActive = item === current;
        return (
          <li key={href}>
            <Tooltip content={label} side="right">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                onClick={onNavigate}
                onPointerMove={railOnly}
                onFocus={railOnly}
                className={cn(ROW, isActive && 'font-semibold text-fg')}
              >
                {isActive && (
                  <motion.span
                    layoutId={inkId}
                    transition={spring}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-field border border-line bg-ink shadow-hi"
                  />
                )}
                <Icon
                  aria-hidden="true"
                  strokeWidth={1.6}
                  className={cn(
                    ROW_ICON,
                    isActive ? 'text-accent' : 'text-muted group-hover:text-fg-2',
                  )}
                />
                <span className={cn(LABEL, 'relative min-w-0 overflow-hidden whitespace-nowrap')}>
                  {label}
                </span>
              </Link>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Pied de la barre : silencieux tant que la mémoire est à jour. Un canal de capture en retard (staleChannels) donne
 * une ligne d'alerte (icône + mots, jamais la couleur seule) qui mène aux Réglages, où se branchent les captures ;
 * repliée, l'icône reste, avec son infobulle.
 */
export function MemoryStatus({
  stale,
  className,
  onNavigate,
}: {
  stale: ChannelHealth[];
  className?: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations('shell');
  if (stale.length === 0) return null;
  const label = `${t('memoryLate')} · ${stale.map((c) => c.kindLabel).join(', ')}`;
  return (
    <Tooltip content={label} side="right">
      <Link
        href="/reglages"
        onClick={onNavigate}
        onPointerMove={railOnly}
        onFocus={railOnly}
        className={cn(ROW, 'text-[12px]', className)}
      >
        <TriangleAlert
          aria-hidden="true"
          strokeWidth={1.6}
          className={cn(ROW_ICON, 'text-warning')}
        />
        <span className={cn(LABEL, 'min-w-0 overflow-hidden whitespace-nowrap')}>{label}</span>
      </Link>
    </Tooltip>
  );
}

export type SidebarProps = Viewer & { stale: ChannelHealth[]; className?: string };

export function Sidebar({ stale, className, ...viewer }: SidebarProps) {
  const shellT = useTranslations('shell');
  const { openPalette } = usePalette();
  const onSearchPage = usePathname() === '/';
  const modKey = useModKey();
  const collapsed = useRailCollapsed();
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? shellT('expandSidebar') : shellT('collapseSidebar');

  return (
    <aside
      id="barre-laterale"
      aria-label={shellT('sidebar')}
      data-rail={collapsed ? 'replie' : 'deplie'}
      className={cn(
        'group/rail flex min-w-0 flex-col gap-4 px-3 pt-1 pb-2 transition-[width]',
        EASE,
        collapsed ? cn('w-16', EASE_FOLD) : 'w-[248px]',
        className,
      )}
    >
      {/* Le bouton suit le bord droit de la colonne : dépliée, au bout de la marque ; repliée, il prend la place du logo
          (qui s'efface avec les libellés) et reste visible au repos : le chemin du retour se voit, à la souris comme au doigt. */}
      <div className="relative flex h-10 shrink-0 items-center gap-2 pl-2">
        <Tooltip
          content={
            <span className="flex items-center gap-2">
              {toggleLabel}
              <Kbd>[</Kbd>
            </span>
          }
          side="right"
        >
          <button
            type="button"
            onClick={toggleRail}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            aria-controls="barre-laterale"
            aria-keyshortcuts="["
            className="absolute top-0 right-0 z-[1] grid size-10 place-items-center rounded-field text-muted transition-colors duration-200 hover:bg-hover hover:text-fg"
          >
            <Toggle aria-hidden="true" strokeWidth={1.6} className="size-[18px]" />
          </button>
        </Tooltip>
        <Brand className={cn(LABEL, 'min-w-0 shrink')} />
      </div>
      <WorkspaceMenu {...viewer} />
      {/* Une ligne comme les sections, sans cadre. Le glyphe ⌘ (et pas une loupe) : dans le rail, il ne se confond pas avec
          la section Recherche juste en dessous. Sur l'accueil, il met le curseur dans la barre ; ailleurs, il ouvre la palette. */}
      <Tooltip
        content={
          <span className="flex items-center gap-2">
            {shellT('quickSearch')}
            <Kbd>{modKey}K</Kbd>
          </span>
        }
        side="right"
      >
        <button
          type="button"
          onClick={openPalette}
          onPointerMove={railOnly}
          onFocus={railOnly}
          aria-haspopup={onSearchPage ? undefined : 'dialog'}
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(ROW, 'shrink-0 overflow-hidden')}
        >
          <Command
            aria-hidden="true"
            strokeWidth={1.6}
            className={cn(ROW_ICON, 'text-muted group-hover:text-fg-2')}
          />
          <span className={cn(LABEL, 'min-w-0 overflow-hidden whitespace-nowrap')}>
            {shellT('quickSearch')}…
          </span>
          <Kbd className={cn(LABEL, 'ml-auto')}>{modKey}K</Kbd>
        </button>
      </Tooltip>
      <nav aria-label={shellT('primaryNavigation')}>
        <NavList developer={viewer.developer} />
      </nav>
      <MemoryStatus stale={stale} className="mt-auto" />
    </aside>
  );
}

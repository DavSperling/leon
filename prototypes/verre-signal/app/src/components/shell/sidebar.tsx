import { Command, PanelLeftClose, PanelLeftOpen, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router';
import { Kbd, MOD_KEY } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/menu';
import { MEMORY } from '@/data/tokens';
import { cn } from '@/lib/cn';
import { formatRelative, minutesAgo, NOW } from '@/lib/format';
import { spring } from '@/lib/motion';
import { Logo } from './brand';
import { NAV, sectionOf } from './nav';
import { usePalette } from './palette-context';
import { EASE, EASE_FOLD, LABEL, railOnly, toggleRail, useRailCollapsed } from './rail';
import { WorkspaceMenu } from './workspace-menu';

// Toutes les icônes de la barre sont centrées sur la même colonne (x = 32 px, le milieu du rail replié) et gardent
// leur hauteur dans les deux états : en repliant, rien ne bouge, seuls les libellés s'effacent et la colonne rétrécit.

// Une ligne de la barre (sections, recherche, état) : 40 px, 44 sous 861 px (doigt) ; fond au survol seulement en rail.
const ROW = 'group relative flex h-10 w-full items-center gap-3 rounded-field pr-2.5 pl-3 text-[13.5px] font-medium text-fg-2 transition-colors duration-200 hover:text-fg max-shell:h-11 group-data-[rail=replie]/rail:hover:bg-hover';
const ROW_ICON = 'relative size-4 shrink-0 transition-colors duration-200';

/** Liens des sections avec l'encre qui glisse sous la section active (layoutId partagé). 44 px de haut sous 861 px (doigt). */
export function NavList({ onNavigate, inkId = 'nav-ink' }: { onNavigate?: () => void; inkId?: string }) {
  // section active calculée ici : sous l'infobulle (Slot de Radix), une className en fonction serait changée en texte
  const current = sectionOf(useLocation().pathname);
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
      {NAV.map((item) => {
        const { to, label, icon: Icon, end } = item;
        const isActive = item === current;
        return (
          <li key={to}>
            <Tooltip content={label} side="right">
              <NavLink
                to={to}
                end={end}
                onClick={onNavigate}
                onPointerMove={railOnly}
                onFocus={railOnly}
                className={cn(ROW, isActive && 'font-semibold text-fg')}
              >
                {isActive && <motion.span layoutId={inkId} transition={spring} aria-hidden="true" className="absolute inset-0 rounded-field border border-line bg-ink shadow-hi" />}
                <Icon aria-hidden="true" strokeWidth={1.6} className={cn(ROW_ICON, isActive ? 'text-accent' : 'text-muted group-hover:text-fg-2')} />
                <span className={cn(LABEL, 'relative min-w-0 overflow-hidden whitespace-nowrap')}>{label}</span>
              </NavLink>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

// ?memoire=retard montre l'état en retard (démonstration) ; lu au chargement, comme ?rail=.
const MEMORY_AT = new URLSearchParams(location.search).get('memoire') === 'retard' ? minutesAgo(190) : MEMORY.updatedAt;
const MEMORY_LATE = NOW.getTime() - MEMORY_AT.getTime() > 60 * 60_000;

/**
 * Pied de la barre : silencieux tant que la mémoire est à jour. En retard (plus d'une heure sans capture), une ligne
 * d'alerte (icône + mots, jamais la couleur seule) mène aux Réglages, où se branchent les captures ; repliée, l'icône reste, avec son infobulle.
 */
export function MemoryStatus({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  if (!MEMORY_LATE) return null;
  const label = `Mémoire en retard · ${formatRelative(MEMORY_AT)}`;
  return (
    <Tooltip content={label} side="right">
      <Link to="/reglages" onClick={onNavigate} onPointerMove={railOnly} onFocus={railOnly} className={cn(ROW, 'text-[12px]', className)}>
        <TriangleAlert aria-hidden="true" strokeWidth={1.6} className={cn(ROW_ICON, 'text-warning')} />
        <span className={cn(LABEL, 'min-w-0 overflow-hidden whitespace-nowrap tabular-nums')}>{label}</span>
      </Link>
    </Tooltip>
  );
}

export function Sidebar({ className }: { className?: string }) {
  const { openPalette } = usePalette();
  const [params] = useSearchParams();
  const onSearchPage = useLocation().pathname === '/';
  const collapsed = useRailCollapsed();
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale';

  return (
    <aside
      id="barre-laterale"
      aria-label="Barre latérale"
      data-rail={collapsed ? 'replie' : 'deplie'}
      className={cn('group/rail flex min-w-0 flex-col gap-4 px-3 pt-1 pb-2 transition-[width]', EASE, collapsed ? cn('w-16', EASE_FOLD) : 'w-[248px]', className)}
    >
      {/* Le bouton suit le bord droit de la colonne : dépliée, au bout de la marque ; repliée, il prend la place du « L »
          (qui s'efface avec les libellés) et reste visible au repos : le chemin du retour se voit, à la souris comme au doigt. */}
      <div className="relative flex h-10 shrink-0 items-center gap-2 pl-2">
        <Tooltip content={<span className="flex items-center gap-2">{toggleLabel}<Kbd>[</Kbd></span>} side="right">
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
        <Logo className={LABEL} />
        <span className={cn(LABEL, 'min-w-0 overflow-hidden text-[15.5px] font-bold tracking-[-0.02em] whitespace-nowrap')}>Leon</span>
      </div>
      <WorkspaceMenu defaultOpen={params.get('menu') === 'compte'} />
      {/* Une ligne comme les sections, sans cadre. Le glyphe ⌘ (et pas une loupe) : dans le rail, il ne se confond pas avec
          la section Recherche juste en dessous. Sur l'accueil, il met le curseur dans la barre ; ailleurs, il ouvre la palette. */}
      <Tooltip content={<span className="flex items-center gap-2">Rechercher<Kbd>{MOD_KEY}K</Kbd></span>} side="right">
        <button
          type="button"
          onClick={openPalette}
          onPointerMove={railOnly}
          onFocus={railOnly}
          aria-haspopup={onSearchPage ? undefined : 'dialog'}
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(ROW, 'shrink-0 overflow-hidden')}
        >
          <Command aria-hidden="true" strokeWidth={1.6} className={cn(ROW_ICON, 'text-muted group-hover:text-fg-2')} />
          <span className={cn(LABEL, 'min-w-0 overflow-hidden whitespace-nowrap')}>Rechercher…</span>
          <Kbd className={cn(LABEL, 'ml-auto')}>{MOD_KEY}K</Kbd>
        </button>
      </Tooltip>
      <nav aria-label="Navigation principale">
        <NavList />
      </nav>
      <MemoryStatus className="mt-auto" />
    </aside>
  );
}

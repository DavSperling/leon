import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { UNSAFE_LocationContext, useLocation, useOutlet } from 'react-router';
import { PageSkeleton } from '@/components/ui/feedback';
import { Toaster } from '@/components/ui/toast';
import { pageVariants } from '@/lib/motion';
import { CommandPalette } from './command-palette';
import { MobileBar } from './mobile-bar';
import { PaletteContext } from './palette-context';
import { ShellContext } from './shell-kind';
import { cn } from '@/lib/cn';
import { desktop, EASE, EASE_FOLD, toggleRail, useRailCollapsed } from './rail';
import { Sidebar } from './sidebar';
import { Aurora, ThinkingProvider } from './thinking';

/**
 * L'écran sortant garde son contenu pendant son animation de sortie (sinon il afficherait déjà le suivant), et son
 * adresse : sinon il relirait la nouvelle (Recherche repasserait un instant à l'accueil et prendrait le focus).
 */
function FrozenOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  const location = useContext(UNSAFE_LocationContext);
  const kept = useRef(location);
  if (useIsPresent()) kept.current = location;
  return <UNSAFE_LocationContext.Provider value={kept.current}>{frozen}</UNSAFE_LocationContext.Provider>;
}

/** Calque ouvert (palette, feuille, fenêtre) : il garde le focus et rend lui-même le focus en se fermant. */
const layerOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]');

/** Sur l'accueil, la barre de recherche est devant soi : ⌘K et « Rechercher » y mettent le curseur (comme le vrai Leon) au lieu d'ouvrir une seconde recherche. */
function focusSearchBar(): boolean {
  const bar = layerOpen() ? null : document.getElementById('barre-de-recherche');
  if (!(bar instanceof HTMLInputElement)) return false;
  bar.focus();
  bar.select();
  return true;
}

/** Ossature de l'appli : aurore, barre latérale (ou barre mobile), panneau de verre qui défile, palette ⌘K, notifications. */
export function AppShell() {
  const { pathname, search } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(() => new URLSearchParams(search).get('palette') === '1');
  const mainRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const shownPath = useRef(pathname);
  const collapsed = useRailCollapsed();
  const booted = useRef(false);
  useEffect(() => void (booted.current = true), []);

  // ⌘K / Ctrl+K : la barre de recherche si elle est là, sinon ouvre ou ferme la palette. « [ » replie ou déplie la barre latérale (comme Linear), sauf
  // dans un champ, une fenêtre ou un menu ; ⌘[ reste « page précédente », AltGr et ⌥ (le « [ » des claviers AZERTY) passent.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!focusSearchBar()) setPaletteOpen((o) => !o);
      } else if (e.key === '[' && !e.repeat && !e.metaKey && !(e.ctrlKey && !e.altKey) && desktop.matches) {
        const t = e.target as HTMLElement;
        if (t.isContentEditable || t.closest('input, textarea, select, [role="dialog"], [role="alertdialog"], [role="menu"]')) return;
        e.preventDefault();
        toggleRail();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Repli ou dépli : la page prend tout de suite sa largeur finale (une seule remise en page, pas une par image) et suit
  // le bord gauche du panneau, qui glisse ; elle rend la main au flux quand la colonne a fini (220 ms). Sa largeur
  // maximale (1240 px, 1424 repliée : la place libérée, sinon perdue en marges dès 1512 px) glisse avec la colonne.
  // Sans transition (?instant=1, premier rendu), la colonne est déjà à sa largeur : rien à faire ; en mouvement réduit, tout est final.
  useLayoutEffect(() => {
    const aside = document.getElementById('barre-laterale');
    const main = mainRef.current;
    const wrap = wrapRef.current;
    if (!aside?.offsetWidth || !main || !wrap) return; // barre mobile
    const delta = aside.getBoundingClientRect().width - (collapsed ? 64 : 248); // largeurs du rail : w-16 / w-[248px] (sidebar.tsx)
    if (!delta) return;
    const { paddingLeft, paddingRight } = getComputedStyle(wrap);
    const page = Math.min(collapsed ? 1424 : 1240, main.clientWidth + delta) - parseFloat(paddingLeft) - parseFloat(paddingRight);
    wrap.style.setProperty('--page-w', `${page}px`);
    const t = setTimeout(() => wrap.style.removeProperty('--page-w'), 240);
    return () => {
      clearTimeout(t);
      wrap.style.removeProperty('--page-w');
    };
  }, [collapsed]);

  // Changement de page : le focus va au contenu (lecteurs d'écran, clavier), sans faire défiler. Comparé au chemin
  // précédent (et pas à un « premier rendu ») : le double effet du mode strict ne vole pas le focus au chargement.
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    // sous un calque, <main> est aria-hidden : la palette ou le menu mobile y mettent le focus en se fermant
    if (!layerOpen()) mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const resetScroll = useCallback(() => {
    mainRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, []);
  const palette = useMemo(() => ({ openPalette: () => void (focusSearchBar() || setPaletteOpen(true)) }), []);

  return (
    <ThinkingProvider>
      <ShellContext.Provider value="app">
        <PaletteContext.Provider value={palette}>
          <Aurora />
          <a href="#contenu" className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-full bg-accent px-4 py-2 text-ui font-semibold text-accent-ink transition-transform focus:translate-y-0">
            Aller au contenu
          </a>
          <MobileBar />
          <div className="relative z-[1] shell:grid shell:h-dvh shell:grid-cols-[auto_minmax(0,1fr)] shell:grid-rows-[minmax(0,1fr)] shell:py-2.5 shell:pr-2.5">
            <Sidebar className="max-shell:hidden" />
            <div className="relative min-w-0 shell:min-h-0">
              {/* Le verre du panneau est un calque derrière <main> : sans backdrop-filter sur <main>, un `position: fixed`
                  d'écran reste relatif à la fenêtre (un backdrop-filter ferait de <main> son bloc conteneur). */}
              <div aria-hidden="true" className="glass-panel pointer-events-none absolute inset-0 max-shell:hidden" />
              <main ref={mainRef} id="contenu" tabIndex={-1} className="relative min-w-0 outline-none shell:h-full shell:overflow-x-hidden shell:overflow-y-auto shell:overscroll-contain shell:rounded-panel shell:border shell:border-transparent">
                <div ref={wrapRef} className={cn('mx-auto px-4 pt-4 pb-24 transition-[max-width] shell:px-8 shell:pt-10', EASE, collapsed ? cn('max-w-[1424px]', EASE_FOLD) : 'max-w-[1240px]')}>
                  {/* La première page s'affiche sans entrée : initial={false} sur elle seule. Sur <AnimatePresence>, il resterait
                      acquis à toute la vie de cette page et couperait l'entrée de tout ce qui y monte ensuite. */}
                  <AnimatePresence mode="wait" onExitComplete={resetScroll}>
                    <motion.div key={pathname} variants={pageVariants} initial={booted.current ? 'initial' : false} animate="animate" exit="exit" className="w-[var(--page-w,auto)]">
                      <Suspense fallback={<PageSkeleton />}>
                        <FrozenOutlet />
                      </Suspense>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </main>
            </div>
          </div>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
          <Toaster />
        </PaletteContext.Provider>
      </ShellContext.Provider>
    </ThinkingProvider>
  );
}

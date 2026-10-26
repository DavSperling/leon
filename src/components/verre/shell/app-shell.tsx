'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/verre/cn';
import type { ChannelHealth } from '@/server/memory/sources';
import { CommandPalette } from './command-palette';
import { MobileBar } from './mobile-bar';
import { PaletteContext } from './palette-context';
import { EASE, EASE_FOLD, isDesktop, toggleRail, useRailCollapsed } from './rail';
import { ShellContext } from './shell-kind';
import { Sidebar } from './sidebar';
import { Aurora, ThinkingProvider } from './thinking';
import type { Viewer } from './workspace-menu';

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

export type AppShellProps = Viewer & {
  /** Canaux de capture en retard (staleChannels) : l'alerte « Mémoire en retard » du pied de la barre. */
  stale: ChannelHealth[];
  children: ReactNode;
};

/**
 * Ossature de l'appli : aurore, barre latérale (ou barre mobile), panneau de verre qui défile, palette ⌘K. L'entrée
 * des pages est dans src/app/(app)/template.tsx ; les notifications sont montées une fois, dans src/app/layout.tsx.
 */
export function AppShell({ stale, children, ...viewer }: AppShellProps) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const shownPath = useRef(pathname);
  const collapsed = useRailCollapsed();

  // ⌘K / Ctrl+K : la barre de recherche si elle est là, sinon ouvre ou ferme la palette. « [ » replie ou déplie la barre latérale (comme Linear), sauf
  // dans un champ, une fenêtre ou un menu ; ⌘[ reste « page précédente », AltGr et ⌥ (le « [ » des claviers AZERTY) passent.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!focusSearchBar()) setPaletteOpen((o) => !o);
      } else if (
        e.key === '[' &&
        !e.repeat &&
        !e.metaKey &&
        !(e.ctrlKey && !e.altKey) &&
        isDesktop()
      ) {
        const t = e.target as HTMLElement;
        if (
          t.isContentEditable ||
          t.closest('input, textarea, select, [role="dialog"], [role="alertdialog"], [role="menu"]')
        )
          return;
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
  // Sans transition (premier rendu), la colonne est déjà à sa largeur : rien à faire ; en mouvement réduit, tout est final.
  useLayoutEffect(() => {
    const aside = document.getElementById('barre-laterale');
    const main = mainRef.current;
    const wrap = wrapRef.current;
    if (!aside?.offsetWidth || !main || !wrap) return; // barre mobile
    const delta = aside.getBoundingClientRect().width - (collapsed ? 64 : 248); // largeurs du rail : w-16 / w-[248px] (sidebar.tsx)
    if (!delta) return;
    const { paddingLeft, paddingRight } = getComputedStyle(wrap);
    const page =
      Math.min(collapsed ? 1424 : 1240, main.clientWidth + delta) -
      parseFloat(paddingLeft) -
      parseFloat(paddingRight);
    wrap.style.setProperty('--page-w', `${page}px`);
    const t = setTimeout(() => wrap.style.removeProperty('--page-w'), 240);
    return () => {
      clearTimeout(t);
      wrap.style.removeProperty('--page-w');
    };
  }, [collapsed]);

  // Changement de page : le panneau remonte en haut, et le focus va au contenu (lecteurs d'écran, clavier), sans faire
  // défiler. Comparé au chemin précédent (et pas à un « premier rendu ») : le double effet du mode strict ne vole pas le
  // focus au chargement.
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    mainRef.current?.scrollTo(0, 0);
    // sous un calque, <main> est aria-hidden : la palette ou le menu mobile y mettent le focus en se fermant
    if (!layerOpen()) mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const palette = useMemo(
    () => ({
      openPalette: () => {
        if (!focusSearchBar()) setPaletteOpen(true);
      },
    }),
    [],
  );

  return (
    <ThinkingProvider>
      <ShellContext.Provider value="app">
        <PaletteContext.Provider value={palette}>
          <Aurora />
          <a
            href="#contenu"
            className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-full bg-accent px-4 py-2 text-ui font-semibold text-accent-ink transition-transform focus:translate-y-0"
          >
            {t('skipToContent')}
          </a>
          <MobileBar {...viewer} stale={stale} />
          <div className="relative z-[1] shell:grid shell:h-dvh shell:grid-cols-[auto_minmax(0,1fr)] shell:grid-rows-[minmax(0,1fr)] shell:py-2.5 shell:pr-2.5">
            <Sidebar {...viewer} stale={stale} className="max-shell:hidden" />
            <div className="relative min-w-0 shell:min-h-0">
              {/* Le verre du panneau est un calque derrière <main> : sans backdrop-filter sur <main>, un `position: fixed`
                  d'écran reste relatif à la fenêtre (un backdrop-filter ferait de <main> son bloc conteneur). */}
              <div
                aria-hidden="true"
                className="glass-panel pointer-events-none absolute inset-0 max-shell:hidden"
              />
              <main
                ref={mainRef}
                id="contenu"
                tabIndex={-1}
                className="relative min-w-0 outline-none shell:h-full shell:overflow-x-hidden shell:overflow-y-auto shell:overscroll-contain shell:rounded-panel shell:border shell:border-transparent"
              >
                <div
                  ref={wrapRef}
                  className={cn(
                    'mx-auto px-4 pt-4 pb-24 transition-[max-width] shell:px-8 shell:pt-10',
                    EASE,
                    collapsed ? cn('max-w-[1424px]', EASE_FOLD) : 'max-w-[1240px]',
                  )}
                >
                  {children}
                </div>
              </main>
            </div>
          </div>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </PaletteContext.Provider>
      </ShellContext.Provider>
    </ThinkingProvider>
  );
}

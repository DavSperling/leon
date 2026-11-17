'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Kbd, useModKey } from '@/components/verre/ui/kbd';
import { Strokes } from '@/components/verre/ui/marks';
import { cn } from '@/lib/verre/cn';
import { ASK_ID, CommandPalette } from './command-palette';
import { MobileMenu } from './mobile-bar';
import { PaletteContext, usePalette } from './palette-context';
import { EASE, EASE_FOLD, isDesktop, toggleRail, useRailCollapsed } from './rail';
import { Sidebar, type SidebarData } from './sidebar';
import type { Viewer } from './workspace-menu';

/** Calque ouvert (barre de commande, feuille, panneau, fenêtre) : il garde le focus et rend lui-même le focus en se fermant. */
const layerOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]');

export type AppShellProps = Viewer & SidebarData & { children: ReactNode };

/**
 * Un seul endroit où demander par écran : la barre du haut ne se montre pas là où l'écran a son propre champ
 * (l'Accueil et les résultats d'une recherche, une discussion, une nouvelle discussion).
 */
function AskBar() {
  const t = useTranslations('shell');
  const { openPalette } = usePalette();
  const modKey = useModKey();
  const pathname = usePathname();
  if (pathname === '/' || pathname.startsWith('/discussions')) return null;
  return (
    <button
      type="button"
      id={ASK_ID}
      onClick={openPalette}
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      className="group flex h-[52px] w-[min(720px,100%)] min-w-0 cursor-text items-center gap-3.5 rounded-card border border-line bg-sheet pr-3.5 pl-[18px] text-left text-lead text-muted shadow-sheet transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-lift max-shell:h-12 max-shell:flex-1 max-shell:pl-3.5"
    >
      <Strokes />
      <span className="min-w-0 flex-1 truncate">{t('askOrSearch')}</span>
      <span aria-hidden="true" className="inline-flex gap-1 max-shell:hidden">
        <Kbd>{modKey.trim()}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

/**
 * Ossature de l'appli : le bureau, la barre latérale posée dessus en feuille (ou, sous 861 px, le bouton du menu), la
 * barre du haut, la page (1348 px au plus) et la barre de commande ⌘K. C'est la fenêtre qui défile. L'entrée des pages
 * est dans src/app/(app)/template.tsx ; les notifications sont montées une fois, dans src/app/layout.tsx.
 */
export function AppShell({ recents, reconnect, stale, children, ...viewer }: AppShellProps) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const shownPath = useRef(pathname);
  const collapsed = useRailCollapsed();
  const side = { recents, reconnect, stale };

  // ⌘K / Ctrl+K ouvre ou ferme la barre de commande ; là où l'écran a son propre champ, il y va. « [ » replie ou déplie la barre latérale
  // (comme Linear), sauf dans un champ, une fenêtre ou un menu ; ⌘[ reste « page précédente », AltGr et ⌥ (le « [ » des
  // claviers AZERTY) passent.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // Un seul endroit où demander : sur un écran qui a son propre champ (data-ask), ⌘K y met le curseur.
        const field = document.getElementById(ASK_ID)
          ? null
          : document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
              '#contenu [data-ask]:not(:disabled)',
            );
        if (field && !layerOpen()) field.focus();
        else setPaletteOpen((o) => !o);
      } else if (
        e.key === '[' &&
        !e.repeat &&
        !e.metaKey &&
        !(e.ctrlKey && !e.altKey) &&
        isDesktop()
      ) {
        const t = e.target;
        // la cible peut être le document lui-même (un événement fabriqué) : il n'a pas de closest
        if (
          t instanceof HTMLElement &&
          (t.isContentEditable ||
            t.closest(
              'input, textarea, select, [role="dialog"], [role="alertdialog"], [role="menu"]',
            ))
        )
          return;
        e.preventDefault();
        toggleRail();
      }
    };
    // La barre du haut reste collée : un filet la sépare de la page dès que celle-ci a défilé.
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    // une ancre (#jetons) s'arrête sous la barre du haut, pas dessous
    document.documentElement.style.scrollPaddingTop = 'calc(var(--top-h) + 20px)';
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
      document.documentElement.style.scrollPaddingTop = '';
    };
  }, []);

  // Repli ou dépli : la page prend tout de suite sa largeur finale (une seule remise en page, pas une par image) et suit
  // le bord de la barre, qui glisse ; elle rend la main au flux quand la barre a fini (220 ms). Sans transition (premier
  // rendu), la barre est déjà à sa largeur : rien à faire ; en mouvement réduit, tout est final.
  useLayoutEffect(() => {
    const aside = document.getElementById('barre-laterale');
    const main = mainRef.current;
    const page = wrapRef.current?.firstElementChild; // la page, dans son gabarit (template.tsx)
    if (!aside?.offsetWidth || !main || !(page instanceof HTMLElement)) return; // sous 861 px : pas de barre latérale
    const root = getComputedStyle(document.documentElement);
    const width = (name: string) => parseFloat(root.getPropertyValue(name));
    const delta = aside.getBoundingClientRect().width - width(collapsed ? '--rail-w' : '--side-w');
    if (!delta) return;
    const { paddingLeft, paddingRight } = getComputedStyle(main);
    const final = Math.min(
      width('--page-max'),
      main.clientWidth + delta - parseFloat(paddingLeft) - parseFloat(paddingRight),
    );
    if (!final) return;
    page.style.width = `${final}px`;
    const release = () => {
      page.style.width = '';
    };
    const timer = setTimeout(release, 240);
    return () => {
      clearTimeout(timer);
      release();
    };
  }, [collapsed]);

  // Changement de page : la fenêtre remonte en haut, et le focus va au contenu (lecteurs d'écran, clavier), sans faire
  // défiler. Comparé au chemin précédent (et pas à un « premier rendu ») : le double effet du mode strict ne vole pas le
  // focus au chargement.
  useEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    window.scrollTo(0, 0);
    // sous un calque, <main> est aria-hidden : la barre de commande ou le menu mobile y mettent le focus en se fermant ;
    // une page qui a déjà posé le curseur chez elle (le champ de l'Accueil) le garde
    if (!layerOpen() && !mainRef.current?.contains(document.activeElement))
      mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const palette = useMemo(() => ({ openPalette: () => setPaletteOpen(true) }), []);

  return (
    <PaletteContext.Provider value={palette}>
      <a
        href="#contenu"
        className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-full bg-ink px-4 py-2 text-ui font-semibold text-on-ink transition-transform focus:translate-y-0"
      >
        {t('skipToContent')}
      </a>
      <Sidebar {...viewer} {...side} className="max-shell:hidden" />
      <main
        ref={mainRef}
        id="contenu"
        tabIndex={-1}
        className={cn(
          'min-h-dvh overflow-x-clip px-[var(--gut)] pb-6 outline-none transition-[margin-left]',
          EASE,
          collapsed
            ? cn('shell:ml-[calc(var(--inset)+var(--rail-w))]', EASE_FOLD)
            : 'shell:ml-[calc(var(--inset)+var(--side-w))]',
        )}
      >
        {/* La bande du haut : le bouton du menu (sous 861 px) et la barre où l'on demande. Sur un écran qui a son
            propre champ, il ne reste d'elle que sa marge, et le bouton du menu au doigt. */}
        <div
          className={cn(
            'sticky top-0 z-20 -mx-[var(--gut)] flex justify-center gap-2 bg-desk px-[var(--gut)] pt-[var(--inset)] pb-3 transition-shadow duration-150 max-shell:justify-start max-shell:pb-2 shell:[&:not(:has(#demander))]:hidden',
            stuck && 'shadow-[0_1px_0_var(--line)]',
          )}
        >
          <MobileMenu {...viewer} {...side} />
          <AskBar />
        </div>
        <div
          ref={wrapRef}
          className="mx-auto max-w-[var(--page-max)] pt-6 pb-[52px] max-shell:pt-4"
        >
          {children}
        </div>
      </main>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        recents={recents}
        reconnect={reconnect}
      />
    </PaletteContext.Provider>
  );
}

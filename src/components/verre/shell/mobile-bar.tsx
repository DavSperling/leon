'use client';

import { LogOut, Menu, Moon, Search, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { signOutAction } from '@/app/(app)/actions';
import { IconButton } from '@/components/verre/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/verre/ui/dialog';
import { useTheme } from '@/lib/verre/theme';
import type { ChannelHealth } from '@/server/memory/sources';
import { initialOf, Logo } from './brand';
import { usePalette } from './palette-context';
import { MemoryStatus, NavList } from './sidebar';
import type { Viewer } from './workspace-menu';

const ROW =
  'flex h-11 w-full items-center gap-3 rounded-field px-3 text-[13.5px] text-fg-2 hover:bg-hover hover:text-fg';

/** Sous 861 px : la marque, la recherche (palette) et le menu, qui ouvre la navigation en feuille de verre. */
export function MobileBar({
  organizationName,
  userName,
  userEmail,
  stale,
}: Viewer & { stale: ChannelHealth[] }) {
  const t = useTranslations('shell');
  const { openPalette } = usePalette();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigated = useRef(false);
  const go = () => {
    navigated.current = true;
    setOpen(false);
  };
  return (
    <header className="glass-float sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line-strong pr-3 pl-4 shell:hidden">
      <span className="flex items-center gap-2.5 text-[15.5px] font-bold tracking-[-0.02em]">
        <Logo />
        Leon
      </span>
      <span className="ml-auto" />
      <IconButton
        icon={Search}
        label={t('search')}
        variant="secondary"
        size="lg"
        onClick={openPalette}
        aria-haspopup={pathname === '/' ? undefined : 'dialog'}
        tooltip={false}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <IconButton
            icon={Menu}
            label={t('openMenu')}
            variant="secondary"
            size="lg"
            tooltip={false}
          />
        </SheetTrigger>
        <SheetContent
          title={t('menu')}
          titleHidden
          // le focus s'ouvre sur la section courante (Radix viserait le premier bouton, après les liens)
          onOpenAutoFocus={(e) => {
            const current = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(
              '[aria-current="page"]',
            );
            if (current) {
              e.preventDefault();
              current.focus();
            }
          }}
          // après un choix de section, le focus va au contenu de la nouvelle page (pas au bouton « Ouvrir le menu »),
          // sauf si la page l'a déjà posé (barre de recherche de l'accueil)
          onCloseAutoFocus={(e) => {
            if (!navigated.current) return;
            navigated.current = false;
            e.preventDefault();
            if (document.activeElement === document.body)
              document.getElementById('contenu')?.focus({ preventScroll: true });
          }}
        >
          <div className="flex items-center gap-2.5 px-1">
            <span
              aria-hidden="true"
              className="grid size-[30px] place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]"
            >
              {initialOf(organizationName)}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{organizationName}</span>
              <span className="block truncate text-[12px] text-muted">
                {userName} · {userEmail}
              </span>
            </span>
          </div>
          <nav aria-label={t('primaryNavigation')}>
            <NavList inkId="nav-ink-sheet" onNavigate={go} />
          </nav>
          <div className="grid gap-0.5 border-t border-line pt-3">
            <button type="button" onClick={toggle} className={ROW}>
              {theme === 'dark' ? (
                <Sun aria-hidden="true" className="size-4 text-muted" />
              ) : (
                <Moon aria-hidden="true" className="size-4 text-muted" />
              )}
              {theme === 'dark' ? t('lightTheme') : t('darkTheme')}
            </button>
            <form action={signOutAction}>
              <button type="submit" className={ROW}>
                <LogOut aria-hidden="true" className="size-4 text-muted" />
                {t('signOut')}
              </button>
            </form>
          </div>
          <MemoryStatus stale={stale} onNavigate={go} />
        </SheetContent>
      </Sheet>
    </header>
  );
}

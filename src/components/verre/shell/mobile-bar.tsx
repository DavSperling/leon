'use client';

import { LogOut, Menu, Moon, ShieldCheck, Sun } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { signOutAction } from '@/app/(app)/actions';
import { Sheet, SheetContent, SheetTrigger } from '@/components/verre/ui/dialog';
import { useTheme } from '@/lib/verre/theme';
import { Brand } from './brand';
import { Alerts, NavList, Recents, type SidebarData } from './sidebar';
import { Identity, type Viewer } from './workspace-menu';

const ROW =
  'flex h-11 w-full items-center gap-2.5 rounded-item px-2 text-ui font-medium text-fg hover:bg-hover active:bg-n-150 [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:text-icon';
const ICON = { 'aria-hidden': true, strokeWidth: 1.6 } as const;

/**
 * Sous 861 px : le bouton du menu, à gauche de la barre du haut. Il ouvre en feuille ce que porte la barre latérale :
 * la marque, les sections (le drapeau en bout de ligne), les discussions récentes, les alertes, puis la personne et son
 * menu, écrit en lignes : le thème, Admin, Se déconnecter (un formulaire : il marche sans JavaScript). Les Réglages sont
 * déjà parmi les sections, juste au-dessus.
 */
export function MobileMenu({
  organizationName,
  userName,
  userEmail,
  userImage,
  admin,
  recents,
  reconnect,
  stale,
}: Viewer & SidebarData) {
  const t = useTranslations('shell');
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const navigated = useRef(false);
  const go = () => {
    navigated.current = true;
    setOpen(false);
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t('openMenu')}
        className="grid size-12 shrink-0 place-items-center rounded-card border border-line bg-sheet text-fg shadow-sheet transition-colors duration-150 active:bg-n-150 shell:hidden"
      >
        <Menu aria-hidden="true" strokeWidth={1.6} className="size-5" />
      </SheetTrigger>
      <SheetContent
        title={t('menu')}
        titleHidden
        className="gap-0"
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
        // après un choix, le focus va au contenu de la nouvelle page (pas au bouton « Ouvrir le menu »), sauf si la
        // page l'a déjà posé (le champ d'une discussion)
        onCloseAutoFocus={(e) => {
          if (!navigated.current) return;
          navigated.current = false;
          e.preventDefault();
          if (document.activeElement === document.body)
            document.getElementById('contenu')?.focus({ preventScroll: true });
        }}
      >
        <div className="flex h-9 items-center px-2">
          <Brand className="h-5" />
        </div>
        <nav aria-label={t('primaryNavigation')} className="mt-2">
          <NavList onNavigate={go} reconnect={reconnect.length} />
        </nav>
        <Recents recents={recents} onNavigate={go} />
        <div className="mt-4">
          <Alerts reconnect={reconnect} stale={stale} onNavigate={go} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] border-t border-line pt-2">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Identity
              name={userName}
              image={userImage}
              caption={`${organizationName} · ${userEmail}`}
            />
          </div>
          <button type="button" onClick={toggle} className={ROW}>
            {theme === 'dark' ? <Sun {...ICON} /> : <Moon {...ICON} />}
            {theme === 'dark' ? t('lightTheme') : t('darkTheme')}
          </button>
          {admin && (
            <Link href="/admin" onClick={go} className={ROW}>
              <ShieldCheck {...ICON} />
              {t('admin')}
            </Link>
          )}
          <form action={signOutAction}>
            <button type="submit" className={ROW}>
              <LogOut {...ICON} />
              {t('signOut')}
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

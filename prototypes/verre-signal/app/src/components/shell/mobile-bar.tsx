import { LogOut, Menu, Moon, Search, Sun } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { IconButton } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/dialog';
import { ME, ORG } from '@/data/people';
import { useTheme } from '@/lib/theme';
import { Logo } from './brand';
import { usePalette } from './palette-context';
import { MemoryStatus, NavList } from './sidebar';

const ROW = 'flex h-11 items-center gap-3 rounded-field px-3 text-[13.5px] text-fg-2 hover:bg-hover hover:text-fg';

/** Sous 861 px : la marque, la recherche (palette) et le menu, qui ouvre la navigation en feuille de verre. */
export function MobileBar() {
  const { openPalette } = usePalette();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const navigated = useRef(false);
  const go = () => ((navigated.current = true), setOpen(false));
  return (
    <header className="glass-float sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line-strong pr-3 pl-4 shell:hidden">
      <span className="flex items-center gap-2.5 text-[15.5px] font-bold tracking-[-0.02em]"><Logo />Leon</span>
      <span className="ml-auto" />
      <IconButton icon={Search} label="Rechercher" variant="secondary" size="lg" onClick={openPalette} aria-haspopup={pathname === '/' ? undefined : 'dialog'} tooltip={false} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <IconButton icon={Menu} label="Ouvrir le menu" variant="secondary" size="lg" tooltip={false} />
        </SheetTrigger>
        <SheetContent
          title="Menu"
          titleHidden
          // le focus s'ouvre sur la section courante (Radix viserait le premier bouton, après les liens)
          onOpenAutoFocus={(e) => {
            const current = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[aria-current="page"]');
            if (current) (e.preventDefault(), current.focus());
          }}
          // après un choix de section, le focus va au contenu de la nouvelle page (pas au bouton « Ouvrir le menu »),
          // sauf si la page l'a déjà posé (barre de recherche de l'accueil)
          onCloseAutoFocus={(e) => {
            if (!navigated.current) return;
            navigated.current = false;
            e.preventDefault();
            if (document.activeElement === document.body) document.getElementById('contenu')?.focus({ preventScroll: true });
          }}
        >
          <div className="flex items-center gap-2.5 px-1">
            <span aria-hidden="true" className="grid size-[30px] place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent shadow-[inset_0_0_0_1px_var(--accent-line)]">{ORG.initial}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{ORG.name}</span>
              <span className="block truncate text-[12px] text-muted">{ME.name} · {ME.email}</span>
            </span>
          </div>
          <nav aria-label="Navigation principale">
            <NavList inkId="nav-ink-sheet" onNavigate={go} />
          </nav>
          <div className="grid gap-0.5 border-t border-line pt-3">
            <button type="button" onClick={toggle} className={ROW}>
              {theme === 'dark' ? <Sun aria-hidden="true" className="size-4 text-muted" /> : <Moon aria-hidden="true" className="size-4 text-muted" />}
              {theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
            </button>
            <button type="button" onClick={() => (setOpen(false), navigate('/connexion'))} className={ROW}>
              <LogOut aria-hidden="true" className="size-4 text-muted" />
              Se déconnecter
            </button>
          </div>
          <MemoryStatus onNavigate={go} />
        </SheetContent>
      </Sheet>
    </header>
  );
}

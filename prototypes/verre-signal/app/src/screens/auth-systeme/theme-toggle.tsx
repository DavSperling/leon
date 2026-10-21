import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components';
import { useTheme } from '@/lib';

/** Pages hors ossature (pas de menu de compte ni de palette) : le thème se change ici, en haut à droite, dernier dans l'ordre de tabulation. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <div className="fixed top-4 right-4 z-10">
      <IconButton icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Thème clair' : 'Thème sombre'} variant="secondary" onClick={toggle} />
    </div>
  );
}

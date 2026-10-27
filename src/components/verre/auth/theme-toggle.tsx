'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { IconButton } from '@/components/verre/ui/button';
import { useTheme } from '@/lib/verre/theme';

/** Pages hors ossature (pas de menu de compte ni de palette) : le thème se change ici, en haut à droite, dernier dans l'ordre de tabulation. */
export function ThemeToggle() {
  const t = useTranslations('shell');
  const { theme, toggle } = useTheme();
  return (
    <div className="fixed top-4 right-4 z-10">
      <IconButton
        icon={theme === 'dark' ? Sun : Moon}
        label={theme === 'dark' ? t('lightTheme') : t('darkTheme')}
        variant="secondary"
        onClick={toggle}
      />
    </div>
  );
}

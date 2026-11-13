'use client';

import { Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { setLocaleAction } from '@/app/(app)/reglages/actions';
import { Brand } from '@/components/verre/shell/brand';
import { IconButton } from '@/components/verre/ui/button';
import { useTheme } from '@/lib/verre/theme';
import './auth.css';

// Chaque langue écrite dans sa langue (et marquée lang=) : « Français » se lit en français, même sur la page anglaise.
const LANGUAGES = [
  { locale: 'en', label: 'English' },
  { locale: 'fr', label: 'Français' },
] as const;

/** La langue : un formulaire qui pose le cookie leon-locale, sans session et sans JavaScript. */
export function LanguageChoice() {
  const t = useTranslations('auth');
  const current = useLocale();
  return (
    <form action={setLocaleAction} aria-label={t('language')} className="flex items-center">
      {LANGUAGES.map((l) => (
        <button
          key={l.locale}
          type="submit"
          name="locale"
          value={l.locale}
          lang={l.locale}
          aria-current={l.locale === current ? 'true' : undefined}
          className="inline-flex h-8 items-center rounded-full px-2.5 text-label text-muted transition-colors duration-150 hover:text-fg aria-[current=true]:text-fg aria-[current=true]:underline aria-[current=true]:underline-offset-4 max-shell:h-11"
        >
          {l.label}
        </button>
      ))}
    </form>
  );
}

/** Clair ou sombre : le choix gardé de toute l'appli (leon-theme). */
export function ThemeChoice() {
  const t = useTranslations('shell');
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={theme === 'dark' ? t('lightTheme') : t('darkTheme')}
      onClick={toggle}
    />
  );
}

/** La barre des pages hors ossature : le logo, dont les trois traits se tracent une fois ; à droite, `children`. */
export function AuthBar({ home, children }: { home?: string; children?: ReactNode }) {
  const brand = <Brand className="h-5" />;
  return (
    <header className="flex h-16 flex-none items-center justify-between gap-4 px-6 max-[899px]:h-[60px] max-[899px]:px-4">
      {home ? (
        <Link href={home} className="auth-logo inline-flex min-h-10 items-center rounded-item pr-1">
          {brand}
        </Link>
      ) : (
        <span className="auth-logo inline-flex min-h-10 items-center">{brand}</span>
      )}
      {children && <div className="flex items-center gap-1">{children}</div>}
    </header>
  );
}

import { z } from 'zod';

// Thème de l'interface : le serveur lit le cookie pour poser la classe sur <html> (pas de flash au
// chargement), une action serveur l'écrit.
export const THEME_COOKIE = 'leon-theme';

export const ThemeSchema = z.enum(['clair', 'sombre', 'systeme']);
export type Theme = z.infer<typeof ThemeSchema>;

export const THEME_COOKIE_OPTIONS = {
  path: '/',
  maxAge: 365 * 24 * 60 * 60,
  sameSite: 'lax',
} as const;

// Clair par défaut : toute valeur inconnue (absente, ancienne, saisie à la main) y ramène.
export function parseTheme(value: string | undefined): Theme {
  const parsed = ThemeSchema.safeParse(value);
  return parsed.success ? parsed.data : 'clair';
}

// Classe posée sur <html> ; `theme-systeme` suit la préférence du système (voir globals.css).
export const THEME_CLASS: Record<Theme, string> = {
  clair: '',
  sombre: 'dark',
  systeme: 'theme-systeme',
};

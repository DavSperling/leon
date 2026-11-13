import { useCallback, useSyncExternalStore } from 'react';

// Le thème vit sur <html data-theme>, posé avant le premier rendu par le script de src/app/layout.tsx.
export type Theme = 'dark' | 'light';
const KEY = 'leon-theme';
const listeners = new Set<() => void>();

// Au rendu serveur, pas de document : clair, le thème d'une première visite.
const read = (): Theme =>
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
    ? 'dark'
    : 'light';

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // stockage bloqué (navigation privée) : le thème vaut pour la session
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'light' as Theme);
  const toggle = useCallback(() => setTheme(read() === 'dark' ? 'light' : 'dark'), []);
  return { theme, setTheme, toggle };
}

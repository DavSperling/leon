import { useCallback, useSyncExternalStore } from 'react';

// Le thème vit sur <html data-theme>, posé avant le premier rendu par le script d'index.html.
export type Theme = 'dark' | 'light';
const KEY = 'leon-theme';
const listeners = new Set<() => void>();

const read = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // stockage bloqué (navigation privée) : le thème vaut pour la session
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'dark' as Theme);
  const toggle = useCallback(() => setTheme(read() === 'dark' ? 'light' : 'dark'), []);
  return { theme, setTheme, toggle };
}

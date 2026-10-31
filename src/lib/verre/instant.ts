import { useSyncExternalStore } from 'react';

// Mouvement réduit : les écrans affichent l'état final, sans chorégraphie. Deux sources : la préférence système, et le
// bouton « Arrêter les animations » du site (<html data-motion="off">, mémorisé, posé avant le premier rendu par le
// script de src/app/layout.tsx). Lu à la demande (jamais au chargement du module) : sans fenêtre au rendu serveur.
const query = () => window.matchMedia('(prefers-reduced-motion: reduce)');
const KEY = 'leon-motion';
const listeners = new Set<() => void>();

export const motionOff = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.dataset.motion === 'off';

export const isInstant = (): boolean =>
  typeof window !== 'undefined' && (query().matches || motionOff());

export function setMotionOff(off: boolean): void {
  if (off) document.documentElement.dataset.motion = 'off';
  else delete document.documentElement.dataset.motion;
  try {
    localStorage.setItem(KEY, off ? 'off' : 'on');
  } catch {
    // stockage bloqué (navigation privée) : le choix vaut pour la session
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  const media = query();
  media.addEventListener('change', l);
  listeners.add(l);
  return () => {
    media.removeEventListener('change', l);
    listeners.delete(l);
  };
};

export const useInstant = (): boolean => useSyncExternalStore(subscribe, isInstant, () => false);
export const useMotionOff = (): boolean => useSyncExternalStore(subscribe, motionOff, () => false);

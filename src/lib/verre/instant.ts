import { useSyncExternalStore } from 'react';

// Mouvement réduit : les écrans affichent l'état final, sans chorégraphie.
// Lu à la demande (jamais au chargement du module) : sans fenêtre au rendu serveur.
const query = () => window.matchMedia('(prefers-reduced-motion: reduce)');

export const isInstant = (): boolean => typeof window !== 'undefined' && query().matches;

const subscribe = (l: () => void) => {
  const media = query();
  media.addEventListener('change', l);
  return () => media.removeEventListener('change', l);
};

export const useInstant = (): boolean => useSyncExternalStore(subscribe, isInstant, () => false);

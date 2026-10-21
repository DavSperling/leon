import { MotionGlobalConfig } from 'motion/react';
import { useSyncExternalStore } from 'react';

// Mode instantané : ?instant=1 (lu une fois au chargement, tenu pour la session) ou mouvement réduit.
// Les écrans affichent alors l'état final, sans chorégraphie ; motion saute toutes ses animations.
const forced = document.documentElement.hasAttribute('data-instant');
const media = window.matchMedia('(prefers-reduced-motion: reduce)');

export const isInstant = (): boolean => forced || media.matches;

const sync = () => {
  MotionGlobalConfig.skipAnimations = isInstant();
};
sync();
media.addEventListener('change', sync);

const subscribe = (l: () => void) => {
  media.addEventListener('change', l);
  return () => media.removeEventListener('change', l);
};

export const useInstant = (): boolean => useSyncExternalStore(subscribe, isInstant, () => false);

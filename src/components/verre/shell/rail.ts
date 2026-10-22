'use client';

import { type SyntheticEvent, useSyncExternalStore } from 'react';

// Barre latérale dépliée (248 px) ou repliée en rail d'icônes (64 px). Le choix est mémorisé dans `leon-rail` ; sans
// choix, elle suit la fenêtre : dépliée dès 1280 px, repliée en dessous. Rien n'est lu au chargement du module
// (rendu serveur) : la fenêtre et le stockage sont lus à la demande ; le serveur rend la barre dépliée.
type Rail = 'deplie' | 'replie';

const KEY = 'leon-rail';
const listeners = new Set<() => void>();
const isRail = (v: string | null): v is Rail => v === 'deplie' || v === 'replie';
const wide = () => window.matchMedia('(min-width: 1280px)');

/** La barre latérale existe (au-dessus, la barre mobile la remplace). */
export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(min-width: 861px)').matches;

let chosen: Rail | null | undefined; // undefined : stockage pas encore lu

function stored(): Rail | null {
  if (chosen === undefined) {
    try {
      const v = localStorage.getItem(KEY);
      chosen = isRail(v) ? v : null;
    } catch {
      chosen = null; // stockage bloqué : on suit la fenêtre
    }
  }
  return chosen;
}

const read = (): Rail => stored() ?? (wide().matches ? 'deplie' : 'replie');

const subscribe = (l: () => void) => {
  const media = wide();
  listeners.add(l);
  media.addEventListener('change', l);
  return () => {
    listeners.delete(l);
    media.removeEventListener('change', l);
  };
};

export function toggleRail(): void {
  chosen = read() === 'deplie' ? 'replie' : 'deplie';
  try {
    localStorage.setItem(KEY, chosen);
  } catch {
    // stockage bloqué : le choix vaut pour la session
  }
  for (const l of listeners) l();
}

/** true quand la barre latérale est repliée en rail d'icônes. */
export const useRailCollapsed = (): boolean =>
  useSyncExternalStore(subscribe, read, () => 'deplie' as Rail) === 'replie';

/**
 * Libellé de la barre : repliée, il s'efface vite (80 ms), avant que la colonne ne rétrécisse vraiment ; dépliée, il
 * revient une fois la place faite. Il reste dans le DOM (nom accessible) et ne passe jamais à la ligne (coupé par son parent).
 */
export const LABEL =
  'transition-opacity duration-150 delay-[110ms] ease-out group-data-[rail=replie]/rail:opacity-0 group-data-[rail=replie]/rail:duration-[80ms] group-data-[rail=replie]/rail:delay-0 motion-reduce:delay-0';

// 220 ms ; le repli démarre doucement (les libellés partent d'abord), le dépli démarre vite (les libellés arrivent ensuite).
// Partagées par la colonne (sidebar.tsx) et la largeur maximale de la page (app-shell.tsx), qui bougent ensemble.
export const EASE = 'duration-[220ms] ease-[cubic-bezier(.2,0,0,1)]';
export const EASE_FOLD = 'ease-[cubic-bezier(.4,0,.2,1)]';

/** Infobulle du rail : seulement barre repliée (dépliée, le libellé est écrit). Radix n'ouvre pas sur un événement annulé. */
export const railOnly = (e: SyntheticEvent<HTMLElement>) => {
  if (!e.currentTarget.closest('[data-rail="replie"]')) e.preventDefault();
};

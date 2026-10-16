'use client';

import { createContext, useContext, useEffect } from 'react';
import type { ShortcutId } from './shortcuts';

// Un gestionnaire rend `false` pour décliner la touche : elle garde alors son effet normal.
export type ShortcutHandler = () => unknown;
export type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

export type ShortcutRegistry = {
  register: (handlers: ShortcutHandlers) => () => void; // rend la fonction qui les retire
  has: (id: ShortcutId) => boolean; // la page a quelqu'un pour répondre à cette touche
  run: (id: ShortcutId) => boolean; // vrai si un gestionnaire a répondu
};

// Les gestionnaires s'empilent : pour une même touche, le dernier arrivé répond.
export function createRegistry(): ShortcutRegistry {
  let layers: ShortcutHandlers[] = [];
  const handlerFor = (id: ShortcutId) => layers.findLast((layer) => layer[id])?.[id];
  return {
    register(handlers) {
      layers = [...layers, handlers];
      return () => {
        layers = layers.filter((layer) => layer !== handlers);
      };
    },
    has: (id) => handlerFor(id) !== undefined,
    run(id) {
      const handler = handlerFor(id);
      return handler !== undefined && handler() !== false;
    },
  };
}

export const ShortcutsContext = createContext<ShortcutRegistry | null>(null);

// Hors d'une page de tâches (pages de la mémoire), il n'y a pas de registre : rien ne répond.
export const useShortcutRegistry = (): ShortcutRegistry | null => useContext(ShortcutsContext);

// Fait répondre ce composant à des touches tant qu'il est monté. L'écouteur est unique (voir
// ShortcutsProvider) ; il comprend déjà les champs, les menus et les dialogues.
export function useTaskShortcuts(handlers: ShortcutHandlers): void {
  const registry = useShortcutRegistry();
  // À chaque rendu : les gestionnaires voient l'état à jour.
  useEffect(() => registry?.register(handlers));
}

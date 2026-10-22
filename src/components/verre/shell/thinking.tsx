'use client';

import { MotionGlobalConfig } from 'motion/react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { useInstant } from '@/lib/verre/instant';

// « Leon travaille » : chaque composant qui cherche ou répond s'inscrit ; l'aurore s'intensifie tant qu'il en reste un.
type Ctx = { thinking: boolean; set: (id: string, on: boolean) => void };
const ThinkingContext = createContext<Ctx>({ thinking: false, set: () => {} });

export function ThinkingProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const set = useCallback((id: string, on: boolean) => {
    setIds((prev) => {
      if (prev.has(id) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  // Mouvement réduit : motion saute toutes ses animations (lu ici, jamais au chargement du module).
  const instant = useInstant();
  useEffect(() => {
    MotionGlobalConfig.skipAnimations = instant;
  }, [instant]);
  const value = useMemo(() => ({ thinking: ids.size > 0, set }), [ids, set]);
  return <ThinkingContext.Provider value={value}>{children}</ThinkingContext.Provider>;
}

/**
 * const { thinking, setThinking } = useThinking();  setThinking(true) pendant la recherche ou la réponse.
 * L'inscription tombe seule quand le composant disparaît.
 */
export function useThinking() {
  const { thinking, set } = useContext(ThinkingContext);
  const id = useId();
  useEffect(() => () => set(id, false), [set, id]);
  const setThinking = useCallback((on: boolean) => set(id, on), [set, id]);
  return { thinking, setThinking };
}

/** Fond d'aurore : trois nappes qui dérivent (transform seul, 26 à 34 s), une quatrième s'allume quand Leon travaille. */
export function Aurora() {
  const { thinking } = useContext(ThinkingContext);
  return (
    <div className="aurora" data-thinking={thinking || undefined} aria-hidden="true">
      <i className="blob blob-1" />
      <i className="blob blob-2" />
      <i className="blob blob-3" />
      <i className="blob blob-4" />
    </div>
  );
}

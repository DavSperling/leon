import { type RefObject, useLayoutEffect, useState } from 'react';

/**
 * true quand l'élément fait au moins `px` de large : une requête de conteneur, pas de fenêtre (le panneau change de
 * largeur avec le rail). Aperçu en volet ou en feuille, deux colonnes ou une. Part de false, comme le rendu serveur
 * (sinon l'hydratation diverge), et se corrige avant l'affichage.
 */
export function useMinWidth(ref: RefObject<HTMLElement | null>, px: number): boolean {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWide(el.offsetWidth >= px);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, px]);
  return wide;
}

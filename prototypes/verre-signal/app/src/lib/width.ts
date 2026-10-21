import { type RefObject, useLayoutEffect, useState } from 'react';

/**
 * true quand l'élément fait au moins `px` de large : une requête de conteneur, pas de fenêtre (le panneau change de
 * largeur avec le rail). Aperçu en volet ou en feuille, deux colonnes ou une. Première estimation sur la largeur utile
 * du panneau, corrigée avant l'affichage : rien n'est monté pour rien au premier rendu.
 */
export function useMinWidth(ref: RefObject<HTMLElement | null>, px: number): boolean {
  const [wide, setWide] = useState(() => (document.getElementById('contenu')?.clientWidth ?? window.innerWidth) - 64 >= px);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setWide(el.offsetWidth >= px);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, px]);
  return wide;
}

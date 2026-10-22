import type { Ref, RefObject } from 'react';

/** Un nœud, deux refs : la nôtre (mesure, focus) et celle de l'appelant (React 19 : `ref` est une prop comme une autre). */
export function mergeRefs<T>(own: RefObject<T | null>, outer?: Ref<T>) {
  return (el: T | null) => {
    own.current = el;
    if (typeof outer === 'function') outer(el);
    else if (outer) outer.current = el;
  };
}

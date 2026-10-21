import { useEffect } from 'react';

/** useTitle('Recherche') → « Recherche · Leon » ; sans titre → « Leon ». */
export function useTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Leon` : 'Leon';
  }, [title]);
}

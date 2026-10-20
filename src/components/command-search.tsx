'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { SEARCH_INPUT_ID } from '@/components/search/url-state';
import { Button } from '@/components/ui/button';

// Entrée de la recherche, présente partout : le bouton et ⌘K mènent à la barre de la page d'accueil (`/?q=`).
// Si la barre est déjà là, elle reçoit le curseur, son texte sélectionné : on retape sans effacer.
export function CommandSearch() {
  const router = useRouter();

  const openSearch = useCallback(() => {
    const input = document.getElementById(SEARCH_INPUT_ID);
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    } else {
      router.push('/?q=');
    }
  }, [router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openSearch]);

  return (
    <Button
      variant="outline"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={openSearch}
      className="h-8 w-full justify-start gap-2 rounded-md bg-card px-2 text-[14px] font-normal text-muted-foreground transition-colors"
    >
      <Search size={14} strokeWidth={1.5} aria-hidden="true" />
      <span className="flex-1 text-left">Rechercher…</span>
      <kbd className="text-[12px] leading-4">⌘K</kbd>
    </Button>
  );
}

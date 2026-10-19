'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Entrée de la recherche, présente partout : le bouton et ⌘K mènent à la page « Recherche ».
// La barre elle-même, avec ses résultats, arrive en T09 (⌘K ouvrira alors /?q=).
export function CommandSearch() {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        router.push('/');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    <Button
      variant="outline"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => router.push('/')}
      className="h-10 w-full justify-start rounded-xl bg-card text-[15px] font-normal text-muted-foreground shadow-xs transition-colors"
    >
      <Search size={16} strokeWidth={1.5} aria-hidden="true" />
      <span className="flex-1 text-left">Rechercher…</span>
      <kbd className="font-mono text-xs leading-4">⌘K</kbd>
    </Button>
  );
}

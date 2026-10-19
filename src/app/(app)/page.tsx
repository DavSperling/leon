import type { Metadata } from 'next';
import { EmptyState } from '@/components/empty-state';

export const metadata: Metadata = { title: 'Recherche' };

// Page d'accueil : la barre de recherche la remplace en T09.
export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-12 pt-16 pb-32 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <header className="border-b pb-7">
        <h1 className="text-[36px] leading-[44px] font-semibold tracking-[-0.02em]">Recherche</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Retrouver une information dans tout ce que Leon a gardé.
        </p>
      </header>
      <EmptyState
        reason="La recherche arrive."
        nextStep="Les conversations et les outils branchés sont déjà conservés tels quels, en attendant."
      />
    </div>
  );
}

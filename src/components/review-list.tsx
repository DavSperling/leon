'use client';

import { EmptyState } from '@/components/empty-state';
import { ReviewItemCard } from '@/components/review-item-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumber } from '@/lib/format';
import type { ReviewItemView } from '@/server/memory/review-list';

type ReviewListProps = { open: ReviewItemView[]; resolved: ReviewItemView[] };

function Items({ items, empty }: { items: ReviewItemView[]; empty: string }) {
  if (items.length === 0) {
    return (
      <EmptyState
        reason={empty}
        nextStep="Leon vous demandera votre avis ici quand il en aura besoin."
      />
    );
  }
  return (
    <ul className="space-y-4 pt-6">
      {items.map((item) => (
        <ReviewItemCard key={item.id} item={item} />
      ))}
    </ul>
  );
}

// Deux listes : les questions à trancher, puis les décisions déjà prises (en lecture). Chaque liste
// est plafonnée par `listReviewItems` (50 par défaut) : au-delà, le compteur de l'onglet est plus bas
// que celui de la barre latérale, qui compte tous les éléments ouverts.
export function ReviewList({ open, resolved }: ReviewListProps) {
  return (
    <Tabs
      defaultValue="a-traiter"
      className="mx-auto w-full max-w-[1000px] gap-0 px-10 pt-14 pb-28 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2"
    >
      <header className="flex items-end justify-between gap-4 border-b pb-7">
        <div>
          <h1 className="text-[34px] leading-[42px] font-semibold tracking-tight">À vérifier</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Les questions que Leon ne tranche pas seul
          </p>
        </div>
        <TabsList className="h-9 rounded-lg p-1">
          <TabsTrigger value="a-traiter" className="gap-1.5 rounded-md px-3">
            À traiter
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-soft px-1.5 text-xs leading-4 font-medium text-primary tabular-nums">
              {formatNumber(open.length)}
            </span>
          </TabsTrigger>
          <TabsTrigger value="traites" className="rounded-md px-3">
            Traités
          </TabsTrigger>
        </TabsList>
      </header>
      <TabsContent value="a-traiter">
        <Items items={open} empty="Rien à vérifier." />
      </TabsContent>
      <TabsContent value="traites">
        <Items items={resolved} empty="Aucun élément traité pour l’instant." />
      </TabsContent>
    </Tabs>
  );
}

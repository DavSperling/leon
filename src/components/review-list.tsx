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
    <ul>
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
    <Tabs defaultValue="a-traiter" className="max-w-4xl gap-4 p-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-base leading-6 font-semibold">À vérifier</h1>
        <TabsList>
          <TabsTrigger value="a-traiter">
            À traiter
            <span className="font-mono text-xs leading-4">{formatNumber(open.length)}</span>
          </TabsTrigger>
          <TabsTrigger value="traites">Traités</TabsTrigger>
        </TabsList>
      </header>
      <TabsContent value="a-traiter" className="border-t">
        <Items items={open} empty="Rien à vérifier." />
      </TabsContent>
      <TabsContent value="traites" className="border-t">
        <Items items={resolved} empty="Aucun élément traité pour l’instant." />
      </TabsContent>
    </Tabs>
  );
}

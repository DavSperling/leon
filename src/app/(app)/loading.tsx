import { Skeleton } from '@/components/ui/skeleton';

// Squelette aux dimensions d'une liste de lignes de faits ; pas de spinner plein écran.
export default function Loading() {
  return (
    <div role="status" className="p-6">
      <span className="sr-only">Chargement…</span>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-1 h-[18px] w-24" />
      <ul className="mt-4 max-w-[72ch]">
        {Array.from({ length: 6 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lignes identiques et fixes
          <li key={index} className="space-y-1 border-b py-3">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-6 w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

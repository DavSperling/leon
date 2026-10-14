import { Skeleton } from '@/components/ui/skeleton';

// Squelette aux dimensions d'une page de lecture ; pas de spinner plein écran.
export default function Loading() {
  return (
    <div role="status" className="mx-auto w-full max-w-[780px] px-10 pt-14 pb-28">
      <span className="sr-only">Chargement…</span>
      <div className="border-b pb-7">
        <Skeleton className="h-[42px] w-2/3 rounded-lg" />
        <Skeleton className="mt-2 h-6 w-1/3 rounded-md" />
      </div>
      <ul className="mt-8 space-y-6">
        {Array.from({ length: 5 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lignes identiques et fixes
          <li key={index} className="space-y-2">
            <Skeleton className="h-6 w-1/3 rounded-md" />
            <Skeleton className="h-7 w-full rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  );
}

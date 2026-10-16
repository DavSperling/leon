import { Skeleton } from '@/components/ui/skeleton';

// Squelette d'une liste : un en-tête, puis des lignes de 36 px ; pas de spinner plein écran.
export default function Loading() {
  return (
    <div role="status" className="flex flex-col">
      <span className="sr-only">Chargement…</span>
      <div className="flex h-12 items-center border-b px-5">
        <Skeleton className="h-5 w-40 rounded-md" />
      </div>
      <ul className="space-y-1 px-5 pt-4">
        {Array.from({ length: 10 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lignes identiques et fixes
          <li key={index}>
            <Skeleton className="h-9 w-full rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  );
}

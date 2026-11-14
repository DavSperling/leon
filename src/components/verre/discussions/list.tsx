import { Thing, ThingGrid } from '@/components/verre';

// « Vos discussions » : une tuile par discussion, la plus récente d'abord, qui l'ouvre. Ni date ni compteur sur la
// tuile ; la discussion se supprime depuis son en-tête ou la barre latérale (« Récentes »).
export type DiscussionRow = { id: string; title: string };

export function DiscussionTiles({ rows }: { rows: DiscussionRow[] }) {
  return (
    // deux colonnes dans la colonne du fil (736 px), une sur un téléphone
    <ThingGrid cols={3} className="grid-cols-2 max-sm:grid-cols-1">
      {rows.map((d) => (
        <Thing key={d.id} href={`/discussions/${d.id}`} name={d.title} />
      ))}
    </ThingGrid>
  );
}

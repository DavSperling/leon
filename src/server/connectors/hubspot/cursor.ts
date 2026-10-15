import { z } from 'zod';

// Le curseur : par sorte d'activité, l'instant (millisecondes) de la dernière fiche lue.
//
// HubSpot prévient que les fiches créées ou modifiées « peuvent mettre quelques instants à
// apparaître » dans la recherche : une fiche indexée avec retard, après une fiche plus récente déjà
// lue, serait perdue. On repart donc quelques minutes avant le curseur. Relire une fiche ne coûte
// rien (l'ingestion ignore le texte déjà connu), et cela règle aussi les fiches qui partagent la
// même milliseconde.
export const OVERLAP_MS = 5 * 60_000;

const Instant = z.number().int().nonnegative().optional();
const CursorSchema = z.object({
  notes: Instant,
  calls: Instant,
  meetings: Instant,
  emails: Instant,
});
export type Cursor = z.infer<typeof CursorSchema>;

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
export function readCursor(text: string | null): Cursor {
  if (text === null) return {};
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

// Début de la recherche : `since` au premier passage, ensuite le curseur reculé du délai (sans
// jamais passer avant `since`).
export function searchStart(at: number | undefined, since: Date): number {
  return at === undefined ? since.getTime() : Math.max(since.getTime(), at - OVERLAP_MS);
}

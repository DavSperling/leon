import { z } from 'zod';

// Le curseur : par sorte d'activité, la borne basse de la prochaine recherche (millisecondes), et
// `done`, le nombre de sortes déjà lues en entier dans le tour en cours.
//
// En cours de recherche, la borne est l'instant exact de la dernière fiche lue : un passage que le
// socle arrête à 200 éléments reprend là, et avance toujours. Reculer ici ferait relire les mêmes
// fiches quand plus de 200 d'entre elles tiennent dans le recul.
//
// Quand la recherche d'une sorte est finie, la borne recule de quelques minutes. HubSpot prévient en
// effet que les fiches créées ou modifiées « peuvent mettre quelques instants à apparaître » dans la
// recherche : une fiche indexée avec retard, après une fiche plus récente déjà lue, serait perdue.
// Relire une fiche ne coûte rien (l'ingestion ignore le texte déjà connu), et cela règle aussi les
// fiches qui partagent la même milliseconde. Limite connue : plus de 200 fiches sur la même
// milliseconde ne passeraient jamais sous le plafond d'un passage.
//
// `done` évite que ce recul se paie à chaque reprise : une sorte finie n'est relue qu'au tour suivant.
// Sans lui, un CRM importé d'un coup (des centaines d'activités serrées dans chaque sorte) userait le
// plafond de 200 éléments à relire les premières sortes, et les dernières ne seraient jamais atteintes.
// Il est absent entre deux tours : le suivant relit chaque sorte depuis sa borne reculée.
export const OVERLAP_MS = 5 * 60_000;

const Instant = z.number().int().nonnegative().optional();
const CursorSchema = z.object({
  notes: Instant,
  calls: Instant,
  meetings: Instant,
  emails: Instant,
  done: z.number().int().nonnegative().optional(),
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

// Début de la recherche : `since` au premier passage, ensuite le curseur tel quel (sans jamais passer
// avant `since`).
export function searchStart(at: number | undefined, since: Date): number {
  return at === undefined ? since.getTime() : Math.max(since.getTime(), at);
}

// Le curseur après une page de la recherche commencée à `start` : l'instant exact de la dernière
// fiche lue, sauf à la dernière page où il recule du délai d'indexation. Jamais avant `start`.
export function cursorAfter(start: number, reached: number, last: boolean): number {
  return Math.max(start, last ? reached - OVERLAP_MS : reached);
}

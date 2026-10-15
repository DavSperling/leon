import { z } from 'zod';

// Gong ne documente ni l'ordre de la liste des appels, ni un filtre « modifié depuis » : seulement
// une période (fromDateTime inclus, toDateTime exclu) sur l'heure de début, ou sur l'heure prévue
// pour une visioconférence. Le curseur suit donc un parcours entier d'une période, quel que soit
// l'ordre de la liste.
//   after : le début de la période, pour tout le parcours ;
//   to    : la fin de la période, fixée au début du parcours (le curseur de page de Gong ne vaut
//           qu'avec les mêmes dates) ;
//   next  : le curseur de page de Gong, pour reprendre au milieu (nul au début et à la fin) ;
//   max   : le début de l'appel le plus récent déjà vu.
// Le départ ne bouge qu'à la fin du parcours, jamais page après page.
const isoDate = z.iso.datetime();
const WalkSchema = z.object({
  after: isoDate,
  to: isoDate,
  next: z.string().nullable(),
  max: isoDate.nullable(),
});
export type Walk = z.infer<typeof WalkSchema>;

// Gong liste un appel quand il a fini de le traiter, pas à son heure de début : un appel long peut
// n'apparaître qu'après un appel plus court et plus récent, et un appel sans transcription est
// peut-être en cours de traitement. Chaque parcours relit donc les six heures qui précèdent sa fin.
// La relecture ne coûte rien en base (l'ingestion ignore les tours inchangés) et peu en requêtes.
const LOOKBACK_MS = 6 * 3600 * 1000;

// Un parcours qui commence (pas de curseur de page) prend une fin de période neuve.
export function startWalk(cursor: string | null, since: Date, now = new Date()): Walk {
  const fresh = {
    after: since.toISOString(),
    to: now.toISOString(),
    next: null,
    max: null,
  };
  if (cursor === null) return fresh;
  try {
    const parsed = WalkSchema.safeParse(JSON.parse(cursor));
    if (!parsed.success) return fresh;
    return parsed.data.next === null ? { ...parsed.data, to: fresh.to } : parsed.data;
  } catch {
    return fresh;
  }
}

// started : débuts canoniques des appels de la page (ISO, Z).
export function advance(walk: Walk, started: string[], next: string | null, since: Date): Walk {
  let { max } = walk;
  for (const at of started) max = max === null || at > max ? at : max;
  if (next !== null) return { ...walk, next, max };
  // Fin du parcours. Le début de période est inclus (doc) : le départ passe une milliseconde après
  // l'appel le plus récent, pour ne pas le relire, sans dépasser le début de la fenêtre de recul.
  // Il ne remonte jamais avant `since`.
  const afterMax = max === null ? Date.parse(walk.after) : Date.parse(max) + 1;
  const after = Math.max(since.getTime(), Math.min(afterMax, Date.parse(walk.to) - LOOKBACK_MS));
  return { after: new Date(after).toISOString(), to: walk.to, next: null, max: null };
}

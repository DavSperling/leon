import { z } from 'zod';

// Gong ne documente ni l'ordre de la liste des appels, ni un filtre « modifié depuis » : seulement
// une période (fromDateTime inclus, toDateTime exclu). Le curseur suit donc un parcours entier d'une
// période, quel que soit l'ordre de la liste.
//   after : le début de la période, pour tout le parcours ;
//   to    : la fin de la période, fixée au début du parcours (le curseur de page de Gong ne vaut
//           qu'avec les mêmes dates) ;
//   next  : le curseur de page de Gong, pour reprendre au milieu (nul au début et à la fin) ;
//   max   : le début de l'appel le plus récent déjà traité ;
//   hold  : le début du plus ancien appel récent encore sans transcription.
// Le départ ne bouge qu'à la fin du parcours, jamais page après page.
const isoDate = z.iso.datetime();
const WalkSchema = z.object({
  after: isoDate,
  to: isoDate,
  next: z.string().nullable(),
  max: isoDate.nullable(),
  hold: isoDate.nullable(),
});
export type Walk = z.infer<typeof WalkSchema>;

// Un appel sans transcription depuis moins de six heures est sans doute en cours de traitement chez Gong.
const GRACE_MS = 6 * 3600 * 1000;

// Un parcours qui commence (pas de curseur de page) prend une fin de période neuve.
export function startWalk(cursor: string | null, since: Date, now = new Date()): Walk {
  const fresh = {
    after: since.toISOString(),
    to: now.toISOString(),
    next: null,
    max: null,
    hold: null,
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

// started : début canonique de l'appel (ISO, Z) ; ready : l'appel a une transcription.
export function advance(
  walk: Walk,
  calls: Array<{ started: string; ready: boolean }>,
  next: string | null,
): Walk {
  let { max, hold } = walk;
  for (const { started, ready } of calls) {
    const waiting = !ready && Date.now() - Date.parse(started) < GRACE_MS;
    if (waiting) hold = hold === null || started < hold ? started : hold;
    else max = max === null || started > max ? started : max;
  }
  if (next !== null) return { ...walk, next, max, hold };
  // Fin du parcours. Le début de période est inclus (doc) : le départ reste sur l'appel en attente,
  // pour le relire, et passe une milliseconde après l'appel le plus récent, pour ne pas le relire.
  const afterMax = max === null ? walk.after : new Date(Date.parse(max) + 1).toISOString();
  return { after: hold ?? afterMax, to: walk.to, next: null, max: null, hold: null };
}

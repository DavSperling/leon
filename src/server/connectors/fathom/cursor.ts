import { z } from 'zod';

// Fathom ne documente ni l'ordre de la liste des réunions, ni un filtre « modifié depuis » : seulement
// created_after. Le curseur suit donc un parcours entier de la liste, quel que soit son ordre.
//   after : le created_after de tout le parcours ;
//   next  : le curseur de page de Fathom, pour reprendre au milieu (nul au début et à la fin) ;
//   max   : la création la plus récente déjà rendue ;
//   hold  : la création de la plus ancienne réunion récente encore sans texte.
// Le départ ne bouge qu'à la fin du parcours, jamais page après page.
const isoDate = z.iso.datetime();
const WalkSchema = z.object({
  after: isoDate,
  next: z.string().nullable(),
  max: isoDate.nullable(),
  hold: isoDate.nullable(),
});
export type Walk = z.infer<typeof WalkSchema>;

// Une réunion sans texte depuis moins de six heures est sans doute en cours de traitement chez Fathom.
const GRACE_MS = 6 * 3600 * 1000;

export function startWalk(cursor: string | null, since: Date): Walk {
  const fresh = { after: since.toISOString(), next: null, max: null, hold: null };
  if (cursor === null) return fresh;
  try {
    const parsed = WalkSchema.safeParse(JSON.parse(cursor));
    return parsed.success ? parsed.data : fresh;
  } catch {
    return fresh;
  }
}

// created : date de création canonique (ISO, Z) ; ready : la réunion a du texte.
export function advance(
  walk: Walk,
  meetings: Array<{ created: string; ready: boolean }>,
  next: string | null,
): Walk {
  let { max, hold } = walk;
  for (const { created, ready } of meetings) {
    const waiting = !ready && Date.now() - Date.parse(created) < GRACE_MS;
    if (waiting) hold = hold === null || created < hold ? created : hold;
    else max = max === null || created > max ? created : max;
  }
  if (next !== null) return { ...walk, next, max, hold };
  // Fin du parcours. Le départ s'arrête une seconde avant la réunion en attente, car created_after
  // peut être exclusif (non vérifié) : sans cela, elle ne reviendrait jamais.
  const before = hold === null ? null : new Date(Date.parse(hold) - 1000).toISOString();
  return { after: before ?? max ?? walk.after, next: null, max: null, hold: null };
}

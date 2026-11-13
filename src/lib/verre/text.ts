// Surlignages (marqueurs posés par Postgres) et renvois « [n] » : ceux de src/lib (déjà testés), sous les noms de la
// maquette.
export { splitHighlights } from '@/lib/highlight';
export { referenceSegments } from '@/lib/references';

/** Sans casse ni accent, espaces insécables (nb()) ramenées à l'espace : « Réunion » et « reunion » se confondent. */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .toLowerCase();

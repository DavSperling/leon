const SLUG_MAX_CHARS = 60;

// « Dupont Rénovation » → « dupont-renovation » : ASCII [a-z0-9-], sans tiret au bord.
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_CHARS)
    .replace(/-+$/, '');
}

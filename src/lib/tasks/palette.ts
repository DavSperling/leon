// Couleurs proposées pour les étiquettes et les statuts. Ce sont des choix de l'utilisateur, stockés
// en base : elles ne viennent pas des jetons du thème.
export const COLOR_PALETTE = [
  '#dc2626',
  '#7c3aed',
  '#2563eb',
  '#16a34a',
  '#ca8a04',
  '#db2777',
  '#0891b2',
  '#d97706',
  '#059669',
  '#4f46c8',
  '#6b7280',
  '#9ca3af',
] as const;

// La première couleur que `taken` n'utilise pas ; une fois la palette épuisée, on la reprend.
export function nextColor(taken: readonly string[]): string {
  return (
    COLOR_PALETTE.find((color) => !taken.includes(color)) ??
    COLOR_PALETTE[taken.length % COLOR_PALETTE.length] ??
    COLOR_PALETTE[0]
  );
}

// Le nom de chaque couleur, pour les lecteurs d'écran : une pastille n'a pas d'autre intitulé.
export const COLOR_NAMES = {
  '#dc2626': 'Rouge',
  '#7c3aed': 'Violet',
  '#2563eb': 'Bleu',
  '#16a34a': 'Vert',
  '#ca8a04': 'Jaune',
  '#db2777': 'Rose',
  '#0891b2': 'Cyan',
  '#d97706': 'Orange',
  '#059669': 'Émeraude',
  '#4f46c8': 'Indigo',
  '#6b7280': 'Gris',
  '#9ca3af': 'Gris clair',
} as const satisfies Record<(typeof COLOR_PALETTE)[number], string>;

export const colorName = (hex: string): string =>
  (COLOR_NAMES as Record<string, string>)[hex] ?? hex;

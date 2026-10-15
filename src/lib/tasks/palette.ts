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
